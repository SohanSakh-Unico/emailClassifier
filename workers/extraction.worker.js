// src/workers/extraction.worker.js
const deepExtractorService = require('../services/classifier_service/deepExtractor.service');
const dbService = require('../services/db.service'); 

const CONSUMER_DELAY_MS = 100;

function startExtractionWorker(queueService) {
    console.log("[Extraction Worker] Deep extraction worker started.");

    const processNextDeepJob = async () => {
        const job = await queueService.popFromDeepQueue(); // Pulls the payload: { oldMail_JSONStructure, triageObject }

        if (job) {
            // 1. Defensively Destructure the payload!
            const { oldMail_JSONStructure, triageObject } = job;
            
            // USE OPTIONAL CHAINING TO PREVENT CRASH IF oldMail_JSONStructure IS UNDEFINED/NULL
            const leadId = oldMail_JSONStructure?.emailId || 'UNKNOWN_ID';
            
            console.log(`[Deep Worker] Processing Lead ID: ${leadId}.`);
            
            try {
                // Check if the essential raw data is present before making the expensive AI call
                if (!oldMail_JSONStructure || !oldMail_JSONStructure.rawText) {
                    throw new Error("Missing essential raw mail data for extraction.");
                }

                // 2. DEEP EXTRACTION (Tier 2 AI Call)
                const extractionResult = await deepExtractorService.extract(oldMail_JSONStructure.rawText);

                // 3. POST-PROCESSING (DB Lookup, Rules)
                const requesterEmail = oldMail_JSONStructure.senderEmail;
                const isExistingCustomer = await dbService.checkIfRequesterExists(requesterEmail);
                
                // 4. FINALIZE DTO (The complete, structured output)
                const finalRecord = {
                    ...extractionResult,
                    processing_metadata: {
                        triage_intent: triageObject.initial_intent_type,
                        triage_decision: triageObject.is_reservation_lead, // Include the triage boolean
                        is_existing_customer: isExistingCustomer,
                    },
                };

                // 5. PERSISTENCE (Final Step - The Complete Deal)
                // We pass BOTH the final extraction result and the original mail data
                await dbService.saveFinalResult(finalRecord, oldMail_JSONStructure, triageObject);

                console.log(`[Deep Worker] ✅ Job ${leadId} complete. Saved to storage.`);
                setImmediate(processNextDeepJob); 
                
            } catch (error) {
                // Use optional chaining here too to prevent a crash inside the crash handler
                console.error(`[Deep Worker ERROR] Failed job ${leadId}:`, error.message);
                // In a real system, we'd push this to a Dead Letter Queue (DLQ)
                setTimeout(processNextDeepJob, 5000); 
            }
        } else {
            setTimeout(processNextDeepJob, CONSUMER_DELAY_MS);
        }
    };
    processNextDeepJob();
}

module.exports = {
    startExtractionWorker
};