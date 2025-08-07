// email_scraper.js - Injected into temporary Email tabs to scrape details
const logger = globalThis.psmhLogger;
logger.info("Email Scraper: Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=10000] - Timeout in ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 12000) {
    logger.debug(`Email Scraper: Waiting for "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.debug(`Email Scraper: Found "${selector}"`);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`Email Scraper: Timeout waiting for "${selector}" in ${document.URL}`);
                clearInterval(interval);
                resolve(null);
            }
        }, 250);
    });
}

/**
 * Finds and clicks the close button on the active Salesforce workspace tab.
 */
async function closeSalesforceTab() {
    // This function operates on the top-level document where the tabs are.
    const top_document = window.top.document;
    const closeButtonSelector = 'li.oneConsoleTabItem.slds-is-active .close button';
    logger.info("Attempting to find and close the active Salesforce tab...");
    const closeButton = top_document.querySelector(closeButtonSelector);

    if (closeButton) {
        logger.info("Found active Salesforce tab close button. Clicking it to clean up.", closeButton);
        closeButton.click();
    } else {
        logger.warn(`Could not find the active Salesforce tab close button with selector: "${closeButtonSelector}"`);
    }
}
// Main scraping logic
async function scrapeEmailDetails() {
    logger.info("Starting scrapeEmailDetails.");
    let subject = null;
    let from = null;
    let to = null;
    let bodyHTML = null;

    try {
        const emailArticle = await waitForElement('article.emailuiEmailMessage');
        if (!emailArticle) {
             throw new Error("Main email article element 'article.emailuiEmailMessage' not found.");
        }
        logger.debug("Found email article.");

        // --- Extract Subject ---
        const subjectElement = await waitForElement('header.forceHighlightsPanel h1.slds-page-header__title');
        if(subjectElement) {
            subject = subjectElement.textContent?.trim();
            logger.debug("Found Subject:", subject);
        } else {
            logger.warn("Subject H1 not found in highlights.");
        }

        // --- Extract From ---
        const fromElement = emailArticle.querySelector('.fromDetail span.uiOutputText');
        if(fromElement) {
            from = fromElement.textContent?.trim();
            logger.debug("Found From:", from);
        } else {
             logger.warn("From element not found.");
        }

        // --- Extract To ---
        const toElementList = emailArticle.querySelector('.toCcBccDetail ul.addressList');
        if(toElementList) {
            to = Array.from(toElementList.querySelectorAll('li'))
                      .map(li => li.textContent?.trim())
                      .filter(Boolean)
                      .join('; ');
            logger.debug("Found To:", to);
        } else {
            logger.warn("To list element not found.");
        }

        // --- Extract Body from IFrame ---
        logger.debug("Looking for iframe#emailuiFrame...");
        const iframe = await waitForElement('iframe#emailuiFrame');
        if (iframe) {
            logger.debug("Found iframe. Waiting for it to load...");
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc && iframeDoc.body) {
                    logger.debug("Accessed iframe body. Extracting innerHTML.");
                    bodyHTML = iframeDoc.body.innerHTML?.trim();
                    logger.debug("Extracted bodyHTML length:", bodyHTML?.length);
                } else {
                     logger.warn("Could not access iframe contentDocument or body.");
                     bodyHTML = "[Error accessing iframe content - document or body not available]";
                }
            } catch (iframeError) {
                logger.error("Error accessing iframe content:", iframeError);
                bodyHTML = `[Error accessing iframe content: ${iframeError.message}]`;
            }
        } else {
            logger.warn("iframe#emailuiFrame not found.");
            bodyHTML = "[Email Body IFrame not found]";
        }

    } catch (error) {
        logger.error("Error during scraping:", error);
        bodyHTML = bodyHTML || `[Error during scraping: ${error.message}]`;
    }

    const result = {
        type: 'emailScrapeResult',
        subject: subject ?? '',
        from: from ?? '',
        to: to ?? '',
        bodyHTML: bodyHTML ?? ''
    };

    logger.info("Sending results back to background script:", result);
    chrome.runtime.sendMessage(result);

    // After sending the data, try to close the Salesforce pseudo-tab
    await closeSalesforceTab();
}

scrapeEmailDetails();

// End of file
