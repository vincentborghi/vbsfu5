// email_list_scraper.js - Injected into the "View All" emails page to scrape the full list of email URLs.
const logger = globalThis.psmhLogger;
logger.info("Email List Scraper: Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 */
function waitForElement(selector, baseElement = document, timeout = 10000) {
    logger.debug(`Email List Scraper: Waiting for "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.debug(`Email List Scraper: Found "${selector}"`);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`Email List Scraper: Timeout waiting for "${selector}" in ${document.URL}`);
                clearInterval(interval);
                resolve(null);
            }
        }, 250);
    });
}

/**
 * Scrapes the full list of emails from the "View All" page.
 */
async function scrapeEmailList() {
    logger.info("scrapeEmailList: Starting scrape of full email list.");
    const results = [];
    const config = {
        dataTableSelector: 'table.uiVirtualDataTable[aria-label="Emails"]',
        rowSelector: 'tbody tr',
        urlSelector: 'th[scope="row"] a.outputLookupLink',
        dateSelector: 'td span.uiOutputDateTime'
    };

    const dataTable = await waitForElement(config.dataTableSelector);
    if (!dataTable) {
        logger.error(`scrapeEmailList: Could not find the main data table with selector: "${config.dataTableSelector}"`);
        chrome.runtime.sendMessage({ type: 'emailListScrapeResult', data: [] });
        return;
    }

    const rows = dataTable.querySelectorAll(config.rowSelector);
    logger.debug(`scrapeEmailList: Found ${rows.length} rows in the table.`);

    rows.forEach(row => {
        const urlElement = row.querySelector(config.urlSelector);
        const dateElement = row.querySelector(config.dateSelector);

        if (urlElement && dateElement) {
            results.push({
                type: 'Email',
                url: new URL(urlElement.getAttribute('href'), window.location.origin).href,
                dateStr: (dateElement.title || dateElement.textContent?.trim())
            });
        }
    });

    logger.info(`scrapeEmailList: Successfully scraped ${results.length} email URLs. Sending to background.`);
    chrome.runtime.sendMessage({ type: 'emailListScrapeResult', data: results });
}

scrapeEmailList();

// End of file
