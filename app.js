// src/app.js
require('dotenv').config(); // Load environment variables at the very start

const ingestionService = require('./services/ingestion.service');
const queueService = require('./services/queue.service');
const triageWorker = require('./workers/triage.worker');
const extractionWorker = require('./workers/extraction.worker');

// CORE LOGIC: Initialize and connect services
function initializeSystem() {
    console.log("--- System Initialization Started ---");
    
    // 1. Inject the Queue Service dependency into the Ingestion Service
    // This solves the circular dependency issue and makes services swappable!
    ingestionService.setQueueService(queueService); 
    
    // 2. Start the Ingestion Poller (The Producer)
    const interval = parseInt(process.env.INGESTION_INTERVAL_MS || '60000');
    ingestionService.startIngestionPoller(interval); 

    // 3. Start the Consumer Worker (The Processor)
    // We'll pass the queue service to the worker as well
    triageWorker.startTriageWorker(queueService); 
    extractionWorker.startExtractionWorker(queueService);

    console.log("--- System Running ---");
}

initializeSystem();