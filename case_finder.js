// case_finder.js - Injected into the report tab to find the Case ID.

console.log("Case Finder v3: Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=30000] - Timeout in ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 30000) { // Increased timeout
    console.log(`Case Finder: Waiting for selector "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                console.log(`Case Finder: Found element matching selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                console.warn(`Case Finder: Timeout waiting for "${selector}" in ${document.URL}`);
                clearInterval(interval);
                resolve(null); // Resolve with null on timeout
            }
        }, 250);
    });
}

/**
 * Finds the currently active panel within the Salesforce UI.
 * @returns {Promise<HTMLElement|null>} The active panel element or null.
 */
async function findActivePanel() {
    console.log("Case Finder: Attempting to find the active Salesforce panel.");
    const activeTabButtonSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]';
    const activeTabButton = await waitForElement(activeTabButtonSelector);

    if (!activeTabButton) {
        console.error("Case Finder: Could not find the active Salesforce tab button.");
        return null;
    }
    console.log("Case Finder: Found active tab button:", activeTabButton);

    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        console.error("Case Finder: Active tab button has no 'aria-controls' ID to find the panel.");
        return null;
    }
    console.log(`Case Finder: Found panel ID: "${panelId}"`);

    const activePanel = document.getElementById(panelId);
    if (!activePanel) {
        console.error(`Case Finder: Could not find the panel element with ID: "${panelId}"`);
    }
    return activePanel;
}

// Main scraping logic wrapped in an async function
async function findAndSendCaseId() {
    console.log("Case Finder: Starting findAndSendCaseId.");

    try {
        // Step 1: Find the active Salesforce panel which contains the report.
        const searchContext = await findActivePanel();
        if (!searchContext) { // The findActivePanel function already logs errors
            console.error("Case Finder: Could not establish a search context. Aborting.");
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'Could not find the active Salesforce panel.' });
            return;
        }
        console.log("%cCase Finder: STEP 1 SUCCESS%c - Established active panel as search context.", "color: green; font-weight: bold;", "color: black;");

        // Step 2: Find the iframe within the active panel. Reports are almost always in an iframe.
        const iframeSelector = 'iframe';
        console.log(`Case Finder: STEP 2 - Searching for an '${iframeSelector}' within the active panel.`);
        const reportIframe = await waitForElement(iframeSelector, searchContext);

        if (!reportIframe) {
            console.error(`Case Finder: ERROR - Did not find an iframe within the active panel. Cannot access report content.`);
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'The report iframe could not be found.' });
            return;
        }
        console.log("%cCase Finder: STEP 2 SUCCESS%c - Found the report iframe. Waiting for it to load...", "color: green; font-weight: bold;", "color: black;", reportIframe);

        // Step 3: Wait for the iframe to fully load its content.
        await new Promise(resolve => {
            if (reportIframe.contentDocument && reportIframe.contentDocument.readyState === 'complete') {
                console.log("Case Finder: Iframe was already loaded.");
                resolve();
            } else {
                reportIframe.addEventListener('load', () => {
                    console.log("Case Finder: Iframe 'load' event fired.");
                    resolve();
                });
            }
        });
        const iframeDocument = reportIframe.contentDocument;
        console.log("%cCase Finder: STEP 3 SUCCESS%c - Iframe is loaded. Its document is now the search context.", "color: green; font-weight: bold;", "color: black;");

        // Step 4: Wait for the main report table to render WITHIN the iframe.
        const tableSelector = 'table.data-grid-table';
        console.log(`Case Finder: STEP 4 - Waiting for the main report table with selector: "${tableSelector}" within the iframe.`);
        const tableElement = await waitForElement(tableSelector, iframeDocument);

        if (!tableElement) {
            console.error(`Case Finder: ERROR - Main report table not found within the iframe using selector "${tableSelector}".`);
            chrome.runtime.sendMessage({ type: 'caseIdNotFound', reason: 'Report table element not found within the iframe.' });
            return;
        }

        console.log("%cCase Finder: STEP 4 SUCCESS%c - Found report table. Logging its outerHTML for debugging:", "color: green; font-weight: bold;", "color: black;");
        console.log(tableElement.outerHTML);

        // Step 5: Now search for the specific Case ID cell WITHIN the found table.
        // Based on the provided markup, this selector targets the specific cell's text container.
        const caseIdCellSelector = 'td.lightning-table-detail-cell div.wave-table-cell-text';
        console.log(`Case Finder: STEP 5 - Searching within the table for the Case ID cell using selector: "${caseIdCellSelector}"`);

        // We search from tableElement to scope the search and improve reliability.
        const caseIdElement = await waitForElement(caseIdCellSelector, tableElement, 5000); // Shorter timeout now

        if (caseIdElement) {
            const caseId = caseIdElement.textContent?.trim();
            console.log(`Case Finder: Found caseIdElement. Text content is: "${caseId}"`);
            
            // Basic validation for a Salesforce ID format
            if (caseId && caseId.length > 10) {
                console.log("%cCase Finder: STEP 5 SUCCESS%c - Extracted valid Case ID '%s'. Sending to background.", "color: green; font-weight: bold;", "color: black;", caseId);
                chrome.runtime.sendMessage({
                    type: 'caseIdFound',
                    caseId: caseId
                });
            } else {
                console.error(`Case Finder: ERROR - Extracted text "${caseId}" does not look like a valid Case ID.`);
                chrome.runtime.sendMessage({
                    type: 'caseIdNotFound',
                    reason: `Invalid ID format: ${caseId}`
                });
            }
        } else {
            console.error(`Case Finder: ERROR - Could not find the Case ID cell within the table using selector: "${caseIdCellSelector}". Review the table markup logged above.`);
            chrome.runtime.sendMessage({
                type: 'caseIdNotFound',
                reason: 'Report data cell not found on page.'
            });
        }
    } catch (error) {
        console.error("Case Finder: An error occurred during scraping:", error);
        chrome.runtime.sendMessage({
            type: 'caseIdNotFound',
            reason: `Error during scraping: ${error.message}`
        });
    }
}

// Execute the scraping
findAndSendCaseId();
// End of file
