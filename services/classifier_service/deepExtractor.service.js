// src/services/classifier_services/deepExtractor.service.js
let ai;
let Type;
let EXTRACTOR_RESPONSE_SCHEMA;
const EXTRACTOR_MODEL = 'gemini-2.5-flash'; // Higher capability for complex extraction/inference

// --- ASYNC IIFE for Initialization (The Fix for Scope) ---
(async () => {
    try {
        // 1. Dynamic Import (The FIX)
        const geminiModule = await import('@google/genai');
        
        // 2. Assign to external scope variables
        const GoogleGenAI = geminiModule.GoogleGenAI;
        Type = geminiModule.Type;
        
        // 3. Initialize AI Client
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // 4. Define Schema using the now-available Type enum
        EXTRACTOR_RESPONSE_SCHEMA = {
            type: Type.OBJECT,
            required: ["extract_reservation_details"],
            properties: {
                extract_reservation_details: {
                    type: Type.OBJECT,
                    required: [
                        "intent", "confidence_score", "stay_dates", 
                        "accommodation", "hotel_preference", "requester_details"
                    ],
                    properties: {
                        intent: {
                            type: Type.STRING,
                            enum: ["NEW_RFQ", "FOLLOW_UP_ORDER", "NEW_RFQ_AFTER_PREVIOUS", "CANCELLATION", "OTHER_INQUIRY"],
                        },
                        confidence_score: { type: Type.NUMBER },
                        stay_dates: {
                            type: Type.OBJECT,
                            required: ["check_in_date", "check_out_date", "num_nights"],
                            properties: {
                                check_in_date: { type: Type.STRING },
                                check_out_date: { type: Type.STRING },
                                num_nights: { type: Type.INTEGER },
                            },
                        },
                        accommodation: {
                            type: Type.OBJECT,
                            required: ["num_people", "num_rooms", "board_basis"],
                            properties: {
                                num_people: { type: Type.INTEGER },
                                num_rooms: { type: Type.INTEGER },
                                board_basis: { type: Type.STRING, enum: ["RO", "BB", "HB", "FB", "AI", "UNKNOWN"] },
                            },
                        },
                        hotel_preference: {
                            type: Type.OBJECT,
                            required: ["name", "star_rating"],
                            properties: {
                                name: { type: Type.STRING, nullable: true }, 
                                star_rating: { type: Type.INTEGER, nullable: true }, 
                            },
                        },
                        requester_details: {
                            type: Type.OBJECT,
                            required: ["full_name", "organization"],
                            properties: {
                                full_name: { type: Type.STRING },
                                organization: { type: Type.STRING, nullable: true },
                            },
                        },
                    },
                },
            },
        };
        
        console.log("[DeepExtractorService] Initialization complete and client configured.");

    } catch (err) {
        console.error("CRITICAL: DeepExtractorService failed to initialize Gemini client.", err.message);
        throw err; 
    }
})();

/**
 * Generates the System Instruction for the Deep Extraction Agent.
 * @param {string} rawText - The raw email body text.
 * @returns {string} The detailed prompt.
 */
function buildExtractorPrompt(rawText) {
    return `You are the **Master Data Extraction Agent**. Your sole task is to analyze the full email text and strictly populate the 'extract_reservation_details' object. You are operating on an email that has already been confirmed as a genuine lead.

**MANDATORY INFERENCE AND LOGIC:**
1.  **Date Inference:** All dates MUST be in YYYY-MM-DD format. Calculate check_out_date if the number of nights is provided.
2.  **Room Inference:** The 'num_rooms' is **MANDATORY**. If not explicit, calculate it from 'num_people' assuming **2 people per room, rounding up.**
3.  **Board Basis Mapping:** Map natural language (e.g., 'just breakfast', 'no meals') to the strict ENUM codes ('BB', 'RO', 'FB', 'AI'). Use 'UNKNOWN' if specification is missing.
4.  **Failure:** You **MUST NOT** make any field optional. Use **null** (for nullable fields like name) or the appropriate **ENUM default (UNKNOWN)** to maintain the required structure.

---
**RAW EMAIL TEXT TO ANALYZE (Full Content):**
${rawText}
`;
}


/**
 * Performs deep extraction and inference on a confirmed lead email.
 * @param {string} rawText - The raw email body text.
 * @returns {Promise<Object>} The structured extraction result.
 */
async function extract(rawText) {
    const prompt = buildExtractorPrompt(rawText);

    try {
        const response = await ai.models.generateContent({
            model: EXTRACTOR_MODEL,
            config: {
                responseMimeType: 'application/json',
                responseSchema: EXTRACTOR_RESPONSE_SCHEMA,
                systemInstruction: prompt,
            },
            contents: [
                { role: 'user', parts: [{ text: "Extract all required data points from the email below and return the JSON object." }] }
            ],
        });

        const jsonString = response.text.trim();
        const parsedResponse = JSON.parse(jsonString);

        // Return the nested result object directly
        return parsedResponse.extract_reservation_details;

    } catch (error) {
        console.error(`[Extractor ERROR] AI Service call failed:`, error.message);
        // IMPORTANT: Return a standardized failure object to maintain the contract
        return {
            intent: "FAILURE_REVIEW_NEEDED",
            confidence_score: 0.0,
            stay_dates: { check_in_date: null, check_out_date: null, num_nights: 0 },
            accommodation: { num_people: 0, num_rooms: 0, board_basis: "UNKNOWN" },
            hotel_preference: { name: null, star_rating: null },
            requester_details: { full_name: "ERROR", organization: null },
        };
    }
}

module.exports = { extract };