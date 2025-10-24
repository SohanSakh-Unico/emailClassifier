// src/app.js
require('dotenv').config(); // Load environment variables at the very start
const express = require('express'); // 👈 Import Express
const path = require('path');       // 👈 Import Path for absolute paths

const ingestionService = require('./services/ingestion.service');
const queueService = require('./services/queue.service');
const triageWorker = require('./workers/triage.worker');
const extractionWorker = require('./workers/extraction.worker');

// --- EXPRESS APP SETUP (Runs First) ---
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static dashboard files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public'))); 

// CRITICAL: Create a virtual path '/data' to serve the poc_extracted_data.jsonl file
// process.cwd() is the project root, where the JSONL file is created by db.service.js
app.use('/data', express.static(path.join(process.cwd()))); 
// The dashboard will fetch the results from: /data/poc_extracted_data.jsonl

// CORE LOGIC: Initialize and connect services
function initializeSystem() {
    console.log("--- System Initialization Started ---");
    
    // 1. Inject the Queue Service dependency into the Ingestion Service
    // This solves the circular dependency issue and makes services swappable!
    ingestionService.setQueueService(queueService); 
    
    // 2. Start the Ingestion Poller (The Producer)
    const interval = parseInt(process.env.INGESTION_INTERVAL_MS || '60000');
    ingestionService.startIngestionPoller(interval); 

    // 3. Start the Consumer Workers (The Processors)
    // Sequence remains the same: Triage then Extraction
    triageWorker.startTriageWorker(queueService); 
    extractionWorker.startExtractionWorker(queueService);

    console.log("--- System Running ---");
    
    // START THE EXPRESS SERVER (Final step of initialization)
    app.listen(PORT, () => {
        console.log(`[Express] Dashboard available at http://localhost:${PORT}`);
    });
}

initializeSystem();