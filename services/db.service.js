// src/services/db.service.js
const fs = require('fs/promises');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'poc_extracted_data.jsonl');

/**
 * PoC Placeholder for Requester Check.
 * Simply returns a boolean without actual DB access, confirming the check ran.
 */
async function checkIfRequesterExists(email) {
    // In a real app, this would be a SELECT query to PostgreSQL
    // For the PoC, we confirm the check happens and return a placeholder result.
    await new Promise(resolve => setTimeout(resolve, 5));
    return Math.random() > 0.5; // Placeholder logic: 50% chance they exist
}

/**
 * PoC Persistence Function: Writes a combined record to a JSONL file.
 * * @param {Object} finalRecord - The final processed DTO (AI data + Post-processing metadata).
 * @param {Object} originalMailData - The raw DTO from IMAP (emailId, senderEmail, subject, rawText).
 * @param {Object} triageResult - The decision made by the Tier 1 Triage Agent. // <--- NEW ARGUMENT
 */
async function saveFinalResult(finalRecord, originalMailData, triageResult) {
    
    // Structure the complete record (The Complete Deal)
    const completeDeal = {
        // 1. Original Mail Metadata (email, subject, body, time)
        emailId: originalMailData.emailId,
        senderEmail: originalMailData.senderEmail,
        subject: originalMailData.subject,
        rawText: originalMailData.rawText,
        ingestionTimestamp: originalMailData.timestamp,
        
        // 2. Triage Decision Record (The Triage Object)
        triageRecord: triageResult,

        // 3. Final Extracted JSON Object (AI + Post-processing)
        extractedData: finalRecord
    };

    // Convert the record to a JSON string and append a newline
    const jsonlRecord = JSON.stringify(completeDeal) + '\n';
    
    try {
        await fs.appendFile(OUTPUT_FILE, jsonlRecord, 'utf8');
        console.log(`[DB Service] Successfully saved final record for ID: ${originalMailData.emailId}`);
    } catch (error) {
        // ... (Error handling) ...
        throw new Error("Persistence failed."); 
    }
}

module.exports = {
    checkIfRequesterExists,
    saveFinalResult
};