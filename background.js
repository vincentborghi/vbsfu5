// background.js - With Unified Data Model and Enhanced Logging

console.log("Background service worker started.");

/**
 * Parses a date string into a Date object.
 * Handles "DD/MM/YYYY HH:MM" format first, then falls back to generic parsing.
 * @param {string} dateString - The date string to parse.
 * @returns {Date|null} - A Date object or null if parsing fails.
 */
function parseDateString(dateString) {
    if (!dateString) return null;

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
                    return dateObject;
                }
            }
        } catch (e) {
            console.error(`Background: Error parsing matched date parts "${dateString}":`, e);
        }
    }

    const parsedFallback = Date.parse(dateString);
    if (!isNaN(parsedFallback)) {
        console.warn(`Background: Used Date.parse fallback for "${dateString}"`);
        return new Date(parsedFallback);
    }

    console.warn(`Background: Could not parse date format "${dateString}"`);
    return null;
}

async function fetchAllDetailsViaTabs(itemsToFetch, itemType, senderTabId) {
    console.log(`Background: Starting CONCURRENT tab automation for ${itemsToFetch.length} ${itemType}(s) from sender tab ${senderTabId}.`);
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
                }).catch(err => console.warn(`Could not send log to tab ${senderTabId}: ${err.message}`));
            }

            console.log(`Background: Processing ${itemType} ${currentIndex}/${itemsToFetch.length}: ${itemUrl}`);
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
                }, 12000);
                const expectedResponseType = itemType === 'Note' ? 'noteScrapeResult' : 'emailScrapeResult';
                const listener = (message, sender) => {
                    if (sender.tab?.id === tempTabId && message.type === expectedResponseType) {
                        clearTimeout(timeout);
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve(message);
                    }
                    // return true;
                    return true;
                };
                chrome.runtime.onMessage.addListener(listener);
            });

            await chrome.scripting.executeScript({ target: { tabId: tempTabId }, files: [scraperScript] });
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
            
            // *** ADDED FOR DEBUGGING ***
            console.log(`--- Fetched ${itemType} Data ---`);
            console.log(JSON.stringify(unifiedResult, null, 2));
            // ***************************

            resultsMap[itemUrl] = unifiedResult;

        } catch (error) {
            console.error(`Background: Error processing ${itemType} ${itemUrl} in tab ${tempTab?.id}:`, error);
            resultsMap[itemUrl] = { type: itemType, title: `[Error processing item]`, author: 'System', content: error.message, dateObject: parseDateString(itemInfo.dateStr) || new Date(), url: itemUrl };
        } finally {
            if (tempTab?.id) {
                try { await chrome.tabs.remove(tempTab.id); }
                catch (e) { console.warn(`Background: Error closing temp tab ${tempTab.id}:`, e.message); }
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

    console.log(`Background: Finished processing all ${itemsToFetch.length} ${itemType}(s) via tabs.`);
    return resultsMap;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
            sendResponse({ status: "success", details: {} });
            return false;
        }
        const itemType = message.items[0].type;
        fetchAllDetailsViaTabs(message.items, itemType, sender.tab?.id)
            .then(resultsMap => {
                sendResponse({ status: "success", details: resultsMap });
            })
            .catch(error => {
                sendResponse({ status: "error", message: error.message });
            });
        return true;
    }
    return false;
});

console.log("Background: Service worker listeners attached and ready.");
