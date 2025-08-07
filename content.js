// content.js - Core logic for data extraction and HTML generation.
// The logger is now accessed via the global psmhLogger object defined in logger.js

psmhLogger.info("Core Logic Loaded.");

// --- Helper Functions ---
function waitForElement(selector, baseElement = document, timeout = 5000) {
  return new Promise((resolve) => {
    psmhLogger.debug(`waitForElement: waiting for "${selector}"`);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const element = baseElement.querySelector(selector);
      if (element) {
        clearInterval(interval);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        psmhLogger.warn(`waitForElement: Timeout waiting for "${selector}"`);
        clearInterval(interval);
        resolve(null);
      }
    }, 300);
  });
}

/**
 * Scrolls an element into view and waits for a moment to allow lazy-loaded content to appear.
 * @param {string} selector - The CSS selector for the element to scroll to.
 * @param {Element} baseElement - The base element to search within.
 * @param {number} [timeout=7000] - The timeout for finding the element.
 * @returns {Promise<boolean>} - True if scrolling was successful, false otherwise.
 */
async function scrollToElementAndWait(selector, baseElement = document, timeout = 7000) {
    psmhLogger.debug(`Attempting to scroll to element: ${selector}`);
    const element = await waitForElement(selector, baseElement, timeout);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 1200));
        psmhLogger.debug(`Successfully scrolled to and waited for: ${selector}`);
        return true;
    }
    psmhLogger.warn(`Could not find element to scroll to: ${selector}`);
    return false;
}

function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        psmhLogger.error("sendMessagePromise failed:", chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
      return unsafe === null || typeof unsafe === 'undefined' ? '' : String(unsafe);
  }
  return unsafe
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function parseDateStringFromTable(dateString) {
  if (!dateString) return null;
  let match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (match) {
    try {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const year = parseInt(match[3]);
      const hour = parseInt(match[4]);
      const minute = parseInt(match[5]);
      if (year > 1970 && month >= 0 && month < 12 && day >= 1 && day <= 31 && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        const dateObject = new Date(year, month, day, hour, minute);
        if (!isNaN(dateObject.getTime())) {
            return dateObject;
        }
      }
    } catch (e) {
      psmhLogger.error(`CS Error creating Date from matched parts: "${dateString}"`, e);
      return null;
    }
  }
  psmhLogger.warn(`CS Could not parse date format: "${dateString}"`);
  return null;
}


// --- Functions to Extract Salesforce Record Details ---
function findSubjectInContainer(container) {
    if (!container) return 'N/A';
    const element = container.querySelector('support-output-case-subject-field lightning-formatted-text');
    return element ? element.textContent?.trim() : 'N/A (Subject)';
}

async function findRecordNumber(baseElement) {
    let searchContext = baseElement;

    // If no baseElement is provided, find the active tab panel.
    if (!searchContext) {
        const activeTabButton = await waitForElement('li.slds-is-active[role="presentation"] a[role="tab"]');
        if (activeTabButton) {
            const panelId = activeTabButton.getAttribute('aria-controls');
            if (panelId) {
                searchContext = document.getElementById(panelId);
                if (searchContext) { 
                    psmhLogger.debug(`findRecordNumber: found panelId ${panelId} as search context.`);
                }
            }
        }
    } 

    // If a specific context couldn't be found, default to the document.
    if (!searchContext) {
        psmhLogger.warn('findRecordNumber: Could not determine a specific search context. Defaulting to document.');
        searchContext = document;
    } 

    psmhLogger.debug(`findRecordNumber: using search context`, searchContext);

    const textSelector = 'lightning-formatted-text';
    const itemSelector = 'records-highlights-details-item:has(p[title="Case Number"])';
    const woItemSelector = 'records-highlights-details-item:has(p[title="Work Order Number"])';

    let detailsItem = searchContext.querySelector(itemSelector);
    if (!detailsItem) { detailsItem = searchContext.querySelector(woItemSelector); }

    if (detailsItem) {
        const textElement = detailsItem.querySelector(textSelector);
        if (textElement) {
            const recordNum = textElement.textContent?.trim();
            if (recordNum && /^\d+$/.test(recordNum)) {
                 return recordNum;
            }
        }
    }
    psmhLogger.warn("findRecordNumber: item/record number not found");
    return null;
}

function findStatusInContainer(container) {
    if (!container) return 'N/A';
    const statusItem = container.querySelector('records-highlights-details-item:has(records-formula-output lightning-formatted-rich-text)');
    const element = statusItem?.querySelector('lightning-formatted-rich-text span[part="formatted-rich-text"]');
    return element ? element.textContent?.trim() : 'N/A (Status)';
}

async function findCreatorName(baseElement) {
    const createdByItem = await waitForElement('records-record-layout-item[field-label="Created By"]', baseElement);
    if (!createdByItem) { return 'N/A (Creator)'; }
    const nameElement = createdByItem.querySelector('force-lookup a');
    return nameElement ? nameElement.textContent?.trim() : 'N/A (Creator)';
}

async function findCreatedDate(baseElement) {
    const createdByItem = await waitForElement('records-record-layout-item[field-label="Created By"]', baseElement);
    if (!createdByItem) { return 'N/A (Created Date)'; }
    const dateElement = createdByItem.querySelector('records-modstamp lightning-formatted-text');
    return dateElement ? dateElement.textContent?.trim() : 'N/A (Created Date)';
}

function findOwnerInContainer(container) {
     if (!container) return 'N/A';
     const ownerItem = container.querySelector('records-highlights-details-item:has(force-lookup)');
     const element = ownerItem?.querySelector('force-lookup a');
     return element ? element.textContent?.trim() : 'N/A (Owner)';
}

async function findAccountName(baseElement) {
    const accountSelector = `
      records-record-layout-item[field-label="Account Name"],
      records-record-layout-item[field-label="Account"]
    `;
    const accountItem = await waitForElement(accountSelector, baseElement);
    if (!accountItem) {
        return 'N/A (Account)';
    }
    const nameElement = accountItem.querySelector('force-lookup a');
    return nameElement ? nameElement.textContent?.trim() : 'N/A (Account)';
}

async function findCaseDescription(baseElement) {
     const descriptionContainer = await waitForElement('article.cPSM_Case_Description', baseElement);
     if (!descriptionContainer) { return ''; }
     let textElement = descriptionContainer.querySelector('lightning-formatted-text.txtAreaReadOnly') || descriptionContainer.querySelector('lightning-formatted-text');
     if (!textElement) { return ''; }
     const viewMoreButton = descriptionContainer.querySelector('button.slds-button:not([disabled])');
     let descriptionHTML = '';
     if (viewMoreButton && (viewMoreButton.textContent.includes('View More') || viewMoreButton.textContent.includes('Show More'))) {
        psmhLogger.debug("Clicking 'View More' on description.");
        viewMoreButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        let updatedTextElement = descriptionContainer.querySelector('lightning-formatted-text.txtAreaReadOnly') || descriptionContainer.querySelector('lightning-formatted-text');
        descriptionHTML = updatedTextElement?.innerHTML?.trim() || '';
     } else {
        descriptionHTML = textElement?.innerHTML?.trim() || '';
     }
     return descriptionHTML;
}

// VB Addition. Do not remove this showDebugInfo.
async function showDebugInfo() {
    psmhLogger.info("==== Hello from showDebugInfo");
    let thisSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]'
    const activeTabButton = document.querySelector(thisSelector);
    psmhLogger.debug(`Active tab button searched using ${thisSelector} is:`, activeTabButton);
    const panelId = activeTabButton.getAttribute('aria-controls');
    psmhLogger.debug(`panelId is: ${panelId}`);
    const activeTabPanel = document.getElementById(panelId);
    psmhLogger.debug(`Active tab panel is:`, activeTabPanel);
    psmhLogger.info("==== Bye from showDebugInfo");
}

async function closeActiveSalesforceTab() {
    psmhLogger.debug("Attempting to close the active Salesforce tab.");
    const activeTabLi = document.querySelector('li.slds-is-active[role="presentation"]');
    if (!activeTabLi) {
        psmhLogger.warn("Could not find the active tab list item to close.");
        return;
    }

    const closeButton = activeTabLi.querySelector('button[title^="Close"]');
    if (closeButton) {
        psmhLogger.info("Found active tab close button. Clicking it.");
        closeButton.click();
    } else {
        psmhLogger.warn("Could not find a close button within the active tab.");
    }
}

// --- Keyboard Shortcut Listener ---
document.addEventListener('keydown', (event) => {
    // Check for Alt+C combination
    if (event.altKey && event.key.toLowerCase() === 'c') {
        // Check storage to see if the feature is enabled
        chrome.storage.sync.get('closeOnAltC', (data) => {
            if (data.closeOnAltC) {
                psmhLogger.info("Alt+C shortcut detected and enabled. Closing tab.");
                event.preventDefault(); // Prevent any default browser action for this combo
                closeActiveSalesforceTab();
            }
        });
    }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    psmhLogger.debug(`Content Script: Received message action="${message.action}"`);
    
    if (message.action === "scrapeInitialPage") {
        (async () => {
            // Use a more specific selector to find the active tab only within the main tab container
            const activeTabSelector = 'div.tabContainer li.slds-is-active[role="presentation"] a[role="tab"]';
            psmhLogger.info(`scrapeInitialPage: Searching for active tab with specific selector: "${activeTabSelector}"`);
            const activeTabButton = await waitForElement(activeTabSelector);
            if (!activeTabButton) {
                psmhLogger.error("scrapeInitialPage: Could not find the active Salesforce tab button.");
                sendResponse({ error: "Could not find active tab button." });
                return;
            }
            const panelId = activeTabButton.getAttribute('aria-controls');
            const activeTabPanel = panelId ? document.getElementById(panelId) : null;

            if (!activeTabPanel) {
                psmhLogger.error("scrapeInitialPage: Could not find active tab panel from ID:", panelId);
                sendResponse({ error: "Could not find active tab panel." });
                return;
            }
            
            psmhLogger.info("scrapeInitialPage: Found active panel. Scraping details...");
            const highlightsContainer = await waitForElement('records-highlights2', activeTabPanel);

            const caseDetails = {
                subject: findSubjectInContainer(highlightsContainer),
                recordNumber: await findRecordNumber(activeTabPanel),
                status: findStatusInContainer(highlightsContainer),
                owner: findOwnerInContainer(highlightsContainer),
                creatorName: await findCreatorName(activeTabPanel),
                accountName: await findAccountName(activeTabPanel),
                createdDateStr: await findCreatedDate(activeTabPanel),
                description: await findCaseDescription(activeTabPanel),
                objectType: window.location.href.includes('/Case/') ? 'Case' : 'WorkOrder',
                caseUrl: window.location.href
            };
            
            psmhLogger.info("scrapeInitialPage: Scraped case details object:", caseDetails);

            let notesViewAllUrl = null;
            const notesHeader = activeTabPanel.querySelector('article[aria-label="Notes"] h2.slds-card__header-title');
            if (notesHeader && notesHeader.textContent.includes('(0)')) {
                psmhLogger.info("NOTES_LOG: Found header with (0), skipping search for 'View All' link.");
            } else {
                const notesViewAllSelector = 'lst-related-list-view-manager a[href*="/related/PSM_Notes__r/view"]';
                psmhLogger.info(`NOTES_LOG: Searching for Notes "View All" link with selector: "${notesViewAllSelector}"`);
                const notesViewAllLink = activeTabPanel.querySelector(notesViewAllSelector);
                if (notesViewAllLink) {
                    notesViewAllUrl = new URL(notesViewAllLink.getAttribute('href'), window.location.origin).href;
                    psmhLogger.info(`NOTES_LOG: Found Notes "View All" URL: ${notesViewAllUrl}`);
                } else {
                    psmhLogger.warn("NOTES_LOG: Notes 'View All' link NOT found.");
                }
            }

            let emailsViewAllUrl = null;
            const emailsHeader = activeTabPanel.querySelector('div.forceRelatedListPreviewAdvancedGrid h2.slds-card__header-title');
            if (emailsHeader && emailsHeader.textContent.includes('(0)')) {
                 psmhLogger.info("EMAILS_LOG: Found header with (0), skipping search for 'View All' link.");
            } else {
                const emailsViewAllSelector = 'div.forceRelatedListPreviewAdvancedGrid a[href*="/related/EmailMessages/view"]';
                psmhLogger.info(`scrapeInitialPage: Searching for Emails "View All" link with selector: "${emailsViewAllSelector}"`);
                const emailsViewAllLink = activeTabPanel.querySelector(emailsViewAllSelector);
                if (emailsViewAllLink) {
                    emailsViewAllUrl = new URL(emailsViewAllLink.getAttribute('href'), window.location.origin).href;
                    psmhLogger.info(`scrapeInitialPage: Emails "View All" URL found: ${emailsViewAllUrl}`);
                } else {
                    psmhLogger.warn("EMAILS_LOG: Emails 'View All' link NOT found.");
                }
            }
            
            // Find the "View All" link for Work Orders
            let workOrdersViewAllUrl = null;
            const woHeader = activeTabPanel.querySelector('article[aria-label="Work Orders"] h2.slds-card__header-title');
            if(woHeader && woHeader.textContent.includes('(0)')) {
                psmhLogger.info("WORK_ORDERS_LOG: Found header with (0), skipping search.");
            } else {
                const woViewAllLink = activeTabPanel.querySelector('article[aria-label="Work Orders"] a.slds-card__footer');
                 if (woViewAllLink) {
                    workOrdersViewAllUrl = new URL(woViewAllLink.getAttribute('href'), window.location.origin).href;
                    psmhLogger.info("WORK_ORDERS_LOG: Found 'View All' URL:", workOrdersViewAllUrl);
                } else {
                    psmhLogger.warn("WORK_ORDERS_LOG: 'View All' link NOT found.");
                }
            }

            sendResponse({ caseDetails, notesViewAllUrl, emailsViewAllUrl, workOrdersViewAllUrl });
        })();
        return true; // Keep the message channel open for the async response
    }

    if (message.action === "logUrlProcessing") {
        psmhLogger.info(`Progress: Fetching ${message.itemType} ${message.index}/${message.total}`);
        const statusDiv = document.getElementById('psmh-status');
        if (statusDiv) {
            statusDiv.textContent = `Fetching ${message.itemType} ${message.index}/${message.total}...`;
            statusDiv.style.color = 'var(--psmh-status-warn)';
        }
        return false;
    }

    // Listener for logs sent from the background script
    if (message.action === "log") {
        psmhLogger.info(`[FROM BACKGROUND] ${message.message}`);
        return false; // No response needed
    }

    if (message.action === "updateStatus") {
        const statusDiv = document.getElementById('psmh-status');
        if (statusDiv) {
            statusDiv.textContent = message.message;
            const color = `var(--psmh-status-${message.type || 'info'})`;
            statusDiv.style.color = color;
        }
        return false;
    }

    return false;
});

// End of file
