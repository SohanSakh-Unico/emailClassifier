// src/workers/triage.worker.js (The consumer for the Incoming Queue)
const triageClassifierService = require('../services/classifier_service/triageClassifier.service');

const WORKER_DELAY_MS = 100; // Small delay to prevent CPU spinning when queue is empty

/**
 * Starts the worker process to continuously pull jobs from the Incoming Queue,
 * run Triage AI, and push confirmed leads to the Deep Extraction Queue.
 * * @param {Object} queueService - The initialized queue service module (must support pushToDeepQueue).
 */
function startTriageWorker(queueService) {
    console.log("[Triage Worker] Started. Consuming from Incoming Queue (Queue 1).");

    // Define the continuous loop function
    const processNextJob = async () => {
        let emailJob = null;
        try {
            // 1. PULL RAW DTO FROM QUEUE 1 (Incoming Queue)
            emailJob = await queueService.popFromIncomingQueue();

            if (emailJob) {
                console.log(`[Triage Worker] Processing Job ID: ${emailJob.emailId}.`);
                
                // --- 2. TIER 1: TRIAGE CLASSIFICATION ---
                // The AI determines if this is a valuable lead or noise.
                const triageObject = await triageClassifierService.triageEmail(emailJob);
                
                const isLead = triageObject.is_reservation_lead;

                // --- 3. CONDITIONAL PUSH TO QUEUE 2 ---
                if (isLead) {
                    console.log(`[Triage Worker] ✅ Lead detected. Intent: ${triageObject.initial_intent_type}. Pushing to Deep Queue (Queue 2).`);

                    // Create the job payload for the next stage
                    const jobPayload = {
                        oldMail_JSONStructure: emailJob, // Full raw data for the extractor
                        triageObject: triageObject         // Triage result/metadata
                    };

                    // PUSH to the second queue
                    await queueService.pushToDeepQueue(jobPayload);

                } else {
                    // Log the discarded mail (Noise/Spam)
                    console.log(`[Triage Worker] ❌ Noise detected. Intent: ${triageObject.initial_intent_type}. Discarding job.`);
                }

                // If job was processed successfully (triage completed), immediately look for the next one
                setImmediate(processNextJob); 
                
            } else {
                // Queue 1 is empty: wait a moment, then check again.
                setTimeout(processNextJob, WORKER_DELAY_MS);
            }
        } catch (error) {
            console.error(`[Triage Worker ERROR] An unhandled error occurred for Job ${emailJob?.emailId || 'N/A'}:`, error.message);
            // Wait a moment before trying again to avoid rapid failure loop
            setTimeout(processNextJob, 5000); 
        }
    };

    // Start the continuous loop
    processNextJob();
}

module.exports = {
    startTriageWorker
};