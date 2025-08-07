// work_order_list_scraper.js - Injected into the "View All" Work Orders page.
const logger = globalThis.psmhLogger;
logger.info("WORK_ORDERS_LOG (Scraper): Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 */
function waitForElement(selector, baseElement = document, timeout = 10000) {
    logger.info(`WORK_ORDERS_LOG (Scraper): Waiting for "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.info(`WORK_ORDERS_LOG (Scraper): Found element for selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`WORK_ORDERS_LOG (Scraper): Timeout waiting for "${selector}"`);
                clearInterval(interval);
                resolve(null);
            }
        }, 250);
    });
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Reads the data from the live Salesforce table and builds a new, clean HTML table from scratch.
 */
async function scrapeAndRebuildWorkOrderTable() {
    logger.info("WORK_ORDERS_LOG (Scraper): Starting scrape of work order table.");
    
    const sourceTable = await waitForElement('lightning-datatable table[role="grid"]');
    if (!sourceTable) {
        logger.error("WORK_ORDERS_LOG (Scraper): Could not find the source data table.");
        chrome.runtime.sendMessage({ type: 'workOrderScrapeResult', data: { html: '<table><tr><td>Error: Work Order table not found.</td></tr></table>', count: 0 } });
        return;
    }
    
    logger.info("WORK_ORDERS_LOG (Scraper): Found source table. Reading headers and rows to rebuild a clean version.", sourceTable);

    const headers = [];
    const columnIndicesToKeep = [];
    // Get headers, but skip unwanted columns like "Row Number", Checkboxes, and "Action"
    sourceTable.querySelectorAll('thead th').forEach((th, index) => {
        const label = th.getAttribute('aria-label');
        if (label && label !== 'Row Number' && label !== 'Choose a Row' && label !== 'Action') {
            headers.push(label);
            columnIndicesToKeep.push(index);
        }
    });
    logger.info(`WORK_ORDERS_LOG (Scraper): Identified ${headers.length} valid columns to keep.`, headers);

    const rowsData = [];
    const sourceRows = sourceTable.querySelectorAll('tbody tr');
    sourceRows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('th, td');
        columnIndicesToKeep.forEach(index => {
            const cell = cells[index];
            if (cell) {
                const link = cell.querySelector('a[href]');
                if (link) {
                    const absoluteUrl = new URL(link.getAttribute('href'), window.location.origin).href;
                    rowData.push(`<a href="${absoluteUrl}" target="_blank">${escapeHtml(link.textContent?.trim())}</a>`);
                } else {
                    rowData.push(escapeHtml(cell.textContent?.trim()));
                }
            }
        });
        rowsData.push(rowData);
    });

    logger.info(`WORK_ORDERS_LOG (Scraper): Extracted data for ${rowsData.length} rows. Building clean HTML table.`);

    // Build the new, clean HTML string
    let tableHtml = '<table class="slds-table slds-table_bordered">';
    // Add header
    tableHtml += '<thead><tr>';
    headers.forEach(header => {
        tableHtml += `<th>${escapeHtml(header)}</th>`;
    });
    tableHtml += '</tr></thead>';
    // Add body
    tableHtml += '<tbody>';
    rowsData.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(cellData => {
            tableHtml += `<td>${cellData}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';

    logger.info(`WORK_ORDERS_LOG (Scraper): Successfully scraped and rebuilt work order table.`);
    chrome.runtime.sendMessage({
        type: 'workOrderScrapeResult',
        data: {
            html: tableHtml,
            count: rowsData.length
        }
    });
}

scrapeAndRebuildWorkOrderTable();

// End of file
