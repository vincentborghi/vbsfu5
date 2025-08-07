// background.js - With Unified Data Model, Enhanced Logging, and Leveled Logging

// The logger is now imported as an ES module.
// The global psmhLogger will be initialized by logger.js itself.
import './logger.js';
const logger = globalThis.psmhLogger;

logger.info("Background service worker started.");

// A Set to keep track of tab IDs used for scraping.
const scraperTabIds = new Set();

// Set default settings on first install.
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        logger.info("First install: Setting defaults for log level, Alt+C shortcut, and From address.");
        await chrome.storage.sync.set({
            logLevel: 'INFO',
            closeOnAltC: true,
            preferredFromAddress: 'PSM-Support-Email <psm-support-email@atos.net>'
        });
    }
});

// --- Listener to inject UI on valid pages ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Inject only when the tab is fully loaded and has a valid URL.
    if (changeInfo.status === 'complete' && tab.url) {
        
        // Check if the tab is a scraper tab. If so, do nothing.
        if (scraperTabIds.has(tabId)) {
            logger.debug(`Tab ${tabId} is a scraper tab. Skipping UI injection.`);
            return;
        }

        // Check if the URL matches the pattern for a main Salesforce page where the UI should appear.
        //const urlPattern = /https:\/\/(myatos\.lightning\.force\.com|myatos--preprod\.sandbox\.lightning\.force\.com)\/lightning\/(r|o)\/(Case|WorkOrder)/;
        // finally I want it everywhere in PSM saleforce: 
        const urlPattern = /https:\/\/(myatos\.lightning\.force\.com|myatos--preprod\.sandbox\.lightning\.force\.com)\/lightning\/(r|o)\//;
        if (urlPattern.test(tab.url)) {
            logger.info(`Main SF page detected (Tab ID: ${tabId}). Injecting UI panel...`);
            // Inject CSS first
            chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ["styles.css"]
            }).catch(err => logger.error(`Failed to inject CSS into tab ${tabId}:`, err));

            // Then inject the scripts
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ["content.js", "panel_injector.js"]
            }).catch(err => logger.error(`Failed to inject scripts into tab ${tabId}:`, err));
        }
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
                const dateObject = new Date(year, month, day, hour, minute);
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
            
            scraperTabIds.add(tempTabId); // "Tag" the tab

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
                }, 14000);
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
                try { 
                    await chrome.tabs.remove(tempTab.id); 
                    scraperTabIds.delete(tempTab.id); // "Untag" the tab
                }
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

function updateStatusOnTab(tabId, message, type = 'info') {
    if (tabId) {
        chrome.tabs.sendMessage(tabId, { action: "updateStatus", message, type }).catch(err => logger.warn(`Could not update status on tab ${tabId}: ${err.message}.`));
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    logger.debug("Background received message:", message);

    if (message.action === "startFullViewGeneration") {
        (async () => {
            const initialTabId = sender.tab?.id;
            if (!initialTabId) {
                logger.error("Could not get sender tab ID for 'startFullViewGeneration'");
                return;
            }

            updateStatusOnTab(initialTabId, "Scanning page for details...", "info");
            logger.info("BG: Sending 'scrapeInitialPage' message to content script.");
            const initialDataResults = await chrome.tabs.sendMessage(initialTabId, { action: "scrapeInitialPage" });

            if (!initialDataResults || initialDataResults.error || !initialDataResults.caseDetails) {
                updateStatusOnTab(initialTabId, `Error: Could not scrape initial case details. Reason: ${initialDataResults?.error || 'Unknown'}`, 'error');
                logger.error("Failed to get a response from scrapeInitialPage.", initialDataResults);
                return;
            }
            logger.info("BG: Received 'scrapeInitialPage' results:", initialDataResults);


            const { caseDetails, notesViewAllUrl, emailsViewAllUrl, workOrdersViewAllUrl } = initialDataResults;
            let notesToFetch = [];
            let emailsToFetch = [];
            let workOrdersData = { html: '<p>No related work orders found.</p>', count: 0 };

            // Process Notes list
            if (notesViewAllUrl) {
                updateStatusOnTab(initialTabId, "Found Notes list, getting all items...", "info");
                logger.info("NOTES_LOG (BG): Creating a small, FOCUSED popup window to ensure Notes component loads.");
                const noteListWindow = await chrome.windows.create({ url: notesViewAllUrl, focused: true, type: 'popup', width: 500, height: 600 });
                const noteListTabId = noteListWindow.tabs[0].id;
                scraperTabIds.add(noteListTabId); // "Tag" the tab
                logger.info("NOTES_LOG (BG): Notes window/tab created with ID:", noteListTabId);
                
                await chrome.scripting.executeScript({ target: { tabId: noteListTabId }, files: ['logger.js', 'note_list_scraper.js'] });
                logger.info("NOTES_LOG (BG): Injected note_list_scraper.js. Waiting for response...");

                const noteListResponse = await new Promise(resolve => { const listener = (msg, sender) => { if (sender.tab?.id === noteListTabId && msg.type === 'noteListScrapeResult') { chrome.runtime.onMessage.removeListener(listener); resolve(msg); } return true; }; chrome.runtime.onMessage.addListener(listener); });
                notesToFetch = noteListResponse.data || [];
                logger.info(`NOTES_LOG (BG): Received ${notesToFetch.length} note items from scraper.`, notesToFetch);
                await chrome.windows.remove(noteListWindow.id);
                scraperTabIds.delete(noteListTabId); // "Untag" the tab
                logger.info("NOTES_LOG (BG): Closed notes list window.");
            } else {
                logger.warn("NOTES_LOG (BG): No 'View All' URL for Notes was found.");
            }

            // Process Emails list
            if (emailsViewAllUrl) {
                updateStatusOnTab(initialTabId, "Found Emails list, getting all items...", "info");
                logger.info("BG: Opening Emails 'View All' page in hidden tab:", emailsViewAllUrl);
                const emailListTab = await chrome.tabs.create({ url: emailsViewAllUrl, active: false });
                const emailListTabId = emailListTab.id;
                scraperTabIds.add(emailListTabId); // "Tag" the tab
                logger.debug("BG: Emails tab created with ID:", emailListTabId);

                await chrome.scripting.executeScript({ target: { tabId: emailListTabId }, files: ['logger.js', 'email_list_scraper.js'] });
                logger.debug("BG: Injected email_list_scraper.js. Waiting for response...");

                const emailListResponse = await new Promise(resolve => { const listener = (msg, sender) => { if (sender.tab?.id === emailListTabId && msg.type === 'emailListScrapeResult') { chrome.runtime.onMessage.removeListener(listener); resolve(msg); } return true; }; chrome.runtime.onMessage.addListener(listener); });
                emailsToFetch = emailListResponse.data || [];
                logger.info(`BG: Received ${emailsToFetch.length} emails from scraper.`);
                await chrome.tabs.remove(emailListTabId);
                scraperTabIds.delete(emailListTabId); // "Untag" the tab
                logger.debug("BG: Closed emails list tab.");
            } else {
                 logger.warn("BG: No 'View All' URL for Emails was found.");
            }
            
            // Process Work Orders list
            if (workOrdersViewAllUrl) {
                updateStatusOnTab(initialTabId, "Found Work Orders list, getting table...", "info");
                const woListTab = await chrome.tabs.create({ url: workOrdersViewAllUrl, active: false });
                const woListTabId = woListTab.id;
                scraperTabIds.add(woListTabId); // "Tag" the tab
                await chrome.scripting.executeScript({ target: { tabId: woListTabId }, files: ['logger.js', 'work_order_list_scraper.js'] });
                const woListResponse = await new Promise(resolve => { const listener = (msg, sender) => { if (sender.tab?.id === woListTabId && msg.type === 'workOrderScrapeResult') { chrome.runtime.onMessage.removeListener(listener); resolve(msg); } return true; }; chrome.runtime.onMessage.addListener(listener); });
                workOrdersData = woListResponse.data || workOrdersData;
                await chrome.tabs.remove(woListTabId);
                scraperTabIds.delete(woListTabId); // "Untag" the tab
            }

            updateStatusOnTab(initialTabId, `Found ${notesToFetch.length} notes, ${emailsToFetch.length} emails. Fetching content...`, "info");

            let noteDetailsMap, emailDetailsMap;
            const totalItems = notesToFetch.length + emailsToFetch.length;

            if (totalItems <= 5) {
                logger.info(`BG: Total items (${totalItems}) is 5 or less. Fetching in parallel for speed.`);
                const notesPromise = fetchAllDetailsViaTabs(notesToFetch, 'Note', initialTabId);
                const emailsPromise = fetchAllDetailsViaTabs(emailsToFetch, 'Email', initialTabId);
                [noteDetailsMap, emailDetailsMap] = await Promise.all([notesPromise, emailsPromise]);
            } else {
                logger.info(`BG: Total items (${totalItems}) is more than 5. Fetching sequentially for stability.`);
                updateStatusOnTab(initialTabId, `Fetching ${notesToFetch.length} notes...`, "info");
                noteDetailsMap = await fetchAllDetailsViaTabs(notesToFetch, 'Note', initialTabId);
                
                updateStatusOnTab(initialTabId, `Fetching ${emailsToFetch.length} emails...`, "info");
                emailDetailsMap = await fetchAllDetailsViaTabs(emailsToFetch, 'Email', initialTabId);
            }
            
            logger.info("BG: All details fetched.", { noteDetailsMap, emailDetailsMap });
            
            const allItems = [...Object.values(noteDetailsMap), ...Object.values(emailDetailsMap)];
            
            // Build and open the final HTML
            updateStatusOnTab(initialTabId, "Assembling final report...", "info");
            const finalHtml = buildFullViewHtml(caseDetails, allItems, workOrdersData);
            const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(finalHtml);
            chrome.windows.create({ url: dataUrl, type: 'normal' });
            updateStatusOnTab(initialTabId, "Report generated successfully!", "success");

        })();
        return true; // Indicates async response
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
                const tempTabId = tempTab.id;
                scraperTabIds.add(tempTabId); // "Tag" the tab
                
                if (senderTabId) {
                    logToTab(senderTabId, `Switching focus back to this tab.`);
                    await chrome.tabs.update(senderTabId, { active: true });
                    logger.debug(`Switched focus back to original tab ID: ${senderTabId}`);
                }

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
                 if (tempTab?.id) {
                    scraperTabIds.delete(tempTab.id); // "Untag" the tab before closing or leaving open
                    if (closeReportTabOnSuccess) {
                        try {
                            await chrome.tabs.remove(tempTab.id);
                            logger.info(`Successfully closed temporary tab ${tempTab.id}`);
                        } catch (e) {
                            logger.warn(`Could not close temp tab ${tempTab.id}: ${e.message}`);
                        }
                    }
                }
            }
        })();
        return true;
    }
    return false;
});

/**
 * Builds the final HTML for the "Full View" tab.
 * @param {object} caseDetails - The basic details scraped from the case page.
 * @param {Array} timelineItems - The fully processed array of notes and/or emails.
 * @param {object} workOrdersData - The scraped data for the work orders table.
 * @returns {string} The complete HTML document as a string.
 */
function buildFullViewHtml(caseDetails, timelineItems = [], workOrdersData = {count: 0, html: ''}) {
    const now = new Date();
    const generatedTime = now.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
    
    const safeRecordNumber = escapeHtml(caseDetails.recordNumber || 'N/A');
    const safeSubject = escapeHtml(caseDetails.subject || 'N/A');
    const safeObjectType = escapeHtml(caseDetails.objectType || 'Case');
    const safeAccountName = escapeHtml(caseDetails.accountName || 'N/A');

    // Use the exact URL captured from the page when the process started.
    const caseUrl = caseDetails.caseUrl || '#'; // Fallback to '#' if URL is missing
    const titleHtml = `<a href="${caseUrl}" target="_blank" style="text-decoration: none; color: inherit;">${safeObjectType} ${safeRecordNumber}: ${safeSubject}</a>`;

    const woCount = workOrdersData.count;
    const woScrollClass = woCount > 6 ? 'wo-table-scrollable' : '';
    const workOrdersSummaryHtml = `
        <div class="wo-summary-container">
            <h3>${woCount} Work Order(s)</h3>
            ${woCount > 0 ? `<div class="${woScrollClass}">${workOrdersData.html}</div>` : '<p><i>No related work orders found.</i></p>'}
        </div>
    `;
    
    const processedNotes = timelineItems.filter(i => i.type === 'Note');
    const processedEmails = timelineItems.filter(i => i.type === 'Email');

    // Combine and sort all items by date
    const validTimelineItems = timelineItems.filter(item => item.dateObject && !isNaN(new Date(item.dateObject).getTime()));
    validTimelineItems.sort((a, b) => new Date(a.dateObject) - new Date(b.dateObject));

    let timelineHtml = '';
    if (validTimelineItems.length === 0) {
        timelineHtml = "<p>No Notes or Emails found or extracted successfully.</p>";
    } else {
        validTimelineItems.forEach(item => {
            let contentHtml = '';
            if (item.content && (item.content.startsWith('Error:') || item.content.startsWith('[Fetch Error') || item.content.startsWith('[Body Fetch Error') || item.content.startsWith('[Content'))) {
               contentHtml = `<span class="error-message">${escapeHtml(item.content)}</span>`;
            } else {
               contentHtml = item.content || '<i>[Content Missing]</i>';
               // For "New Case" emails, reduce the large font size and remove useless spans.
               if (item.type === 'Email' && item.title && item.title.startsWith('New Case')) {
                   contentHtml = contentHtml.replace(/size="5"/g, 'size="3"');
                   contentHtml = contentHtml.replace(/<span style="background-color: rgb\(255, 255, 255\);">/g, '');
                   contentHtml = contentHtml.replace(/<\/span>/g, '');
               }

               // Fix for relative image URLs from Salesforce servers
               if (contentHtml.includes('src="/sfc/')) {
                   const fileServer = 'https://myatos.file.force.com';
                   contentHtml = contentHtml.replace(/src="\/sfc\//g, `src="${fileServer}/sfc/`);
               }
            }

            let visibilityLabel = '';
            if (item.type === 'Note') {
                if (item.isPublic === true) visibilityLabel = `<span class="item-visibility public">(public)</span>`;
                else if (item.isPublic === false) visibilityLabel = `<span class="item-visibility internal">(internal)</span>`;
            }

            let formattedTimestamp = 'N/A';
            if (item.dateObject) {
                formattedTimestamp = new Date(item.dateObject).toLocaleString(undefined, {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            } else {
                formattedTimestamp = escapeHtml(item.dateStr || 'Date Error');
            }

            const itemTypeClass = `type-${escapeHtml(item.type?.toLowerCase() || 'unknown')}`;
            const itemTypeLabel = escapeHtml(item.type || 'Item');
            const itemTitle = escapeHtml(item.title || 'N/A');
            const itemAuthor = escapeHtml(item.author || 'N/A');
            const itemTo = escapeHtml(item.to || 'N/A');

            let headerMetaDetails = (item.type === 'Email')
                ? `<span class="item-meta"><span class="item-meta-label">From:</span> <span class="item-meta-info">${itemAuthor}</span> | <span class="item-meta-label">To:</span> <span class="item-meta-info">${itemTo}</span></span>`
                : `<span class="item-meta"><span class="item-meta-label">By:</span> <span class="item-meta-info"><strong>${itemAuthor}</strong></span></span>`;

            timelineHtml += `
            <div class="timeline-item">
                <div class="item-header">
                    <strong class="item-type-label ${itemTypeClass}">${itemTypeLabel}</strong>
                    ${visibilityLabel} <span class="item-timestamp">[${formattedTimestamp}]</span> -
                    <span class="item-subject-title">${itemTitle}</span>
                    ${headerMetaDetails}
                </div>
                <div class="item-content">${contentHtml}</div>
                <div class="item-attachments">Attachments: ${escapeHtml(item.attachments || 'N/A')}</div>
            </div>`;
        });
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${safeObjectType} ${safeRecordNumber}: ${safeSubject}</title>
        <style>
            html { scroll-behavior: smooth; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.4; padding: 15px 25px; margin: 0; color: #333; background-color: #f9f9f9; }
            h1, h2 { border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-top: 25px; margin-bottom: 15px; color: #1a5f90; font-weight: 600; }
            h1 { font-size: 1.7em; } h2 { font-size: 1.4em; }
            .meta-info-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 25px; border-radius: 5px; background-color: #eef3f8; border: 1px solid #d1e0ee; flex-wrap: wrap; }
            .customer-account-info { font-size: 1.1em; font-weight: 600; color: #005a9e; }
            .generation-info { font-size: 0.85em; color: #555; text-align: right; display: flex; align-items: center; gap: 15px;}
            .copy-button { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #fff; background-color: #007bff; border: 1px solid #007bff; border-radius: 5px; padding: 8px 12px; cursor: pointer; }
            .copy-button:hover { background-color: #0056b3; }
            .copy-button:active { background-color: #004085; }
            .record-details { background-color: #fff; border: 1px solid #e1e5eb; padding: 15px 20px; border-radius: 5px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            .record-details h2 { margin-top: 0; }
            .details-and-wo-wrapper { display: grid; grid-template-columns: auto 1fr; gap: 30px; align-items: start; margin-bottom: 25px; }
            .details-grid { grid-template-columns: auto 1fr; gap: 4px 10px; align-items: start; display: grid; margin-bottom: 0; }
            .details-grid dt { grid-column: 1; font-weight: 600; color: #005fb2; text-align: right; padding-right: 8px; white-space: nowrap; }
            .details-grid dd { grid-column: 2; margin-left: 0; word-wrap: break-word; text-align: left; }
            .wo-summary-container h3 { margin-top: 0; font-size: 1.4em; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 15px; color: #1a5f90; font-weight: 600; }
            .wo-table-scrollable { max-height: 250px; overflow-y: auto; border: 1px solid #dddbda; border-radius: 4px; }
            .wo-summary-container .slds-table { font-size: 0.9em; }
            .wo-summary-container p i { color: #666; }
            .description-label { font-weight: 600; color: #005fb2; margin-bottom: 5px; display: block; }
            .record-details .description-content { white-space: pre-wrap; word-wrap: break-word; margin-top: 0px; padding: 10px 12px; background-color: #f1f1f1; border-radius: 4px; font-size: 0.95em; max-height: 400px; overflow-y: auto; border: 1px solid #e0e0e0; }
            .timeline-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 15px; }
            .timeline-header h2 { margin: 0; border: none; padding: 0; }
            #toggle-all-timeline { cursor: pointer; font-size: 0.9em; color: #007bff; text-decoration: none; }
            #toggle-all-timeline:hover { text-decoration: underline; }
            .timeline-item { border: 1px solid #e1e5eb; padding: 12px 18px; margin-bottom: 10px; border-radius: 5px; background-color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04); position: relative; }
            .timeline-item.type-note { border-left: 5px solid #6b92dc; }
            .timeline-item.type-email { border-left: 5px solid #770101; }
            .item-header { font-size: 0.95em; color: #444; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 6px; line-height: 1.4; background-color: #fffbe6; cursor: pointer; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .timeline-item.collapsed .item-content, .timeline-item.collapsed .item-attachments { display: none; }
            .item-timestamp { color: #555; font-family: monospace; margin-right: 10px; font-weight: bold; font-size: 1.2em; background-color:#f0f0f0; padding: 1px 4px; border-radius: 3px; }
            .item-type-label { font-weight: bold; text-transform: uppercase; font-size: 0.85em; margin-right: 5px; }
            .item-type-label.type-note { color: #6b92dc; }
            .item-type-label.type-email { color: #770101; }
            .item-subject-title { font-weight: 600; color: #222; margin-left: 4px; font-size: 1.05em; }
            .item-meta { display: block; font-size: 0.85em; color: #666; margin-top: 3px; }
            .item-meta-label { color: #005fb2; font-weight: 600; }
            .item-meta-info { color: #555; margin-left: 3px; }
            .item-content { white-space: normal; word-wrap: break-word; overflow-wrap: break-word; color: #333; margin-top: 10px; font-size: 0.95em; line-height: 1.45; }
            .item-content a { color: #007bff; }
            .item-attachments { font-style: italic; color: #888; font-size: 0.85em; margin-top: 10px; }
            .error-message { color: red; font-weight: bold; }
            .item-visibility { margin-left: 8px; font-size: 0.9em; font-weight: bold; text-transform: lowercase; padding: 1px 5px; border-radius: 3px; border: 1px solid transparent; }
            .item-visibility.public { color: #8e1b03; background-color: #fdd; border-color: #fbb; }
            .item-visibility.internal { color: #333; background-color: #eee; border-color: #ddd; }
        </style>
        <style media="print">
            @media print {
                body { padding: 10px; font-size: 12px; }
                .generation-info, #toggle-all-timeline, .item-header { cursor: default; }
                .copy-button { display: none !important; }
                .record-details .description-content,
                .wo-table-scrollable {
                    max-height: none !important;
                    overflow: visible !important;
                }
            }
        </style>
    </head>
    <body>
        <h1>${titleHtml}</h1>
        <div class="meta-info-bar">
            <div class="customer-account-info"><strong>Customer Account:</strong> ${safeAccountName}</div>
            <div class="generation-info"><button id="psmh-save-pdf" class="copy-button">Save as PDF</button><span>Generated: ${generatedTime}</span></div>
        </div>
        <div class="record-details">
            <div class="details-and-wo-wrapper">
                 <dl class="details-grid">
                    <dt>Date Created:</dt><dd>${escapeHtml(caseDetails.createdDateStr || 'N/A')}</dd>
                    <dt>Created By:</dt><dd>${escapeHtml(caseDetails.creatorName || 'N/A')}</dd>
                    <dt>Status:</dt><dd>${escapeHtml(caseDetails.status || 'N/A')}</dd>
                    <dt>Owner:</dt><dd>${escapeHtml(caseDetails.owner || 'N/A')}</dd>
                 </dl>
                 <div><h3>Work Orders</h3>${workOrdersSummaryHtml}</div>
            </div>
            <div class="description-label">Description:</div>
            <div class="description-content">${caseDetails.description || '<p><i>Description empty or not found.</i></p>'}</div>
        </div>
        <div class="timeline-header">
            <h2>Timeline / ${timelineItems.length} items (${processedNotes.length} Notes, ${processedEmails.length} Emails)</h2>
            <a href="#" id="toggle-all-timeline">Collapse All</a>
        </div>
        ${timelineHtml}
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const headers = document.querySelectorAll('.item-header');
                headers.forEach(header => {
                    header.addEventListener('click', () => header.closest('.timeline-item').classList.toggle('collapsed'));
                });
                const toggleAllButton = document.getElementById('toggle-all-timeline');
                if (toggleAllButton) {
                    toggleAllButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        const items = document.querySelectorAll('.timeline-item');
                        if (!items.length) return;
                        const shouldCollapse = !items[0].classList.contains('collapsed');
                        items.forEach(item => item.classList.toggle('collapsed', shouldCollapse));
                        e.target.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
                    });
                }

                const savePdfButton = document.getElementById('psmh-save-pdf');
                if (savePdfButton) {
                    savePdfButton.addEventListener('click', () => {
                        window.print();
                    });
                }
            });
        </script>
    </body>
    </html>`;
}


function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') {
      return unsafe === null || typeof unsafe === 'undefined' ? '' : String(unsafe);
  }
  return unsafe
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}


logger.info("Background: Service worker listeners attached and ready.");

// End of file
