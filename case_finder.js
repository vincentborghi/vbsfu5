// case_finder.js - Injected into the report tab to find the Case ID.
const logger = globalThis.psmhLogger;
logger.info("Case Finder: Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=15000] - Timeout in ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 15000) {
    logger.debug(`Waiting for selector "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.debug(`Found element matching selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`Timeout waiting for "${selector}" in ${document.URL}`);
                clearInterval(interval);
                resolve(null);
            }
        }, 250);
    });
}

/**
 * Finds the currently active panel within the Salesforce UI.
 * @returns {Promise<HTMLElement|null>} The active panel element or null.
 */
async function findActivePanel() {
    logger.debug("Attempting to find the active Salesforce panel.");
    const activeTabButtonSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]';
    const activeTabButton = await waitForElement(activeTabButtonSelector);

    if (!activeTabButton) {
        logger.error("Could not find the active Salesforce tab button.");
        return null;
    }
    logger.debug("Found active tab button:", activeTabButton);

    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        logger.error("Active tab button has no 'aria-controls' ID to find the panel.");
        return null;
    }
    logger.debug(`Found panel ID: "${panelId}"`);

    const activePanel = document.getElementById(panelId);
    if (!activePanel) {
        logger.error(`Could not find the panel element with ID: "${panelId}"`);
    } else { logger.debug(`activePanel found for panel ID: "${panelId}"`) }
    return activePanel;
}

// Main scraping logic wrapped in an async function
async function findAndSendCaseId() {
    logger.info("Starting findAndSendCaseId.");

    try {
        const searchContext = await findActivePanel();
        if (!searchContext) {
            logger.error("Could not establish a search context. Aborting.");
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'Could not find the active Salesforce panel.' });
            return;
        }
        logger.info("STEP 1 SUCCESS - Established active panel as search context.");

        const iframeSelector = 'iframe';
        logger.debug(`STEP 2 - Searching for an '${iframeSelector}' within the active panel.`);
        const reportIframe = await waitForElement(iframeSelector, searchContext);

        if (!reportIframe) {
            logger.error(`ERROR - Did not find an iframe within the active panel. Cannot access report content.`);
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'The report iframe could not be found.' });
            return;
        }
        logger.info("STEP 2 SUCCESS - Found the report iframe. Waiting for it to load...", reportIframe);

        await new Promise(resolve => {
            if (reportIframe.contentDocument && reportIframe.contentDocument.readyState === 'complete') {
                logger.debug("Iframe was already loaded.");
                resolve();
            } else {
                reportIframe.addEventListener('load', () => {
                    logger.debug("Iframe 'load' event fired.");
                    resolve();
                });
            }
        });
        const iframeDocument = reportIframe.contentDocument;
        logger.info("STEP 3 SUCCESS - Iframe is loaded. Its document is now the search context.");

        const tableSelector = 'table.data-grid-table';
        logger.debug(`STEP 4 - Waiting for the main report table with selector: "${tableSelector}" within the iframe.`);
        const tableElement = await waitForElement(tableSelector, iframeDocument);

        if (!tableElement) {
            logger.error(`Main report table not found within iframe using selector "${tableSelector}".`);
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'Report table element not found within the iframe.' });
            return;
        }

        logger.info("STEP 4 SUCCESS - Found report table.");
        logger.debug("Table outerHTML for debugging:", tableElement.outerHTML);

        const caseIdCellSelector = 'td.lightning-table-detail-cell div.wave-table-cell-text';
        logger.debug(`STEP 5 - Searching within table for Case ID cell using selector: "${caseIdCellSelector}"`);

        const caseIdElement = await waitForElement(caseIdCellSelector, tableElement, 5000);

        if (caseIdElement) {
            const caseId = caseIdElement.textContent?.trim();
            logger.debug(`Found caseIdElement. Text content is: "${caseId}"`);
            
            if (caseId && caseId.length > 10) {
                logger.info(`STEP 5 SUCCESS - Extracted valid Case ID '${caseId}'. Sending to background.`);
                chrome.runtime.sendMessage({
                    type: 'caseIdFound',
                    caseId: caseId
                });
            } else {
                logger.error(`Extracted text "${caseId}" does not look like a valid Case ID.`);
                chrome.runtime.sendMessage({
                    type: 'caseIdNotFound',
                    reason: `Invalid ID format: ${caseId}`
                });
            }
        } else {
            logger.error(`Could not find the Case ID cell within the table using selector: "${caseIdCellSelector}".`);
            chrome.runtime.sendMessage({
                type: 'caseIdNotFound',
                reason: 'Report data cell not found on page.'
            });
        }
    } catch (error) {
        logger.error("An error occurred during scraping:", error);
        chrome.runtime.sendMessage({
            type: 'caseIdNotFound',
            reason: `Error during scraping: ${error.message}`
        });
    }
}

// Execute the scraping
findAndSendCaseId();
// End of file
