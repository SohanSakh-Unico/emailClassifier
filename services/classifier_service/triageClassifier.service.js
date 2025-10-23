// src/services/classifier_services/triageClassifier.service.js
let GoogleGenAI;
let Type;
let ai; // Declare ai in the outer scope as well
let TRIAGE_RESPONSE_SCHEMA; // Declare schema in the outer scope
const TRIAGE_MODEL = 'gemini-2.5-flash';

// --- ASYNC IIFE for Initialization (The Fix for Scope) ---
( async () => { 
    // CRITICAL FIX: Removed 'let' inside the destructuring so we assign to the outer scope.
    let geminiModule = await import('@google/genai');
    GoogleGenAI = geminiModule.GoogleGenAI;
    Type = geminiModule.Type;

    // Initialize the Gemini Client inside the async block
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Define the schema using the now-available Type enum
    TRIAGE_RESPONSE_SCHEMA = {
        type: Type.OBJECT,
        required: ["triage_email_lead"],
        properties: {
            triage_email_lead: {
                type: Type.OBJECT,
                required: ["is_reservation_lead", "initial_intent_type"],
                properties: {
                    is_reservation_lead: { type: Type.BOOLEAN },
                    initial_intent_type: {
                        type: Type.STRING,
                        enum: ["RFQ", "FOLLOW_UP", "NOISE_SPAM", "COMPLAINT", "OTHER"],
                    },
                },
            },
        },
    };
    
    console.log("[TriageService] Initialization complete and client configured.");

})().catch(err => {
    console.error("CRITICAL: TriageService failed to initialize Gemini client.", err.message);
    throw err; 
});

/**
 * Generates the System Instruction for the Triage Agent.
 * @param {Object} emailJob - The raw DTO from the IMAP Ingestion.
 * @returns {string} The detailed prompt.
 */
function buildTriagePrompt(emailJob) {
    // We pass the full job JSON for maximum context, letting the model decide what's relevant.
    return `You are an **Extremely Fast and Accurate Triage Evaluator** responsible for identifying the intent of an email. Your job is to strictly analyze the provided email and output a single JSON object.

**YOUR SOLE TASK:** Determine if this email is a genuine reservation lead, quote request, or a follow-up related to a booking.

**LOGIC FOR FIELDS:**
1.  **is_reservation_lead:** Set to true ONLY if the email is a clear request for pricing, dates, availability, or a follow-up/modification to an existing reservation. Set to false for everything else (JIRA notifications, newsletters, internal memos, generic complaints).
2.  **initial_intent_type:** Classify the specific lead type. Use 'NOISE_SPAM' for automated/unwanted mail.

---
**FULL EMAIL JSON TO ANALYZE:**
${JSON.stringify(emailJob, null, 2)}
`;
}


/**
 * Performs a fast classification to determine if an email is a valid lead.
 * @param {Object} emailJob - The raw DTO from the IMAP Ingestion.
 * @returns {Promise<Object>} The structured triage result.
 */
async function triageEmail(emailJob) {
    const prompt = buildTriagePrompt(emailJob);

    try {
        const response = await ai.models.generateContent({
            model: TRIAGE_MODEL,
            config: {
                responseMimeType: 'application/json',
                responseSchema: TRIAGE_RESPONSE_SCHEMA,
                systemInstruction: prompt,
                // Do not include the prompt in the contents, it's already in systemInstruction
            },
            contents: [
                { role: 'user', parts: [{ text: "Evaluate the provided email content based on your system instructions and return ONLY the JSON object." }] }
            ],
        });

        // The response text is the raw JSON string which we must parse.
        const jsonString = response.text.trim();
        const parsedResponse = JSON.parse(jsonString);
        
        // Return the nested result object directly, e.g., { is_reservation_lead: true, ... }
        return parsedResponse.triage_email_lead; 

    } catch (error) {
        console.error(`[Triage ERROR] AI Service call failed for ID ${emailJob.emailId}:`, error.message);
        // Safety: If the triage system fails, we default to FALSE to prevent crashing the queue
        return { is_reservation_lead: false, initial_intent_type: "FAILURE" }; 
    }
}

module.exports = { triageEmail };