// note_scraper.js - Injected into temporary Note tabs to scrape details
const logger = globalThis.psmhLogger;
logger.info("Note Scraper: Script Injected.");

/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=10000] - Timeout in ms
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 10000) {
    logger.debug(`Note Scraper: Waiting for "${selector}"...`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                logger.debug(`Note Scraper: Found "${selector}"`);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                logger.warn(`Note Scraper: Timeout waiting for "${selector}" in ${document.URL}`);
                clearInterval(interval);
                resolve(null); // Resolve with null on timeout
            }
        }, 250);
    });
}

// Main scraping logic wrapped in an async function
async function scrapeNoteDetails() {
    logger.info("Starting scrapeNoteDetails.");
    let title = null;
    let author = null;
    let description = null;
    let createdDateText = null;
    let isPublic = false; // VB Default to internal/false

    try {
        // --- Extract Description ---
        const descLayoutItemSelector = 'records-record-layout-item[field-label="Description"]';
        const descLayoutItem = await waitForElement(descLayoutItemSelector);
        logger.debug(`Description layout item found?`, !!descLayoutItem);
        if (descLayoutItem) {
            const descTextElement = await waitForElement('records-formatted-rich-text span[part="formatted-rich-text"]', descLayoutItem, 5000);
            logger.debug(`Description rich text span found?`, !!descTextElement);
            if (descTextElement) {
                description = descTextElement.innerHTML?.trim(); // Get innerHTML for rich text
                logger.debug(`Extracted description length:`, description?.length);
            } else {
                 logger.warn("Found Description container, but inner rich text span not found. Using fallback.");
                 description = `[Fallback TextContent] ${descLayoutItem.textContent?.trim()}`;
            }
        } else {
            logger.warn("Description layout item not found.");
            description = "N/A (Description Container Not Found)";
        }

        // --- Extract Visibility ---
        logger.debug("Looking for Visibility checkbox...");
        const visibilityItem = await waitForElement('records-record-layout-item[field-label="Visible to Customer"]');
        if (visibilityItem) {
            const checkbox = visibilityItem.querySelector('input[type="checkbox"]');
            if (checkbox) {
                isPublic = checkbox.checked;
                logger.debug("Visibility checkbox found. Is checked (public)?", isPublic);
            } else {
                logger.warn("Visibility checkbox input not found.");
            }
        } else {
            logger.warn("Visibility layout item [field-label='Visible to Customer'] not found.");
        }

        // --- Extract Title ---
        const titleLayoutItem = await waitForElement('records-record-layout-item[field-label="PSM Note Name"]');
        if (titleLayoutItem) {
            const titleValueElement = await waitForElement('lightning-formatted-text', titleLayoutItem, 5000);
            if (titleValueElement) {
                title = titleValueElement.textContent?.trim();
                logger.debug("Extracted Title from layout item:", title);
            } else {
                logger.warn('Found title layout item, but no lightning-formatted-text value element inside.');
            }
        } else {
            logger.warn('Title layout item with label "PSM Note Name" not found.');
        }
        
        // --- Extract Created By for Author ---
        const createdByItemForAuthor = await waitForElement('records-record-layout-item[field-label="Created By"]');
        if (createdByItemForAuthor) {
            const authorElement = await waitForElement('force-lookup a', createdByItemForAuthor);
            if (authorElement) {
                author = authorElement.textContent?.trim();
                logger.debug("Extracted Author:", author);
            } else {
                logger.warn("Author link not found in 'Created By' item.");
            }
        }

        // --- Extract Created Date ---
        const createdByItemSelector = 'records-record-layout-item[field-label="Created By"]';
        const createdByItem = await waitForElement(createdByItemSelector);
        logger.debug(`'Created By' layout item found?`, !!createdByItem);

        if (createdByItem) {
            const dateElementSelector = 'records-modstamp lightning-formatted-text';
            const dateElement = await waitForElement(dateElementSelector, createdByItem, 5000);
            logger.debug(`Date element found?`, !!dateElement);
            if (dateElement) {
                createdDateText = dateElement.textContent?.trim();
                logger.debug("Extracted createdDateText:", createdDateText);
            } else {
                logger.warn(`Failed to find date element with selector "${dateElementSelector}".`);
            }
        } else {
             logger.warn(`Failed to find '${createdByItemSelector}'.`);
        }

    } catch (error) {
        logger.error("Error during scraping:", error);
        description = description || `Error during scraping: ${error.message}`;
    }

    const result = {
        type: 'noteScrapeResult',
        title: title,
        author: author,
        description: description ?? '',
        createdDateText: createdDateText,
        isPublic: isPublic
    };
    logger.info("Sending results back to background script:", result);
    chrome.runtime.sendMessage(result);
}

// Execute the scraping
scrapeNoteDetails();
// End of file
