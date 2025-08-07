// background.js - With Unified Data Model, Enhanced Logging, and Leveled Logging

// The logger is now imported as an ES module.
// The global psmhLogger will be initialized by logger.js itself.
import './logger.js';
const logger = globalThis.psmhLogger;

logger.info("Background service worker started.");

// Set a default log level on first install.
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        logger.info("First install: setting default log level to 'INFO'.");
        await chrome.storage.sync.set({ logLevel: 'INFO' });
    }
});


/**
 * Parses a date string into a Date object.
 * Handles "DD/MM/YYYY HH:MM" format first, then falls back to generic parsing.
 * @param {string} dateString - The date string to parse.
 * @returns {Date|null} - A Date object or null if parsing fails.
 */
function parseDateString(dateString) {
    if (!dateString) return null;
    logger.debug(`Attempting to parse date string: "${dateString}"`);

    const match = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (match) {
        try {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // JS months are 0-indexed
            const year = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);

            if (year > 1970 && month >= 0 && month < 12 && day >= 1 && day <= 31 && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
                const dateObject = new Date(Date.UTC(year, month, day, hour, minute));
                if (!isNaN(dateObject.getTime())) {
                    logger.debug("Successfully parsed date with regex:", dateObject);
                    return dateObject;
                }
            }
        } catch (e) {
            logger.error(`Error parsing matched date parts "${dateString}":`, e);
        }
    }

    const parsedFallback = Date.parse(dateString);
    if (!isNaN(parsedFallback)) {
        logger.warn(`Used Date.parse fallback for "${dateString}"`);
        return new Date(parsedFallback);
    }

    logger.warn(`Could not parse date format "${dateString}"`);
    return null;
}

async function fetchAllDetailsViaTabs(itemsToFetch, itemType, senderTabId) {
    logger.info(`Starting CONCURRENT tab automation for ${itemsToFetch.length} ${itemType}(s) from sender tab ${senderTabId}.`);
    const resultsMap = {};
    const scraperScript = itemType === 'Note' ? 'note_scraper.js' : 'email_scraper.js';

    const CONCURRENCY_LIMIT = 4;
    const taskQueue = [...itemsToFetch];
    let itemIndex = 0;

    const processNextItem = async () => {
        const itemInfo = taskQueue.shift();
        if (!itemInfo) return;

        const currentIndex = ++itemIndex;
        const itemUrl = itemInfo.url;
        let tempTab = null;

        try {
            if (senderTabId) {
                chrome.tabs.sendMessage(senderTabId, {
                    action: "logUrlProcessing",
                    itemType: itemType,
                    index: currentIndex, total: itemsToFetch.length
                }).catch(err => logger.warn(`Could not send log to tab ${senderTabId}: ${err.message}`));
            }

            logger.info(`Processing ${itemType} ${currentIndex}/${itemsToFetch.length}: ${itemUrl}`);
            tempTab = await chrome.tabs.create({ url: itemUrl, active: false });
            const tempTabId = tempTab.id;
            if (!tempTabId) throw new Error("Failed to create temp tab.");

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    reject(new Error(`Timeout waiting for tab ${tempTabId} to load`));
                }, 12000);
                const listener = (tabId, changeInfo) => {
                    if (tabId === tempTabId && changeInfo.status === 'complete') {
                        clearTimeout(timeout);
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

            const resultPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(listener);
                    reject(new Error(`Timeout waiting for scrape result from tab ${tempTabId}`));
                }, 18000);
                const expectedResponseType = itemType === 'Note' ? 'noteScrapeResult' : 'emailScrapeResult';
                const listener = (message, sender) => {
                    if (sender.tab?.id === tempTabId && message.type === expectedResponseType) {
                        clearTimeout(timeout);
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve(message);
                    }
                    return true;
                };
                chrome.runtime.onMessage.addListener(listener);
            });

            // IMPORTANT: Inject logger.js before the main scraper script
            await chrome.scripting.executeScript({ target: { tabId: tempTabId }, files: ['logger.js', scraperScript] });
            const scrapeResult = await resultPromise;
            
            const parsedDate = parseDateString(itemInfo.dateStr);
            let unifiedResult;

            if (itemType === 'Note') {
                unifiedResult = {
                    type: 'Note',
                    title: scrapeResult.title || 'Note',
                    author: scrapeResult.author || 'Unknown Author',
                    content: scrapeResult.description || '[No Content]',
                    isPublic: scrapeResult.isPublic,
                    dateObject: parsedDate,
                    url: itemUrl
                };
            } else { // Email
                unifiedResult = {
                    type: 'Email',
                    title: scrapeResult.subject || 'Email Subject Not Found',
                    author: scrapeResult.from || 'Unknown Sender',
                    content: scrapeResult.bodyHTML || '[Email Body Not Found]',
                    to: scrapeResult.to || 'Unknown Recipient(s)',
                    isPublic: null,
                    dateObject: parsedDate,
                    url: itemUrl
                };
            }
            
            logger.debug(`--- Fetched ${itemType} Data ---`, unifiedResult);
            resultsMap[itemUrl] = unifiedResult;

        } catch (error) {
            logger.error(`Error processing ${itemType} ${itemUrl} in tab ${tempTab?.id}:`, error);
            resultsMap[itemUrl] = { type: itemType, title: `[Error processing item]`, author: 'System', content: error.message, dateObject: parseDateString(itemInfo.dateStr) || new Date(), url: itemUrl };
        } finally {
            if (tempTab?.id) {
                try { await chrome.tabs.remove(tempTab.id); }
                catch (e) { logger.warn(`Error closing temp tab ${tempTab.id}:`, e.message); }
            }
        }
    };

    const runners = [];
    const runner = async () => {
        while (taskQueue.length > 0) {
            await processNextItem();
        }
    };
    for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
        runners.push(runner());
    }
    await Promise.all(runners);

    logger.info(`Finished processing all ${itemsToFetch.length} ${itemType}(s) via tabs.`);
    return resultsMap;
}

/**
 * Sends a styled log message to a specific tab's content script.
 * @param {number|null} tabId The ID of the tab to send the message to.
 * @param {string} message The message to log.
 */
function logToTab(tabId, message) {
    if (tabId) {
        // This now just logs to the background console. The tab will get its own logs.
        logger.info(`[Tab ${tabId}] ${message}`);
        chrome.tabs.sendMessage(tabId, { action: "log", message: message })
            .catch(err => logger.warn(`Could not log to tab ${tabId}: ${err.message}. It might have been closed or lacked the content script.`));
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.debug("Background received message:", message);

    if (message.action === "initiateGenerateFullCaseView") {
        if (sender.tab?.id) { chrome.tabs.sendMessage(sender.tab.id, { action: "generateFullView" }); }
        return false;
    }

    if (message.action === "openFullViewTab" && message.htmlContent) {
        const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(message.htmlContent);
        chrome.tabs.create({ url: dataUrl });
        return false;
    }

    if (message.action === "fetchItemDetails" && message.items) {
        if (message.items.length === 0) {
            logger.info("fetchItemDetails called with 0 items. Responding immediately.");
            sendResponse({ status: "success", details: {} });
            return false;
        }
        const itemType = message.items[0].type;
        fetchAllDetailsViaTabs(message.items, itemType, sender.tab?.id)
            .then(resultsMap => {
                sendResponse({ status: "success", details: resultsMap });
            })
            .catch(error => {
                logger.error("fetchAllDetailsViaTabs failed:", error);
                sendResponse({ status: "error", message: error.message });
            });
        return true;
    }

    if (message.action === "findAndOpenCase" && message.caseNumber) {
        logger.info(`Received findAndOpenCase for case number: ${message.caseNumber}`);
        logToTab(sender.tab?.id, `Received request to find Case ${message.caseNumber}.`);
        const senderTabId = sender.tab?.id; // Get the original tab ID
        const caseNumber = message.caseNumber;
        const reportUrl = `https://myatos.lightning.force.com/lightning/r/Report/00ObD0000026ectUAA/view?fv0=${caseNumber}`;
        let closeReportTabOnSuccess = false;
        let tempTab = null;

        (async () => {
            try {
                logToTab(senderTabId, `Opening report in a temporary tab...`);
                tempTab = await chrome.tabs.create({ url: reportUrl, active: true });
                
                if (senderTabId) {
                    logToTab(senderTabId, `Switching focus back to this tab.`);
                    await chrome.tabs.update(senderTabId, { active: true });
                    logger.debug(`Switched focus back to original tab ID: ${senderTabId}`);
                }

                const tempTabId = tempTab.id;
                if (!tempTabId) throw new Error("Failed to create temporary report tab.");

                logToTab(senderTabId, `Waiting for report tab to finish loading...`);
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        reject(new Error(`Timeout (30s) waiting for tab ${tempTabId} to load.`));
                    }, 30000);

                    const listener = (tabId, changeInfo, tab) => {
                        if (tabId === tempTabId && tab.status === 'complete') {
                            if (tab.url?.includes('Report')) {
                                clearTimeout(timeout);
                                chrome.tabs.onUpdated.removeListener(listener);
                                logger.info(`Tab ${tempTabId} loaded successfully.`);
                                resolve();
                            }
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });

                const resultPromise = new Promise((resolve, reject) => {
                     const messageListener = (msg, sender) => {
                        if (sender.tab?.id === tempTabId && (msg.type === 'caseIdFound' || msg.type === 'caseIdNotFound')) {
                            chrome.runtime.onMessage.removeListener(messageListener);
                            resolve(msg);
                        }
                        return true;
                    };
                    chrome.runtime.onMessage.addListener(messageListener);
                });

                logToTab(senderTabId, `Injecting finder script into report tab...`);
                // IMPORTANT: Inject logger.js before the main finder script
                await chrome.scripting.executeScript({ target: { tabId: tempTabId }, files: ['logger.js', 'case_finder.js'] });

                logToTab(senderTabId, `Waiting for finder script to report back...`);
                const result = await resultPromise;

                if (result.type === 'caseIdFound' && result.caseId) {
                    logToTab(senderTabId, `Success! Found Case ID: ${result.caseId}.`);
                    const finalCaseUrl = `https://myatos.lightning.force.com/lightning/r/Case/${result.caseId}/view`;
                    logToTab(senderTabId, `Opening final Case page...`);
                    await chrome.tabs.create({ url: finalCaseUrl, active: true });
                    closeReportTabOnSuccess = true; // Set flag to close the temp tab
                } else {
                    logToTab(senderTabId, `Error: Failed to find Case ID. Reason: ${result.reason}.`);
                    logger.error(`Failed to find Case ID. Reason: ${result.reason}. The report tab will remain open for debugging.`);
                    await chrome.tabs.update(tempTabId, { active: true });
                    return;
                }

            } catch (error) {
                logger.error("Error in findAndOpenCase flow:", error);
                logToTab(senderTabId, `A critical error occurred: ${error.message}`);
                if (tempTab?.id) {
                    await chrome.tabs.update(tempTab.id, { active: true });
                }
            } finally {
                 if (tempTab?.id && closeReportTabOnSuccess) {
                    try {
                        await chrome.tabs.remove(tempTab.id);
                        logger.info(`Successfully closed temporary tab ${tempTab.id}`);
                    } catch (e) {
                        logger.warn(`Could not close temp tab ${tempTab.id}: ${e.message}`);
                    }
                }
            }
        })();
        return true;
    }
    return false;
});

logger.info("Background: Service worker listeners attached and ready.");
// End of file
