// src/services/queue.service.js - MODIFIED
const INCOMING_QUEUE = []; // Queue 1: Raw emails (from IMAP)
const DEEP_EXTRACTION_QUEUE = []; // Queue 2: Triage-passed leads

// PUSH functions
async function pushToIncomingQueue(emailData) {
    INCOMING_QUEUE.push(emailData);
    console.log(`[Queue 1] PUSHED: Email ID ${emailData.emailId}. Size: ${INCOMING_QUEUE.length}`);
    return true;
}

async function pushToDeepQueue(jobData) {
    // jobData now contains { oldMail_JSONStructure, triageObject }
    DEEP_EXTRACTION_QUEUE.push(jobData);
    console.log(`[Queue 2] PUSHED: Lead ${jobData.oldMail_JSONStructure.emailId}. Size: ${DEEP_EXTRACTION_QUEUE.length}`);
    return true;
}

// PULL functions
async function popFromIncomingQueue() {
    const job = INCOMING_QUEUE.shift();
    // No change for the worker pulling from Queue 1 (Triage)
    return job || null;
}

async function popFromDeepQueue() {
    const job = DEEP_EXTRACTION_QUEUE.shift();
    // This is what the NEW Extraction Worker will call
    if (job) {
        console.log(`[Queue 2] PULLED: Lead ${job.oldMail_JSONStructure.emailId}. Remaining: ${DEEP_EXTRACTION_QUEUE.length}`);
    }
    return job || null;
}

module.exports = {
    pushToIncomingQueue, 
    popFromIncomingQueue, // Used by Triage Worker
    pushToDeepQueue,      // Used by Triage Worker (on success)
    popFromDeepQueue,     // Used by Deep Extraction Worker
    // ...
};