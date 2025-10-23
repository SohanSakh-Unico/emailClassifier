// src/services/ingestion.service.js
const Imap = require('imap');
const { simpleParser } = require('mailparser');
// Assuming queueService is available, we'll mock it for now, 
// and inject the real one in our app.js later to avoid circular dependencies.
let queueService = null;

// Configuration for IMAP connection
const imapConfig = {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASS,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    tls: process.env.IMAP_TLS === 'true',
    connTimeout: 30000,
    authTimeout: 20000,
    // Set a flag to reject unauthorized connections for better security
    tlsOptions: { rejectUnauthorized: false }
};

/**
 * Connects to IMAP, searches for UNSEEN emails, parses them, 
 * pushes them to the queue, and marks them as seen.
 */
function fetchAndProcessEmails() {
    return new Promise((resolve, reject) => {
        const imap = new Imap(imapConfig);
        const emailsToProcess = [];

        // 1. Connection Ready
        imap.once('ready', () => {
            console.log("[Ingestion] IMAP connection READY. Opening INBOX...");
            // Open INBOX, 'false' means we can write/change flags (e.g., mark as read)
            imap.openBox('INBOX', false, (err, box) => {
                if (err) return reject(new Error("Failed to open INBOX: " + err.message));

                // 2. Search for Unseen Emails
                // We'll search for 'UNSEEN' and could add criteria like 'SINCE [Date]'
                // For the PoC, let's process all currently UNSEEN
                imap.search(['UNSEEN'], (err, results) => {
                    if (err) return reject(new Error("IMAP Search error: " + err.message));

                    if (results.length === 0) {
                        console.log("[Ingestion] No new unread emails found. Closing connection.");
                        imap.end();
                        return resolve(0);
                    }

                    console.log(`[Ingestion] Found ${results.length} new message(s). Starting fetch...`);

                    // 3. Fetch the Email Content
                    // Fetch full body ('' means all parts) and attributes (UID for marking as seen)
                    const fetch = imap.fetch(results, { bodies: '', attributes: 'UID' });

                    // src/services/ingestion.service.js (Inside fetchAndProcessEmails, within the imap.fetch)

                    fetch.on('message', (msg, seqno) => {
                        // 1. Initialize the message data container and a flag for safety
                        const emailData = { emailId: null, senderEmail: null, subject: null, rawText: null, timestamp: null, uid: null };
                        let processed = false;

                        // 2. Event: Get the Unique ID (UID) first.
                        msg.once('attributes', (attrs) => {
                            emailData.uid = attrs.uid;
                            // Use UID as the unique identifier for our system (emailId)
                            emailData.emailId = attrs.uid ? attrs.uid.toString() : null;
                        });

                        // 3. Event: Get the Email Body Stream and Parse it.
                        msg.on('body', (stream) => {
                            // Parse the raw stream into a readable object
                            simpleParser(stream, async (err, parsed) => {
                                if (err) {
                                    console.error(`[Ingestion] Parsing error for seqno ${seqno}:`, err.message);
                                    return;
                                }

                                // Map the parsed data to our standard DTO
                                emailData.senderEmail = parsed.from.value[0].address;
                                emailData.subject = parsed.subject;
                                emailData.rawText = parsed.text; // Prioritize text over HTML
                                emailData.timestamp = parsed.date.toISOString();

                                // 4. CRITICAL FIX: Ensure UID is available and message hasn't been processed
                                if (emailData.uid && !processed) {
                                    console.log(`[Ingestion] Successfully parsed email ${emailData.emailId}. Pushing to queue...`);

                                    // Add to the local list (optional, for logging the total count)
                                    emailsToProcess.push(emailData);

                                    // A. PUSH TO QUEUE (Decoupling)
                                    await queueService.pushToIncomingQueue(emailData);

                                    // B. MARK AS SEEN (State Management - SAFE now that UID is confirmed)
                                    imap.addFlags([emailData.uid], ['\\Seen'], (err) => {
                                        if (err) console.error(`[Ingestion] Failed to mark email ${emailData.uid} as Seen:`, err.message);
                                    });

                                    processed = true; // Set flag to prevent double-processing if events fire oddly
                                } else if (!emailData.uid) {
                                    // Should not happen, but serves as a safety net
                                    console.error(`[Ingestion CRITICAL] Skipped email ${seqno} due to missing UID.`);
                                }
                            });
                        });
                    });

                    fetch.once('end', () => {
                        console.log("[Ingestion] Done fetching all messages! All marked as seen.");
                        imap.end();
                        resolve(results.length);
                    });

                    fetch.once('error', (err) => {
                        reject(new Error("IMAP Fetch error: " + err.message));
                    });
                });
            });
        });

        // Handle IMAP connection closure or error
        imap.once('error', (err) => {
            console.error("[Ingestion ERROR] IMAP connection error:", err.message);
            reject(err);
        });

        imap.once('end', () => {
            console.log("[Ingestion] IMAP Connection closed.");
        });

        imap.connect();
    });
}

/**
 * Runs the ingestion job on a loop (Simulating a Cron Job or Poller)
 */
async function startIngestionPoller(intervalMs = 60000) {
    if (!queueService) {
        console.error("[CRITICAL] Queue Service not set. Cannot start poller.");
        return;
    }
    console.log(`[Ingestion] Starting email poller. Running every ${intervalMs / 1000} seconds.`);

    // Run immediately, then start the interval
    await fetchAndProcessEmails().catch(e => console.error(e.message));

    // Set up the recurring poll
    // setInterval(() => {
    //     fetchAndProcessEmails().catch(e => console.error(e.message));
    // }, intervalMs);
}


/**
 * Sets the Queue Service dependency. This is how we avoid circular imports!
 * @param {object} service - The initialized queue service module.
 */
function setQueueService(service) {
    queueService = service;
}

module.exports = {
    startIngestionPoller,
    setQueueService,
};