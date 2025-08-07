// note_list_scraper.js - Injected into the "View All" notes page to scrape the full list of note URLs.
const logger = globalThis.psmhLogger;
logger.info("NOTES_LOG (Scraper): Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 */
function waitForElement(selector, baseElement = document, timeout = 10000) {
    logger.info(`NOTES_LOG (Scraper): Waiting for element: "${selector}"`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.info(`NOTES_LOG (Scraper): Found element for selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`NOTES_LOG (Scraper): Timeout waiting for element: "${selector}"`);
                clearInterval(interval);
                resolve(null);
            }
        }, 250);
    });
}

/**
 * Waits for the table rows to fully load by checking against the count in the status text.
 */
async function waitForAllRows(dataTable, expectedCount) {
    logger.info(`NOTES_LOG (Scraper): Now waiting for table to contain ${expectedCount} rows.`);
    const timeout = 15000; // Increased timeout to 15 seconds
    const startTime = Date.now();
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const currentCount = dataTable.querySelectorAll('tbody tr[data-row-key-value]').length;
            logger.info(`NOTES_LOG (Scraper): Waiting... Current row count: ${currentCount} / Expected: ${expectedCount}`);
            if (currentCount >= expectedCount) {
                clearInterval(interval);
                logger.info(`NOTES_LOG (Scraper): Row count matches expected. Proceeding.`);
                resolve(true);
            }
            if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                logger.warn(`NOTES_LOG (Scraper): Timeout waiting for all rows to load. Proceeding with ${currentCount} rows.`);
                resolve(false);
            }
        }, 500);
    });
}


/**
 * Scrapes the full list of notes from the "View All" page.
 */
async function scrapeNoteList() {
    logger.info("NOTES_LOG (Scraper): Starting scrape of full note list.");
    const results = [];
    const config = {
        dataTableSelector: 'lightning-datatable table[aria-label="Notes"]',
        statusSelector: 'force-list-view-manager-status-info span.countSortedByFilteredBy',
        rowSelector: 'tbody tr[data-row-key-value]',
        urlSelector: 'th[scope="row"] a[href*="/lightning/r/"]',
        dateSelector: 'td[data-label="Created Date"] lst-formatted-text span'
    };

    const dataTable = await waitForElement(config.dataTableSelector);
    if (!dataTable) {
        logger.error(`NOTES_LOG (Scraper): Could not find the main data table with selector: "${config.dataTableSelector}"`);
        chrome.runtime.sendMessage({ type: 'noteListScrapeResult', data: [] });
        return;
    }
    logger.info("NOTES_LOG (Scraper): Found main data table element:", dataTable);


    const statusElement = await waitForElement(config.statusSelector);
    let expectedCount = 0;
    if (statusElement) {
        logger.info("NOTES_LOG (Scraper): Found status element:", statusElement, "with textContent:", statusElement.textContent);
        const match = statusElement.textContent.match(/(\d+)\s*item/);
        if (match) {
            expectedCount = parseInt(match[1], 10);
            logger.info(`NOTES_LOG (Scraper): Parsed expected row count: ${expectedCount}.`);
            await waitForAllRows(dataTable, expectedCount);
        } else {
            logger.warn("NOTES_LOG (Scraper): Could not parse number of items from status text.");
        }
    } else {
        logger.warn("NOTES_LOG (Scraper): Could not find status element to determine expected row count. Scraping what's visible.");
    }
    
    logger.info(`NOTES_LOG (Scraper): Querying for all rows with selector: "${config.rowSelector}"`);
    const rows = dataTable.querySelectorAll(config.rowSelector);
    logger.info(`NOTES_LOG (Scraper): Found ${rows.length} row elements to process:`, rows);

    rows.forEach((row, index) => {
        logger.info(`NOTES_LOG (Scraper): --- Processing Row ${index + 1} ---`, row);
        
        logger.info(`NOTES_LOG (Scraper): Searching for URL with selector: "${config.urlSelector}"`);
        const urlElement = row.querySelector(config.urlSelector);
        logger.info("NOTES_LOG (Scraper): Found URL element:", urlElement);
        
        logger.info(`NOTES_LOG (Scraper): Searching for Date with selector: "${config.dateSelector}"`);
        const dateElement = row.querySelector(config.dateSelector);
        logger.info("NOTES_LOG (Scraper): Found Date element:", dateElement);

        if (urlElement && dateElement) {
            const url = new URL(urlElement.getAttribute('href'), window.location.origin).href;
            const dateStr = dateElement.title || dateElement.textContent?.trim();
            logger.info(`NOTES_LOG (Scraper): Row ${index + 1} SCRAPED -> URL: ${url}, Date: ${dateStr}`);
            results.push({ type: 'Note', url, dateStr });
        } else {
            logger.warn(`NOTES_LOG (Scraper): A row was found, but the URL or Date selector failed.`, {row, urlElement, dateElement});
        }
    });

    logger.info(`NOTES_LOG (Scraper): Successfully scraped ${results.length} note URLs. Sending to background.`);
    chrome.runtime.sendMessage({ type: 'noteListScrapeResult', data: results });
}

scrapeNoteList();

// End of file
