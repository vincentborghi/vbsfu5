// panel_injector.js - Injects the UI, makes it draggable, and handles events.

console.log("PSM Helper: UI Panel Injector Loaded.");

// --- Helper: Wait for an element to appear in the DOM ---
/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=5000] - Timeout in ms (lowered as requested).
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 5000) {
    console.log(`panel_injector.js: Starting waitForElement for selector: "${selector}"`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                console.log(`panel_injector.js: Found element for selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                console.warn(`panel_injector.js: Timeout waiting for selector: "${selector}"`);
                clearInterval(interval);
                resolve(null);
            }
        }, 300);
    });
}

// --- Feature: Inject Custom Information Below the Header Row ---
/**
 * Finds key information on the page and injects it into a custom, visible container.
 * This is now triggered by a button click.
 */
async function injectCustomHeaderInfo() {
    console.log('injectCustomHeaderInfo: "Show Key Info" button clicked. Attempting to inject info...');
    const statusDiv = document.getElementById('vbsfu-status');
    statusDiv.textContent = 'Gathering info...';
    
    // Find the currently active Salesforce tab button to reliably get the panel ID.
    const activeTabButtonSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]';
    const activeTabButton = await waitForElement(activeTabButtonSelector);
     if (!activeTabButton) {
        console.error("injectCustomHeaderInfo: Could not find the active Salesforce tab button. Selector used:", activeTabButtonSelector);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Active tab not found.';
            statusDiv.style.color = 'var(--vbsfu-status-error)';
        }
        return;
    }
    console.log("injectCustomHeaderInfo: Found active tab button.", activeTabButton);

    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        console.error("injectCustomHeaderInfo: Active tab button has no 'aria-controls' ID.");
        if (statusDiv) {
            statusDiv.textContent = 'Error: Could not identify tab content.';
            statusDiv.style.color = 'var(--vbsfu-status-error)';
        }
        return;
    }
    console.log("injectCustomHeaderInfo: Found panel ID:", panelId);
    
    const activeTabPanel = document.getElementById(panelId);
    if (!activeTabPanel) {
        console.error(`injectCustomHeaderInfo: Could not find tab panel with ID: ${panelId}`);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Could not find tab content.';
            statusDiv.style.color = 'var(--vbsfu-status-error)';
        }
        return;
    }
    console.log("injectCustomHeaderInfo: Found active tab panel.", activeTabPanel);

    // 1. Find the anchor element to insert our container after.
    const anchorElementSelector = 'div.slds-grid.primaryFieldRow';
    const anchorElement = await waitForElement(anchorElementSelector, activeTabPanel);
    if (!anchorElement) {
        console.warn('injectCustomHeaderInfo: Anchor element not found. Selector used:', anchorElementSelector);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Page structure not recognized.';
            statusDiv.style.color = 'var(--vbsfu-status-error)';
        }
        return;
    }
    console.log("injectCustomHeaderInfo: Found anchor element.", anchorElement);

    // 2. Find or create our main container for custom info within the active tab.
    let infoContainer = activeTabPanel.querySelector('.vbsfu-custom-info-container');
    if (infoContainer) {
        console.log("injectCustomHeaderInfo: Found existing info container.");
    } else {
        console.log("injectCustomHeaderInfo: Creating new info container.");
        infoContainer = document.createElement('div');
        infoContainer.className = 'vbsfu-custom-info-container';
        infoContainer.style.cssText = `padding: 6px; margin: 6px 0; border-top: 1px solid #dddbda; border-bottom: 1px solid #dddbda;`;
        anchorElement.insertAdjacentElement('afterend', infoContainer);
    }
    
    // --- Build the info string ---
    let infoParts = [];
    
    // Get Account Name
    const accountSelector = `
      records-record-layout-item[field-label="Account Name"],
      records-record-layout-item[field-label="Account"]
    `;
    const accountItemContainer = await waitForElement(accountSelector, activeTabPanel);
    console.log("injectCustomHeaderInfo: Searching for Account with selector:", accountSelector);
    if (accountItemContainer) {
        const accountNameElement = accountItemContainer.querySelector('force-lookup a');
        const accountName = accountNameElement?.textContent?.trim();
        if (accountName) {
            console.log("injectCustomHeaderInfo: Found Account Name:", accountName);
            infoParts.push(`Account: ${accountName}`);
        } else {
            console.warn("injectCustomHeaderInfo: Found Account container but no name inside.");
            infoParts.push(`Account: N/A`);
        }
    } else {
        console.warn("injectCustomHeaderInfo: Account container not found.");
    }

    // Get CreatedBy
    const createdBySelector = 'records-record-layout-item[field-label="Created By"]';
    const createdByContainer = await waitForElement(createdBySelector, activeTabPanel);
    console.log("injectCustomHeaderInfo: Searching for Created By with selector:", createdBySelector);
    if (createdByContainer) {
        const createdByElement = createdByContainer.querySelector('force-lookup a');
        const createdBy = createdByElement?.textContent?.trim();
        if (createdBy) {
            console.log("injectCustomHeaderInfo: Found Created By:", createdBy);
            infoParts.push(`Created By: ${createdBy}`);
        }
    } else {
        console.warn("injectCustomHeaderInfo: Created By container not found.");
    }

    // --- Display the combined info ---
    infoContainer.innerHTML = ''; // Clear previous info
    if (infoParts.length > 0) {
        const infoDisplayDiv = document.createElement('div');
        infoDisplayDiv.className = 'vbsfu-info-display';
        infoDisplayDiv.style.cssText = `font-size: 1.1em; font-weight: 600; color: #664d03; background-color: #fffbe6; padding: 8px 14px; border-radius: 6px; border-left: 5px solid #ffc107;`;
        infoDisplayDiv.textContent = infoParts.join(' / ');
        infoContainer.appendChild(infoDisplayDiv);
        console.log(`injectCustomHeaderInfo: Displayed Info: "${infoParts.join(' / ')}"`);
        if (statusDiv) {
            statusDiv.textContent = 'Key info shown.';
            statusDiv.style.color = 'var(--vbsfu-status-success)';
        }
    } else {
        console.warn("injectCustomHeaderInfo: No info parts were found to display.");
        if (statusDiv) {
            statusDiv.textContent = 'Could not find info.';
            statusDiv.style.color = 'var(--vbsfu-status-warn)';
        }
    }
}


async function autofillCommunity() {
    console.log('autofillCommunity: called');
    const statusDiv = document.getElementById('vbsfu-status');
    statusDiv.textContent = 'Autofilling Community Info...';
    statusDiv.style.color = 'var(--vbsfu-status-warn)';

    console.log("autofillCommunity: Looking for LWC dropdowns for Language, Timezone, Locale, Currency, and Email Encoding.");

    // Define selectors and desired values for the fields
    const languageSelectSelector = 'select[name="choLanguage"]';
    const desiredLanguageValue = 'chopickLanguage.fr';
    const desiredLanguageText = 'French';

    const timezoneSelectSelector = 'select[name="pickTimezone"]';
    const desiredTimezoneValue = 'chopickTimezone.Europe/Paris';
    const desiredTimezoneText = 'Europe/Paris';

    const localeSelectSelector = 'select[name="choLocale"]';
    const desiredLocaleValue = 'chopickLocale.fr_FR'; // Sensible default for French
    const desiredLocaleText = 'French (France)';

    const currencySelectSelector = 'select[name="choCurrency"]';
    const desiredCurrencyValue = 'chopickCurrency.EUR';
    const desiredCurrencyText = 'EUR';

    const emailEncodingSelectSelector = 'select[name="pickEmailEncoding"]';
    const desiredEmailEncodingValue = 'chopickEmailEncoding.UTF-8';
    const desiredEmailEncodingText = 'Unicode (UTF-8)';

    // Helper function to find a select, set its value, and dispatch the necessary event
    const setSelectValue = async (selector, value, fieldName) => {
        console.log(`autofillCommunity: Attempting to set ${fieldName} with selector: "${selector}"`);
        const selectElement = await waitForElement(selector, document, 3000);

        if (!selectElement) {
            console.error(`autofillCommunity: Could not find the ${fieldName} select element using selector: "${selector}"`);
            return false;
        }
        console.log(`autofillCommunity: Found ${fieldName} select element.`, selectElement);

        // Set the value directly to the correct option value
        selectElement.value = value;
        console.log(`autofillCommunity: Set ${fieldName} value to "${value}"`);

        // Dispatch a 'change' event. This is crucial for the LWC to recognize the update.
        const event = new Event('change', { bubbles: true });
        selectElement.dispatchEvent(event);
        console.log(`autofillCommunity: Dispatched 'change' event for ${fieldName}.`);

        // Brief pause to allow the UI to react and verification
        await new Promise(resolve => setTimeout(resolve, 100));
        if (selectElement.value === value) {
            console.log(`autofillCommunity: Verification successful for ${fieldName}.`);
            return true;
        } else {
            console.warn(`autofillCommunity: Verification FAILED for ${fieldName}. Current value is "${selectElement.value}"`);
            return false;
        }
    };

    // Execute the autofill for each field sequentially
    const langSuccess = await setSelectValue(languageSelectSelector, desiredLanguageValue, 'Language');
    const timezoneSuccess = await setSelectValue(timezoneSelectSelector, desiredTimezoneValue, 'Timezone');
    const localeSuccess = await setSelectValue(localeSelectSelector, desiredLocaleValue, 'Locale');
    const currencySuccess = await setSelectValue(currencySelectSelector, desiredCurrencyValue, 'Currency');
    const emailEncodingSuccess = await setSelectValue(emailEncodingSelectSelector, desiredEmailEncodingValue, 'Email Encoding');

    // Update the status panel based on the outcome
    if (langSuccess && timezoneSuccess && localeSuccess && currencySuccess && emailEncodingSuccess) {
        statusDiv.textContent = `Autofilled 5 fields successfully!`;
        statusDiv.style.color = 'var(--vbsfu-status-success)';
    } else {
        statusDiv.textContent = 'Error: Failed to autofill one or more fields.';
        statusDiv.style.color = 'var(--vbsfu-status-error)';
    }
}

/**
 * Finds the "From" address dropdown in a Salesforce "New Email" form and selects a specific address.
 * This version is updated to work with Salesforce Aura components.
 */
async function autofillFromAddress() {
    console.log('autofillFromAddress: "Autofill From Address" button clicked.');
    const statusDiv = document.getElementById('vbsfu-status');
    statusDiv.textContent = 'Searching for "From" dropdown...';
    statusDiv.style.color = 'var(--vbsfu-status-warn)';

    // Step 1: Find the "From" label span.
    console.log('autofillFromAddress: Searching for label span with text "From".');
    const allLabels = document.querySelectorAll('span.form-element__label');
    let fromLabel = null;
    for (const label of allLabels) {
        // The text can be in the span directly or in a child span.
        if (label.textContent.trim() === 'From') {
            fromLabel = label;
            console.log('autofillFromAddress: Found "From" label element:', fromLabel);
            break;
        }
    }

    if (!fromLabel) {
        console.error('autofillFromAddress: Could not find a label for "From". The "New Email" form might not be open.');
        statusDiv.textContent = 'Error: "From" field label not found.';
        statusDiv.style.color = 'var(--vbsfu-status-error)';
        return;
    }

    // Step 2: Find the associated trigger link (<a>) from the label's parent container.
    const container = fromLabel.closest('.uiInput.uiInputSelect');
    if (!container) {
        console.error('autofillFromAddress: Could not find the parent container (.uiInput.uiInputSelect) for the label.');
        statusDiv.textContent = 'Error: "From" field container not found.';
        statusDiv.style.color = 'var(--vbsfu-status-error)';
        return;
    }
    console.log('autofillFromAddress: Found parent container:', container);
    
    const dropdownTrigger = container.querySelector('a[role="combobox"]');
    if (!dropdownTrigger) {
         console.error('autofillFromAddress: Could not find the dropdown trigger link inside the container.');
         statusDiv.textContent = 'Error: Cannot click "From" dropdown.';
         statusDiv.style.color = 'var(--vbsfu-status-error)';
         return;
    }

    console.log('autofillFromAddress: Clicking the dropdown trigger.', dropdownTrigger);
    dropdownTrigger.click();

    // Step 3: Wait for the desired option to appear and click it. In Aura, this is typically a `li.uiMenuItem a`.
    const desiredEmail = 'PSM-Support-Email <psm-support-email@atos.net>';
    const optionSelector = `li.uiMenuItem a[title="${desiredEmail}"]`;
    
    console.log(`autofillFromAddress: Waiting for option with selector: "${optionSelector}"`);
    const emailOptionElement = await waitForElement(optionSelector, document, 3000);

    if (!emailOptionElement) {
        console.error(`autofillFromAddress: The email option "${desiredEmail}" was not found in the dropdown.`);
        statusDiv.textContent = `Error: Option "${desiredEmail}" not found.`;
        statusDiv.style.color = 'var(--vbsfu-status-error)';
        // If the dropdown is still open, click the trigger again to close it.
        if (dropdownTrigger.getAttribute('aria-expanded') === 'true') {
            console.log('autofillFromAddress: Closing dropdown because option was not found.');
            dropdownTrigger.click();
        }
        return;
    }

    console.log('autofillFromAddress: Found email option element. Clicking it.', emailOptionElement);
    emailOptionElement.click();

    // A brief pause to allow the UI to update, then confirm the change.
    await new Promise(resolve => setTimeout(resolve, 300));
    const selectedText = dropdownTrigger.textContent?.trim();
    
    if (selectedText.includes('psm-support-email@atos.net')) { // Check for a unique part of the email
        statusDiv.textContent = `Autofilled "${desiredEmail}"!`;
        statusDiv.style.color = 'var(--vbsfu-status-success)';
        console.log('autofillFromAddress: Successfully autofilled. New value confirmed:', selectedText);
    } else {
        console.warn('autofillFromAddress: Clicked the option, but the new value was not immediately reflected. Current value:', selectedText);
        statusDiv.textContent = 'Autofill may have failed.';
        statusDiv.style.color = 'var(--vbsfu-status-warn)';
    }
}


// --- Draggable Panel Logic ---
function makePanelDraggable(panel, header) {
    console.log('makePanelDraggable: Initializing for panel:', panel);
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let toggleButton = document.getElementById('vbsfu-toggle');

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        console.log('dragMouseDown: Mouse down on header.');
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        console.log('dragMouseDown: Attaching mousemove and mouseup listeners.');
        header.style.cursor = 'grabbing';
    }

    function elementDrag(e) {
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        let newTop = panel.offsetTop - pos2;
        let newLeft = panel.offsetLeft - pos1;
        console.log(`elementDrag: Dragging panel to top: ${newTop}px, left: ${newLeft}px`);
        panel.style.top = newTop + "px";
        panel.style.left = newLeft + "px";
        if (toggleButton) {
           console.log(`elementDrag: Dragging toggle button to top: ${newTop}px`);
           toggleButton.style.top = newTop + "px";
        }
    }

    function closeDragElement() {
        console.log('closeDragElement: Mouse up. Removing listeners.');
        document.onmouseup = null;
        document.onmousemove = null;
        header.style.cursor = 'grab';
    }
}


// --- Main UI Injection ---
function injectUI() {
    if (document.getElementById('vbsfu-panel')) {
        console.log('injectUI: Panel already exists. Aborting injection.');
        return; 
    }
    console.log('injectUI: Injecting main UI panel...');

    const panel = document.createElement('div');
    panel.id = 'vbsfu-panel';
    const header = document.createElement('div');
    header.id = 'vbsfu-header';
    const title = document.createElement('h4');
    title.textContent = 'PSM Helper';
    header.appendChild(title);

    const content = document.createElement('div');
    content.id = 'vbsfu-content';

    const showInfoButton = document.createElement('button');
    showInfoButton.id = 'vbsfu-show-info';
    showInfoButton.textContent = 'Show Key Info';
    showInfoButton.className = 'vbsfu-button';
    
    const autofillButton = document.createElement('button');
    autofillButton.id = 'vbsfu-autofill-from';
    autofillButton.textContent = 'Autofill From Address';
    autofillButton.className = 'vbsfu-button';

    const autofillCommButton = document.createElement('button');
    autofillCommButton.id = 'vbsfu-autofill-comm';
    autofillCommButton.textContent = 'Autofill Community Info';
    autofillCommButton.className = 'vbsfu-button';

    const generateButton = document.createElement('button');
    generateButton.id = 'vbsfu-generate';
    generateButton.textContent = 'Generate Full View';
    generateButton.className = 'vbsfu-button';

    const copyButton = document.createElement('button');
    copyButton.id = 'vbsfu-copy';
    copyButton.textContent = 'Copy Record Link';
    copyButton.className = 'vbsfu-button';

    const aboutButton = document.createElement('button');
    aboutButton.id = 'vbsfu-about';
    aboutButton.textContent = 'About';
    aboutButton.className = 'vbsfu-button';

    const debugButton = document.createElement('button');
    debugButton.id = 'vbsfu-debug';
    debugButton.textContent = 'Debug to console';
    debugButton.className = 'vbsfu-button';

    const statusDiv = document.createElement('div');
    statusDiv.id = 'vbsfu-status';
    statusDiv.textContent = 'Ready.';
    
    // New button order
    content.appendChild(showInfoButton);
    content.appendChild(autofillButton);
    content.appendChild(autofillCommButton);
    content.appendChild(generateButton);
    content.appendChild(copyButton);
    content.appendChild(aboutButton);
    content.appendChild(debugButton);

    panel.appendChild(header);
    panel.appendChild(content);
    panel.appendChild(statusDiv);

    const toggleButton = document.createElement('button');
    toggleButton.id = 'vbsfu-toggle';
    toggleButton.innerHTML = '&#x1F6E0;&#xFE0F;';
    toggleButton.setAttribute('aria-label', 'Toggle Panel');

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'vbsfu-modal-overlay';
    const modalContent = document.createElement('div');
    modalContent.id = 'vbsfu-modal-content';
    const modalClose = document.createElement('button');
    modalClose.id = 'vbsfu-modal-close';
    modalClose.innerHTML = '&times;';
    const modalTitle = document.createElement('h5');
    modalTitle.textContent = 'PSM Helper';
    const modalBody = document.createElement('div');
    modalBody.id = 'vbsfu-modal-body';
    const extensionVersion = chrome.runtime.getManifest().version;
    modalBody.innerHTML = `<p><strong>Version:</strong> ${extensionVersion} (July 2025)</p>
      <p>This Chrome extension is experimental and is not an official tool from Atos IT (the developers of PSM).</p>
      <p>For information or feedback, contact <b>Vincent Borghi</b>.</p>`;
    modalContent.appendChild(modalClose);
    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalBody);
    modalOverlay.appendChild(modalContent);

    document.body.appendChild(panel);
    document.body.appendChild(toggleButton);
    document.body.appendChild(modalOverlay);
    console.log('injectUI: All UI elements appended to the body.');

    makePanelDraggable(panel, header);

    // --- Event Listeners ---
    console.log('injectUI: Attaching event listeners.');
    toggleButton.onclick = () => {
        console.log('toggleButton.onclick: Toggle button clicked.');
        panel.classList.toggle('vbsfu-visible');
        if (panel.classList.contains('vbsfu-visible')) {
            console.log('toggleButton.onclick: Panel is now visible.');
            statusDiv.textContent = 'Ready.';
            statusDiv.style.color = 'var(--vbsfu-button-text)';
        } else {
            console.log('toggleButton.onclick: Panel is now hidden.');
        }
    };
    aboutButton.onclick = () => {
        console.log('aboutButton.onclick: About button clicked, showing modal.');
        modalOverlay.classList.add('vbsfu-visible');
    };
    modalClose.onclick = () => {
        console.log('modalClose.onclick: Modal close button clicked.');
        modalOverlay.classList.remove('vbsfu-visible');
    };
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
            console.log('modalOverlay.onclick: Clicked on overlay background, hiding modal.');
            modalOverlay.classList.remove('vbsfu-visible');
        }
    };
    
    showInfoButton.onclick = () => {
        console.log("showInfoButton.onclick: 'Show Key Info' button clicked, calling injectCustomHeaderInfo.");
        injectCustomHeaderInfo();
    };

    autofillButton.onclick = () => {
        console.log("autofillButton.onclick: 'Autofill From' button clicked, calling autofillFromAddress.");
        autofillFromAddress();
    };

    autofillCommButton.onclick = () => {
        console.log("autofillCommButton.onclick: 'Autofill Community Info' button clicked, calling autofillCommunity.");
        autofillCommunity();
    };

    debugButton.onclick = () => {
        console.log("debugButton.onclick: 'Debug to console' button clicked, calling showDebugInfo.");
        showDebugInfo(); // Assumes showDebugInfo is in content.js and available globally
    };

    generateButton.onclick = async () => {
        console.log("generateButton.onclick: 'Generate Full View' button clicked.");
        generateButton.disabled = true;
        copyButton.disabled = true;
        try {
            statusDiv.textContent = 'Preparing page for scan...';
            statusDiv.style.color = 'var(--vbsfu-status-warn)';
            
            console.log("generateButton.onclick: Scrolling to bottom and top to trigger lazy loads.");
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 500));
            window.scrollTo(0, 0);
            
            console.log("generateButton.onclick: Scrolling related lists into view.");
            await waitForElement('lst-related-list-view-manager:has(span[title="Notes"])').then(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(r => setTimeout(r, 500));
            await waitForElement('.forceRelatedListPreviewAdvancedGrid:has(span[title="Emails"])').then(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(r => setTimeout(r, 500));
            
            console.log("generateButton.onclick: Scrolling to top to reset view.");
            window.scrollTo({ top: 0, behavior: 'auto' });
            
            statusDiv.textContent = 'Initiating generation...';
            console.log("generateButton.onclick: Sending 'initiateGenerateFullCaseView' message to background script.");
            chrome.runtime.sendMessage({ action: "initiateGenerateFullCaseView" }, response => {
                if (chrome.runtime.lastError) {
                    console.error("generateButton.onclick: Error sending message:", chrome.runtime.lastError.message);
                    statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
                    statusDiv.style.color = 'var(--vbsfu-status-error)';
                } else {
                    console.log("generateButton.onclick: Message sent successfully.");
                    statusDiv.textContent = "Processing initiated...";
                }
            });
        } catch (error) {
             console.error('generateButton.onclick: Error preparing page:', error);
             statusDiv.textContent = 'Error preparing page!';
             statusDiv.style.color = 'var(--vbsfu-status-error)';
        } finally {
             console.log("generateButton.onclick: Re-enabling buttons.");
             generateButton.disabled = false;
             copyButton.disabled = false;
        }
    };

    copyButton.onclick = async () => {
        console.log("copyButton.onclick: 'Copy Record Link' button clicked.");
        statusDiv.textContent = 'Copying link...';
        statusDiv.style.color = 'var(--vbsfu-button-text)';
        
        // Assumes findRecordNumber is in content.js and available globally.
        const recordNumber = await findRecordNumber(); 
        console.log(`copyButton.onclick: Found record number: "${recordNumber}"`);
        const currentUrl = window.location.href;
        let objectType = 'Unknown';
        
        if (currentUrl.includes('/Case/')) {
            objectType = 'Case';
        } else if (currentUrl.includes('/WorkOrder/')) {
            objectType = 'WorkOrder';
        }
        console.log(`copyButton.onclick: Determined object type: "${objectType}"`);
        
        if (recordNumber && currentUrl) {
            const linkText = `${objectType} ${recordNumber}`;
            const richTextHtml = `<a href="${currentUrl}">${linkText}</a>`;
            const blobHtml = new Blob([richTextHtml], { type: 'text/html' });
            const blobText = new Blob([linkText], { type: 'text/plain' });

            try {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
                console.log('copyButton.onclick: Successfully wrote to clipboard.');
                statusDiv.textContent = `Copied: ${linkText}`;
                statusDiv.style.color = 'var(--vbsfu-status-success)';
            } catch(err) {
                console.error('copyButton.onclick: Clipboard write failed.', err);
                statusDiv.textContent = 'Error: Copy failed.';
                statusDiv.style.color = 'var(--vbsfu-status-error)';
            }
        } else {
            console.error(`copyButton.onclick: Failed to copy. Record Number: "${recordNumber}", URL: "${currentUrl}"`);
            statusDiv.textContent = 'Error: Record # not found.';
            statusDiv.style.color = 'var(--vbsfu-status-error)';
        }
    };
}

// --- Initial Check and Injection Trigger ---
function init() {
    // We only need to inject the UI panel once. The logic is now entirely user-driven.
    // A slight delay is still good practice to avoid interrupting Salesforce's initial load.
    if (document.body) {
         setTimeout(injectUI, 1500);
    } else {
         document.addEventListener('DOMContentLoaded', () => {
            setTimeout(injectUI, 1500);
         });
    }
}

init();
