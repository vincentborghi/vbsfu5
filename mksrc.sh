#!/bin/bash
# This script fixes the "Identifier 'logger' has already been declared" error.
# It modifies content.js and panel_injector.js to use the global psmhLogger object
# directly, instead of redeclaring a local constant.

echo "🚀 Fixing the logger declaration error..."

# -----------------------------------------------------------------------------
# Overwriting panel_injector.js
# -----------------------------------------------------------------------------
echo "Updating panel_injector.js..."
cat > panel_injector.js << 'EOF'
// panel_injector.js - Injects the UI, makes it draggable, and handles events.
// The logger is now accessed via the global psmhLogger object defined in logger.js

psmhLogger.info("UI Panel Injector Loaded.");

// --- Helper: Wait for an element to appear in the DOM ---
/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=5000] - Timeout in ms (lowered as requested).
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 5000) {
    psmhLogger.debug(`Starting waitForElement for selector: "${selector}"`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const element = baseElement.querySelector(selector);
            if (element) {
                psmhLogger.debug(`Found element for selector: "${selector}"`, element);
                clearInterval(interval);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                psmhLogger.warn(`Timeout waiting for selector: "${selector}"`);
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
    psmhLogger.info('"Show Key Info" button clicked. Attempting to inject info...');
    const statusDiv = document.getElementById('psmh-status');
    statusDiv.textContent = 'Gathering info...';
    
    // Find the currently active Salesforce tab button to reliably get the panel ID.
    const activeTabButtonSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]';
    const activeTabButton = await waitForElement(activeTabButtonSelector);
     if (!activeTabButton) {
        psmhLogger.error("Could not find the active Salesforce tab button. Selector used:", activeTabButtonSelector);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Active tab not found.';
            statusDiv.style.color = 'var(--psmh-status-error)';
        }
        return;
    }
    psmhLogger.debug("Found active tab button.", activeTabButton);

    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        psmhLogger.error("Active tab button has no 'aria-controls' ID.");
        if (statusDiv) {
            statusDiv.textContent = 'Error: Could not identify tab content.';
            statusDiv.style.color = 'var(--psmh-status-error)';
        }
        return;
    }
    psmhLogger.debug("Found panel ID:", panelId);
    
    const activeTabPanel = document.getElementById(panelId);
    if (!activeTabPanel) {
        psmhLogger.error(`Could not find tab panel with ID: ${panelId}`);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Could not find tab content.';
            statusDiv.style.color = 'var(--psmh-status-error)';
        }
        return;
    }
    psmhLogger.debug("Found active tab panel.", activeTabPanel);

    // 1. Find the anchor element to insert our container after.
    const anchorElementSelector = 'div.slds-grid.primaryFieldRow';
    const anchorElement = await waitForElement(anchorElementSelector, activeTabPanel);
    if (!anchorElement) {
        psmhLogger.warn('Anchor element not found. Selector used:', anchorElementSelector);
        if (statusDiv) {
            statusDiv.textContent = 'Error: Page structure not recognized.';
            statusDiv.style.color = 'var(--psmh-status-error)';
        }
        return;
    }
    psmhLogger.debug("Found anchor element.", anchorElement);

    // 2. Find or create our main container for custom info within the active tab.
    let infoContainer = activeTabPanel.querySelector('.psmh-custom-info-container');
    if (infoContainer) {
        psmhLogger.debug("Found existing info container.");
    } else {
        psmhLogger.debug("Creating new info container.");
        infoContainer = document.createElement('div');
        infoContainer.className = 'psmh-custom-info-container';
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
    psmhLogger.debug("Searching for Account with selector:", accountSelector);
    if (accountItemContainer) {
        const accountNameElement = accountItemContainer.querySelector('force-lookup a');
        const accountName = accountNameElement?.textContent?.trim();
        if (accountName) {
            psmhLogger.debug("Found Account Name:", accountName);
            infoParts.push(`Account: ${accountName}`);
        } else {
            psmhLogger.warn("Found Account container but no name inside.");
            infoParts.push(`Account: N/A`);
        }
    } else {
        psmhLogger.warn("Account container not found.");
    }

    // Get CreatedBy
    const createdBySelector = 'records-record-layout-item[field-label="Created By"]';
    const createdByContainer = await waitForElement(createdBySelector, activeTabPanel);
    psmhLogger.debug("Searching for Created By with selector:", createdBySelector);
    if (createdByContainer) {
        const createdByElement = createdByContainer.querySelector('force-lookup a');
        const createdBy = createdByElement?.textContent?.trim();
        if (createdBy) {
            psmhLogger.debug("Found Created By:", createdBy);
            infoParts.push(`Created By: ${createdBy}`);
        }
    } else {
        psmhLogger.warn("Created By container not found.");
    }

    // --- Display the combined info ---
    infoContainer.innerHTML = ''; // Clear previous info
    if (infoParts.length > 0) {
        const infoDisplayDiv = document.createElement('div');
        infoDisplayDiv.className = 'psmh-info-display';
        infoDisplayDiv.style.cssText = `font-size: 1.1em; font-weight: 600; color: #664d03; background-color: #fffbe6; padding: 8px 14px; border-radius: 6px; border-left: 5px solid #ffc107;`;
        infoDisplayDiv.textContent = infoParts.join(' / ');
        infoContainer.appendChild(infoDisplayDiv);
        psmhLogger.info(`Displayed Info: "${infoParts.join(' / ')}"`);
        if (statusDiv) {
            statusDiv.textContent = 'Key info shown.';
            statusDiv.style.color = 'var(--psmh-status-success)';
        }
    } else {
        psmhLogger.warn("No info parts were found to display.");
        if (statusDiv) {
            statusDiv.textContent = 'Could not find info.';
            statusDiv.style.color = 'var(--psmh-status-warn)';
        }
    }
}

/**
 * Creates an HTML element and assigns properties to it.
 * @param {string} tag - The HTML tag for the element (e.g., 'div', 'button').
 * @param {object} properties - An object of properties to assign to the element.
 * @returns {HTMLElement} The created and configured element.
 */
function myCreateElement(tag, properties) {
    psmhLogger.debug(`myCreateElement: Creating <${tag}> with properties:`, properties);
    const element = document.createElement(tag);
    Object.assign(element, properties);
    return element;
}

/**
 * Finds a <select> menu, sets its value, and dispatches a 'change' event.
 * @param {string} selector - The CSS selector for the <select> element.
 * @param {string} value - The value to set for the select element.
 * @param {string} fieldName - A human-readable name for the field for logging.
 * @param {string} [consoleMsgPrefix='setSelectMenuValue'] - An optional prefix for console messages.
 * @returns {Promise<boolean>} - True if the value was set successfully, false otherwise.
 */
async function setSelectMenuValue(selector, value, fieldName, consoleMsgPrefix = 'setSelectMenuValue') {
    psmhLogger.debug(`${consoleMsgPrefix}: Attempting to set ${fieldName} with selector: "${selector}"`);
    const selectElement = await waitForElement(selector, document, 3000);

    if (!selectElement) {
        psmhLogger.error(`${consoleMsgPrefix}: Could not find the ${fieldName} select element using selector: "${selector}"`);
        return false;
    }
    psmhLogger.debug(`${consoleMsgPrefix}: Found ${fieldName} select element.`, selectElement);

    // Set the value directly to the correct option value
    selectElement.value = value;
    psmhLogger.debug(`${consoleMsgPrefix}: Set ${fieldName} value to "${value}"`);

    // Dispatch a 'change' event. This is crucial for the LWC to recognize the update.
    const event = new Event('change', { bubbles: true });
    selectElement.dispatchEvent(event);
    psmhLogger.debug(`${consoleMsgPrefix}: Dispatched 'change' event for ${fieldName}.`);

    // Brief pause to allow the UI to react and verification
    await new Promise(resolve => setTimeout(resolve, 100));
    if (selectElement.value === value) {
        psmhLogger.debug(`${consoleMsgPrefix}: Verification successful for ${fieldName}.`);
        return true;
    } else {
        psmhLogger.warn(`${consoleMsgPrefix}: Verification FAILED for ${fieldName}. Current value is "${selectElement.value}"`);
        return false;
    }
}

async function autofillCommunity() {
    psmhLogger.info('autofillCommunity: called');
    const statusDiv = document.getElementById('psmh-status');
    statusDiv.textContent = 'Autofilling Community Info...';
    statusDiv.style.color = 'var(--psmh-status-warn)';

    const consolePrefix = 'autofillCommunity';
    psmhLogger.debug(`${consolePrefix}: Looking for LWC dropdowns for Language, Timezone, Locale, Currency, and Email Encoding.`);

    // Define fields in a structured array for easier management
    const fieldsToAutofill = [
        { name: 'Language',       selector: 'select[name="choLanguage"]',       value: 'chopickLanguage.fr' },           // French
        { name: 'Timezone',       selector: 'select[name="pickTimezone"]',      value: 'chopickTimezone.Europe/Paris' }, // Europe/Paris
        { name: 'Locale',         selector: 'select[name="choLocale"]',         value: 'chopickLocale.fr_FR' },          // French (France)
        { name: 'Currency',       selector: 'select[name="choCurrency"]',       value: 'chopickCurrency.EUR' },          // EUR - Euro
        { name: 'Email Encoding', selector: 'select[name="pickEmailEncoding"]', value: 'chopickEmailEncoding.UTF-8' }    // Unicode (UTF-8)
    ];

    let allSuccessful = true;
    // Loop through and set each field's value
    for (const field of fieldsToAutofill) {
        const success = await setSelectMenuValue(field.selector, field.value, field.name, consolePrefix);
        if (!success) {
            allSuccessful = false; // If any field fails, mark the whole operation as failed
        }
    }

    // Update the status panel based on the outcome
    if (allSuccessful) {
        statusDiv.textContent = `Autofilled ${fieldsToAutofill.length} fields successfully!`;
        statusDiv.style.color = 'var(--psmh-status-success)';
    } else {
        statusDiv.textContent = 'Error: Failed to autofill one or more fields.';
        statusDiv.style.color = 'var(--psmh-status-error)';
    }
}

/**
 * Finds the "From" address dropdown in a Salesforce "New Email" form and selects a specific address.
 * This version is updated to work with Salesforce Aura components.
 */
async function autofillFromAddress() {
    psmhLogger.info('"Autofill From Address" button clicked.');
    const statusDiv = document.getElementById('psmh-status');
    statusDiv.textContent = 'Searching for "From" dropdown...';
    statusDiv.style.color = 'var(--psmh-status-warn)';

    // Step 1: Find the "From" label span.
    psmhLogger.debug('Searching for label span with text "From".');
    const allLabels = document.querySelectorAll('span.form-element__label');
    let fromLabel = null;
    for (const label of allLabels) {
        // The text can be in the span directly or in a child span.
        if (label.textContent.trim() === 'From') {
            fromLabel = label;
            psmhLogger.debug('Found "From" label element:', fromLabel);
            break;
        }
    }

    if (!fromLabel) {
        psmhLogger.error('Could not find a label for "From". The "New Email" form might not be open.');
        statusDiv.textContent = 'Error: "From" field label not found.';
        statusDiv.style.color = 'var(--psmh-status-error)';
        return;
    }

    // Step 2: Find the associated trigger link (<a>) from the label's parent container.
    const container = fromLabel.closest('.uiInput.uiInputSelect');
    if (!container) {
        psmhLogger.error('Could not find the parent container (.uiInput.uiInputSelect) for the label.');
        statusDiv.textContent = 'Error: "From" field container not found.';
        statusDiv.style.color = 'var(--psmh-status-error)';
        return;
    }
    psmhLogger.debug('Found parent container:', container);
    
    const dropdownTrigger = container.querySelector('a[role="combobox"]');
    if (!dropdownTrigger) {
         psmhLogger.error('Could not find the dropdown trigger link inside the container.');
         statusDiv.textContent = 'Error: Cannot click "From" dropdown.';
         statusDiv.style.color = 'var(--psmh-status-error)';
         return;
    }

    psmhLogger.debug('Clicking the dropdown trigger.', dropdownTrigger);
    dropdownTrigger.click();

    // Step 3: Wait for the desired option to appear and click it. In Aura, this is typically a `li.uiMenuItem a`.
    const desiredEmail = 'PSM-Support-Email <psm-support-email@atos.net>';
    const optionSelector = `li.uiMenuItem a[title="${desiredEmail}"]`;
    
    psmhLogger.debug(`Waiting for option with selector: "${optionSelector}"`);
    const emailOptionElement = await waitForElement(optionSelector, document, 3000);

    if (!emailOptionElement) {
        psmhLogger.error(`The email option "${desiredEmail}" was not found in the dropdown.`);
        statusDiv.textContent = `Error: Option "${desiredEmail}" not found.`;
        statusDiv.style.color = 'var(--psmh-status-error)';
        // If the dropdown is still open, click the trigger again to close it.
        if (dropdownTrigger.getAttribute('aria-expanded') === 'true') {
            psmhLogger.debug('Closing dropdown because option was not found.');
            dropdownTrigger.click();
        }
        return;
    }

    psmhLogger.debug('Found email option element. Clicking it.', emailOptionElement);
    emailOptionElement.click();

    // A brief pause to allow the UI to update, then confirm the change.
    await new Promise(resolve => setTimeout(resolve, 300));
    const selectedText = dropdownTrigger.textContent?.trim();
    
    if (selectedText.includes('psm-support-email@atos.net')) { // Check for a unique part of the email
        statusDiv.textContent = `Autofilled "${desiredEmail}"!`;
        statusDiv.style.color = 'var(--psmh-status-success)';
        psmhLogger.info('Successfully autofilled. New value confirmed:', selectedText);
    } else {
        psmhLogger.warn('Clicked the option, but the new value was not immediately reflected. Current value:', selectedText);
        statusDiv.textContent = 'Autofill may have failed.';
        statusDiv.style.color = 'var(--psmh-status-warn)';
    }
}


// --- Draggable Panel Logic ---
function makePanelDraggable(panel, header) {
    psmhLogger.debug('makePanelDraggable: Initializing for panel:', panel);
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let toggleButton = document.getElementById('psmh-toggle');

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        psmhLogger.debug('dragMouseDown: Mouse down on header.');
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        psmhLogger.debug('Attaching mousemove and mouseup listeners.');
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
        psmhLogger.debug(`Dragging panel to top: ${newTop}px, left: ${newLeft}px`);
        panel.style.top = newTop + "px";
        panel.style.left = newLeft + "px";
        if (toggleButton) {
           psmhLogger.debug(`Dragging toggle button to top: ${newTop}px`);
           toggleButton.style.top = newTop + "px";
        }
    }

    function closeDragElement() {
        psmhLogger.debug('closeDragElement: Mouse up. Removing listeners.');
        document.onmouseup = null;
        document.onmousemove = null;
        header.style.cursor = 'grab';
    }
}


// --- Main UI Injection ---
function injectUI() {
    if (document.getElementById('psmh-panel')) {
        psmhLogger.warn('Panel already exists. Aborting injection.');
        return; 
    }
    psmhLogger.info('Injecting main UI panel...');

    // Use the helper function to create elements concisely
    const panel = myCreateElement('div', { id: 'psmh-panel' });
    const header = myCreateElement('div', { id: 'psmh-header' });
    const title = myCreateElement('h4', { textContent: 'PSM Helper' });
    header.appendChild(title);

    const content = myCreateElement('div', { id: 'psmh-content' });

    const caseOpenerContainer = myCreateElement('div', { id: 'psmh-case-opener-container' });
    const caseInput = myCreateElement('input', { id: 'psmh-case-input', type: 'text', placeholder: 'Case Number...' });
    const openCaseButton = myCreateElement('button', { id: 'psmh-open-case', textContent: 'Go', className: 'psmh-button' });
    caseOpenerContainer.append(caseInput, openCaseButton);

    const showInfoButton = myCreateElement('button', { id: 'psmh-show-info', textContent: 'Show Key Info', className: 'psmh-button' });
    const autofillButton = myCreateElement('button', { id: 'psmh-autofill-from', textContent: 'Autofill From Address', className: 'psmh-button' });
    const autofillCommButton = myCreateElement('button', { id: 'psmh-autofill-comm', textContent: 'Autofill Community Info', className: 'psmh-button' });
    const generateButton = myCreateElement('button', { id: 'psmh-generate', textContent: 'Generate Full View', className: 'psmh-button' });
    const copyButton = myCreateElement('button', { id: 'psmh-copy', textContent: 'Copy Record Link', className: 'psmh-button' });
    const aboutButton = myCreateElement('button', { id: 'psmh-about', textContent: 'About', className: 'psmh-button' });
    const debugButton = myCreateElement('button', { id: 'psmh-debug', textContent: 'Debug to console', className: 'psmh-button' });

    const statusDiv = myCreateElement('div', { id: 'psmh-status', textContent: 'Ready.' });
    
    // Create Log Level Dropdown
    const logLevelContainer = myCreateElement('div', {});
    logLevelContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 12px;';
    const logLevelLabel = myCreateElement('label', { htmlFor: 'psmh-log-level-select', textContent: 'Log Level:' });
    const logLevelSelect = myCreateElement('select', { id: 'psmh-log-level-select' });
    logLevelSelect.style.cssText = 'padding: 2px; border-radius: 3px; border: 1px solid #ccc;';
    ['ERROR', 'WARN', 'INFO', 'DEBUG'].forEach(level => {
        const option = myCreateElement('option', { value: level, textContent: level });
        logLevelSelect.appendChild(option);
    });
    logLevelContainer.append(logLevelLabel, logLevelSelect);
    
    // New button order
    content.appendChild(caseOpenerContainer);
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
    panel.appendChild(logLevelContainer); // Add log level selector at the bottom

    const toggleButton = myCreateElement('button', { id: 'psmh-toggle', innerHTML: '&#x1F6E0;&#xFE0F;', 'aria-label': 'Toggle Panel' });

    const modalOverlay = myCreateElement('div', { id: 'psmh-modal-overlay' });
    const modalContent = myCreateElement('div', { id: 'psmh-modal-content' });
    const modalClose = myCreateElement('button', { id: 'psmh-modal-close', innerHTML: '&times;' });
    const modalTitle = myCreateElement('h5', { textContent: 'PSM Helper' });
    const modalBody = myCreateElement('div', { id: 'psmh-modal-body' });
    
    const extensionVersion = chrome.runtime.getManifest().version;
    modalBody.innerHTML = `<p><strong>Version:</strong> ${extensionVersion}</p>
      <p>This Chrome extension is experimental and is not an official tool from Atos IT (the developers of PSM).</p>
      <p>For information or feedback, contact <b>Vincent Borghi</b>.</p>`;
    modalContent.appendChild(modalClose);
    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalBody);
    modalOverlay.appendChild(modalContent);

    document.body.appendChild(panel);
    document.body.appendChild(toggleButton);
    document.body.appendChild(modalOverlay);
    psmhLogger.info('All UI elements appended to the body.');

    makePanelDraggable(panel, header);

    // --- Event Listeners ---
    psmhLogger.debug('Attaching event listeners.');
    toggleButton.onclick = () => {
        psmhLogger.debug('Toggle button clicked.');
        panel.classList.toggle('psmh-visible');
        if (panel.classList.contains('psmh-visible')) {
            psmhLogger.debug('Panel is now visible.');
            statusDiv.textContent = 'Ready.';
            statusDiv.style.color = 'var(--psmh-button-text)';
        } else {
            psmhLogger.debug('Panel is now hidden.');
        }
    };
    aboutButton.onclick = () => {
        psmhLogger.debug('About button clicked, showing modal.');
        modalOverlay.classList.add('psmh-visible');
    };
    modalClose.onclick = () => {
        psmhLogger.debug('Modal close button clicked.');
        modalOverlay.classList.remove('psmh-visible');
    };
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) {
            psmhLogger.debug('Clicked on overlay background, hiding modal.');
            modalOverlay.classList.remove('psmh-visible');
        }
    };
    
    logLevelSelect.onchange = (e) => {
        const newLevel = e.target.value;
        psmhLogger.info(`UI: User changed log level to ${newLevel}. Saving to storage.`);
        chrome.storage.sync.set({ logLevel: newLevel });
    };

    // Populate log level dropdown from storage
    chrome.storage.sync.get('logLevel', (data) => {
        const savedLevel = data.logLevel || 'INFO';
        logLevelSelect.value = savedLevel;
        psmhLogger.debug(`UI: Set log level dropdown to saved value: ${savedLevel}`);
    });
    
    showInfoButton.onclick = () => {
        psmhLogger.debug("'Show Key Info' button clicked, calling injectCustomHeaderInfo.");
        injectCustomHeaderInfo();
    };

    autofillButton.onclick = () => {
        psmhLogger.debug("'Autofill From' button clicked, calling autofillFromAddress.");
        autofillFromAddress();
    };

    autofillCommButton.onclick = () => {
        psmhLogger.debug("'Autofill Community Info' button clicked, calling autofillCommunity.");
        autofillCommunity();
    };

    debugButton.onclick = () => {
        psmhLogger.debug("'Debug to console' button clicked, calling showDebugInfo.");
        showDebugInfo(); // Assumes showDebugInfo is in content.js and available globally
    };

    generateButton.onclick = async () => {
        psmhLogger.info("'Generate Full View' button clicked.");
        generateButton.disabled = true;
        copyButton.disabled = true;
        try {
            statusDiv.textContent = 'Preparing page for scan...';
            statusDiv.style.color = 'var(--psmh-status-warn)';
            
            psmhLogger.debug("Scrolling to bottom and top to trigger lazy loads.");
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 500));
            window.scrollTo(0, 0);
            
            psmhLogger.debug("Scrolling related lists into view.");
            await waitForElement('lst-related-list-view-manager:has(span[title="Notes"])').then(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(r => setTimeout(r, 500));
            await waitForElement('.forceRelatedListPreviewAdvancedGrid:has(span[title="Emails"])').then(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(r => setTimeout(r, 500));
            
            psmhLogger.debug("Scrolling to top to reset view.");
            window.scrollTo({ top: 0, behavior: 'auto' });
            
            statusDiv.textContent = 'Initiating generation...';
            psmhLogger.info("Sending 'initiateGenerateFullCaseView' message to background script.");
            chrome.runtime.sendMessage({ action: "initiateGenerateFullCaseView" }, response => {
                if (chrome.runtime.lastError) {
                    psmhLogger.error("Error sending message:", chrome.runtime.lastError.message);
                    statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
                    statusDiv.style.color = 'var(--psmh-status-error)';
                } else {
                    psmhLogger.debug("Message sent successfully.");
                    statusDiv.textContent = "Processing initiated...";
                }
            });
        } catch (error) {
             psmhLogger.error('Error preparing page:', error);
             statusDiv.textContent = 'Error preparing page!';
             statusDiv.style.color = 'var(--psmh-status-error)';
        } finally {
             psmhLogger.debug("Re-enabling buttons.");
             generateButton.disabled = false;
             copyButton.disabled = false;
        }
    };

    openCaseButton.onclick = () => {
        const caseNumber = caseInput.value.trim();
        psmhLogger.info(`'Go' button clicked for case number: "${caseNumber}"`);
        if (!caseNumber || !/^\d+$/.test(caseNumber)) {
            psmhLogger.error("Invalid case number provided.");
            statusDiv.textContent = 'Error: Enter a valid case number.';
            statusDiv.style.color = 'var(--psmh-status-error)';
            caseInput.focus();
            return;
        }

        statusDiv.textContent = `Finding Case ${caseNumber}...`;
        statusDiv.style.color = 'var(--psmh-status-warn)';
        openCaseButton.disabled = true;
        chrome.runtime.sendMessage({ action: "findAndOpenCase", caseNumber: caseNumber }, (response) => {
            psmhLogger.debug("Message 'findAndOpenCase' sent to background script.");
            setTimeout(() => { openCaseButton.disabled = false; }, 2000);
        });
    };

    copyButton.onclick = async () => {
        psmhLogger.info("'Copy Record Link' button clicked.");
        statusDiv.textContent = 'Copying link...';
        statusDiv.style.color = 'var(--psmh-button-text)';
        
        // Assumes findRecordNumber is in content.js and available globally.
        const recordNumber = await findRecordNumber(); 
        psmhLogger.debug(`Found record number: "${recordNumber}"`);
        const currentUrl = window.location.href;
        let objectType = 'Unknown';
        
        if (currentUrl.includes('/Case/')) {
            objectType = 'Case';
        } else if (currentUrl.includes('/WorkOrder/')) {
            objectType = 'WorkOrder';
        }
        psmhLogger.debug(`Determined object type: "${objectType}"`);
        
        if (recordNumber && currentUrl) {
            const linkText = `${objectType} ${recordNumber}`;
            const richTextHtml = `<a href="${currentUrl}">${linkText}</a>`;
            const blobHtml = new Blob([richTextHtml], { type: 'text/html' });
            const blobText = new Blob([linkText], { type: 'text/plain' });

            try {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
                psmhLogger.info('Successfully wrote to clipboard.');
                statusDiv.textContent = `Copied: ${linkText}`;
                statusDiv.style.color = 'var(--psmh-status-success)';
            } catch(err) {
                psmhLogger.error('Clipboard write failed.', err);
                statusDiv.textContent = 'Error: Copy failed.';
                statusDiv.style.color = 'var(--psmh-status-error)';
            }
        } else {
            psmhLogger.error(`Failed to copy. Record Number: "${recordNumber}", URL: "${currentUrl}"`);
            statusDiv.textContent = 'Error: Record # not found.';
            statusDiv.style.color = 'var(--psmh-status-error)';
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
// End of file
EOF

# -----------------------------------------------------------------------------
# Overwriting content.js
# -----------------------------------------------------------------------------
echo "Updating content.js..."
cat > content.js << 'EOF'
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


function waitForElementToDisappear(selector, baseElement = document, timeout = 4000) {
    psmhLogger.debug(`Waiting for "${selector}" to disappear.`);
    return new Promise((resolve) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (!baseElement.querySelector(selector)) {
                psmhLogger.debug(`Element "${selector}" has disappeared successfully.`);
                clearInterval(interval);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                psmhLogger.warn(`TIMEOUT waiting for "${selector}" to disappear.`);
                clearInterval(interval);
                resolve(false);
            }
        }, 300);
    });
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
        const dateObject = new Date(Date.UTC(year, month, day, hour, minute));
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

// --- SEQUENTIAL RELATED LIST PROCESSORS ---

async function processNotesList(baseElement) {
    psmhLogger.info("Processing Related List: Notes");
    const containerSelector = 'lst-related-list-view-manager:has(span[title="Notes"])';
    const closeButtonSelector = 'button.slds-button_icon[title^="Close Notes"]';
    
    const listContainer = await waitForElement(containerSelector, baseElement);
    if (!listContainer) { 
        psmhLogger.warn("Notes related list container not found.");
        return []; 
    }

    let didClickViewAll = false;
    const viewAllLink = listContainer.querySelector('a.slds-card__footer');
    
    if (viewAllLink && viewAllLink.offsetParent !== null) {
        psmhLogger.debug("Notes: 'View All' link is visible. Clicking...");
        viewAllLink.click();
        didClickViewAll = true;
        await new Promise(resolve => setTimeout(resolve, 1500)); 
    }
    
    if (!didClickViewAll) { 
        psmhLogger.warn("Notes: 'View All' link not clicked, no data to process.");
        return []; 
    }

    const activeViewContainer = document.querySelector('.oneAlohaPage');
    const dataTable = await waitForElement('lightning-datatable', activeViewContainer || document, 5000);
    if (!dataTable) {
        psmhLogger.warn("Notes data table not found.");
        const closeButton = await waitForElement(closeButtonSelector, document, 5000);
        if (closeButton) { closeButton.click(); await waitForElementToDisappear(`button[title="${closeButton.title}"]`); }
        return [];
    }
    psmhLogger.debug("Found notes data table.");

    const rows = Array.from(dataTable.querySelectorAll('tr[data-row-key-value]'));
    const processedData = rows.map(row => {
        const urlElement = row.querySelector('th[data-label="PSM Note Name"] a');
        const dateElement = row.querySelector('td[data-label="Created Date"] lst-formatted-text span');
        if (!urlElement || !dateElement) return null;
        return { type: 'Note', url: new URL(urlElement.getAttribute('href'), window.location.origin).href, dateStr: (dateElement.title || dateElement.textContent?.trim()) };
    }).filter(Boolean);
    psmhLogger.info(`Processed ${processedData.length} notes from the list.`);

    const closeButton = await waitForElement(closeButtonSelector, document, 5000);
    if (closeButton) {
        psmhLogger.debug(`Close button for Notes found. Clicking it.`);
        closeButton.click();
        await waitForElementToDisappear(`button[title="Close Notes"]`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return processedData;
}

async function processEmailsList(baseElement) {
    psmhLogger.info("Processing Related List: Emails");
    const containerSelector = '.forceRelatedListPreviewAdvancedGrid:has(span[title="Emails"])';
    const closeButtonSelector = 'button.slds-button_icon[title^="Close Emails"]';
    
    const listContainer = await waitForElement(containerSelector, baseElement);
    if (!listContainer) { 
        psmhLogger.warn("Emails related list container not found.");
        return [];
    }

    let didClickViewAll = false;
    const viewAllLink = listContainer.querySelector('.slds-card__footer');
    
    if (viewAllLink && viewAllLink.offsetParent !== null) {
        psmhLogger.debug("Emails: 'View All' link is visible. Clicking...");
        viewAllLink.click();
        didClickViewAll = true;
        await new Promise(resolve => setTimeout(resolve, 1500)); 
    }
    
    if (!didClickViewAll) { 
        psmhLogger.warn("Emails: 'View All' link not clicked, no data to process.");
        return []; 
    }

    const activeViewContainer = document.querySelector('.oneAlohaPage');
    const dataTable = await waitForElement('table.uiVirtualDataTable', activeViewContainer || document, 5000);
    if (!dataTable) {
        psmhLogger.warn("Emails data table not found.");
        if(didClickViewAll) {
             const closeButton = await waitForElement(closeButtonSelector, document, 5000);
             if (closeButton) closeButton.click();
        }
        return [];
    }

    const rows = Array.from(dataTable.querySelectorAll('tbody tr'));
    const processedData = rows.map(row => {
        const urlElement = row.querySelector('th a.outputLookupLink');
        const dateElement = row.querySelector('td span.uiOutputDateTime');
        if (!urlElement || !dateElement) return null;
        return { type: 'Email', url: new URL(urlElement.getAttribute('href'), window.location.origin).href, dateStr: dateElement.textContent?.trim() };
    }).filter(Boolean);
    psmhLogger.info(`Processed ${processedData.length} emails from the list.`);
    
    const closeButton = await waitForElement(closeButtonSelector, document, 5000);
    if (closeButton) {
        psmhLogger.debug(`Close button for Emails found. Clicking it.`);
        closeButton.click();
        await waitForElementToDisappear(`button[title="Close Emails"]`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return processedData;
}

async function processWorkOrdersList(baseElement) {
    psmhLogger.info("Processing Related List: Work Orders");
    const containerSelector = 'lst-related-list-view-manager:has(span[title="Work Orders"])';
    const listContainer = await waitForElement(containerSelector, baseElement);
    if (!listContainer) {
        psmhLogger.warn("Work Orders: Related list container NOT found. Assuming 0 Work Orders.");
        return { count: 0, html: '' };
    }

    const viewAllLink = listContainer.querySelector('a.slds-card__footer');
    if (!viewAllLink || viewAllLink.offsetParent === null) {
        psmhLogger.warn("Work Orders: 'View All' link not found or not visible. Assuming 0 Work Orders.");
        return { count: 0, html: '' };
    }

    psmhLogger.debug("Work Orders: 'View All' link is visible. Clicking...");
    viewAllLink.click();
    
    await new Promise(resolve => setTimeout(resolve, 2500)); 

    let searchContext = document;
    const wocontainer = await waitForElement('lst-related-list-view-manager:has(span[title="Work Orders"])', document, 5000);
    if (wocontainer) {
        psmhLogger.debug("Work Orders: Found modal container.");
        searchContext = wocontainer;
    } else {
        psmhLogger.warn("Work Orders: Modal container NOT found.");
    }

    let tableElement = null;
    const selectorsToTry = [
        'lightning-datatable',
        'table[lightning-datatable_table]',
        'table.uiVirtualDataTable',
        'table.forceRecordLayout'
    ];

    for (const selector of selectorsToTry) {
        psmhLogger.debug(`Work Orders: Attempting to find table with selector: "${selector}"`);
        let foundElement = await waitForElement(selector, searchContext, 2500);
        if (foundElement) {
            if (foundElement.tagName.toLowerCase() === 'lightning-datatable') {
                tableElement = foundElement.querySelector('table');
                if (tableElement) {
                    psmhLogger.debug(`Work Orders: Success! Found <table> inside <lightning-datatable>.`);
                    break;
                }
            } else {
                tableElement = foundElement;
                psmhLogger.debug(`Work Orders: Success! Found table element directly with selector "${selector}".`);
                break;
            }
        }
    }
    
    const closeButtonSelector = 'button.slds-button_icon[title^="Close Work Orders"]';

    if (!tableElement) {
        psmhLogger.error("Work Orders data table not found after trying all selectors.");
        const closeButton = await waitForElement(closeButtonSelector, document, 3000);
        if (closeButton) {
            closeButton.click();
            await waitForElementToDisappear(`button[title^="Close Work Orders"]`);
        }
        return { count: 0, html: '' };
    }
    
    psmhLogger.debug("Work Orders: Successfully found data table element. Proceeding to scrape HTML.");
    
    const rows = Array.from(tableElement.querySelectorAll('tbody tr'));
    const excludedHeaders = ['Row Number', 'Action'];
    const headerElements = Array.from(tableElement.querySelectorAll('thead th'));
    const validHeaders = [];
    const columnIndicesToKeep = [];

    headerElements.forEach((th, index) => {
        const headerText = (th.getAttribute('aria-label') || th.textContent.trim());
        if (headerText && !excludedHeaders.includes(headerText)) {
            validHeaders.push(headerText);
            columnIndicesToKeep.push(index);
        }
    });
    
    let tableHtml = '<table class="slds-table slds-table_bordered">';
    tableHtml += '<thead><tr>';
    validHeaders.forEach(header => tableHtml += `<th>${escapeHtml(header)}</th>`);
    tableHtml += '</tr></thead>';
    
    tableHtml += '<tbody>';
    rows.forEach(row => {
        const allCells = row.querySelectorAll('th, td');
        if (allCells.length > 0) {
            tableHtml += '<tr>';
            columnIndicesToKeep.forEach(index => {
                const cell = allCells[index];
                if (cell) {
                    let cellContent = '';
                    const link = cell.querySelector('a');
                    if (link && link.getAttribute('href')) {
                        const relativeUrl = link.getAttribute('href');
                        const absoluteUrl = new URL(relativeUrl, window.location.origin).href;
                        const linkText = link.textContent.trim();
                        cellContent = `<a href="${absoluteUrl}" target="_blank">${escapeHtml(linkText)}</a>`;
                    } else {
                        cellContent = escapeHtml(cell.textContent.trim());
                    }
                    tableHtml += `<td>${cellContent}</td>`;
                } else {
                    tableHtml += '<td></td>'; // Maintain column alignment
                }
            });
            tableHtml += '</tr>';
        }
    });
    tableHtml += '</tbody></table>';
    
    const closeButton = await waitForElement(closeButtonSelector, document, 5000);
    if (closeButton) {
        psmhLogger.debug(`Close button for Work Orders found. Clicking.`);
        closeButton.click();
        await waitForElementToDisappear(`button[title^="Close Work Orders"]`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { html: tableHtml, count: rows.length };
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

// --- Main Function to Orchestrate Extraction and Generate HTML (CONTEXT-AWARE) ---
async function generateCaseViewHtml(generatedTime) {
    const statusDiv = document.getElementById('psmh-status');

    const activeTabButton = await waitForElement('li.slds-is-active[role="presentation"] a[role="tab"]');
    if (!activeTabButton) {
        psmhLogger.error("FATAL: Could not find the active Salesforce tab button.");
        return `<html><body><h1>Extraction Error</h1><p>Could not find the active Salesforce tab.</p></body></html>`;
    }
    
    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        psmhLogger.error("FATAL: Active tab button has no 'aria-controls' ID.");
        return `<html><body><h1>Extraction Error</h1><p>Could not identify the content panel for the active tab.</p></body></html>`;
    }

    const activeTabPanel = document.getElementById(panelId);
    if (!activeTabPanel) {
        psmhLogger.error(`FATAL: Could not find tab panel with ID: ${panelId || 'undefined'}`);
        return `<html><body><h1>Extraction Error</h1><p>Could not find the content for the active tab (ID: ${panelId}).</p></body></html>`;
    }
    
    psmhLogger.info("Starting async HTML generation for the active tab...");
    let objectType = window.location.href.includes('/Case/') ? 'Case' : 'WorkOrder';

    statusDiv.textContent = 'Extracting Details...';
    const highlightsContainerElement = await waitForElement('records-highlights2', activeTabPanel);
    if (!highlightsContainerElement) {
      psmhLogger.error(`FATAL: Highlights container not found in the active tab.`);
      return `<html><body><h1>Extraction Error</h1><p>Could not find the main details section.</p></body></html>`;
    }

    const subject = findSubjectInContainer(highlightsContainerElement);
    const recordNumber = await findRecordNumber(activeTabPanel);
    const status = findStatusInContainer(highlightsContainerElement);
    const owner = findOwnerInContainer(highlightsContainerElement);
    const creatorName = await findCreatorName(activeTabPanel);
    const accountName = await findAccountName(activeTabPanel);
    const createdDateStr = await findCreatedDate(activeTabPanel);
    const description = await findCaseDescription(activeTabPanel);
    
     // --- SEQUENTIALLY PROCESS AND FETCH RELATED LISTS ---

    // 1. Process and Fetch Notes
    statusDiv.textContent = 'Finding Notes...';
    await scrollToElementAndWait('lst-related-list-view-manager:has(span[title="Notes"])', activeTabPanel);
    const notesToFetch = await processNotesList(activeTabPanel);
    let processedNotes = [];
    if (notesToFetch.length > 0) {
        statusDiv.textContent = `Fetching ${notesToFetch.length} Note(s)...`;
        try {
            const noteDetailsResponse = await sendMessagePromise({ action: "fetchItemDetails", items: notesToFetch });
            if (noteDetailsResponse?.status === 'success' && noteDetailsResponse.details) {
                processedNotes = Object.values(noteDetailsResponse.details).map(detail => ({
                    ...detail,
                    dateObject: new Date(detail.dateObject) 
                }));
            }
        } catch (error) {
            psmhLogger.error("Error fetching note details:", error);
            statusDiv.textContent = 'Error fetching notes.';
        }
    }

    // 2. Process and Fetch Emails
    statusDiv.textContent = 'Finding Emails...';
    await scrollToElementAndWait('.forceRelatedListPreviewAdvancedGrid:has(span[title="Emails"])', activeTabPanel);
    const emailsToFetch = await processEmailsList(activeTabPanel);
    let processedEmails = [];
    if (emailsToFetch.length > 0) {
        statusDiv.textContent = `Fetching ${emailsToFetch.length} Email(s)...`;
        try {
            const emailDetailsResponse = await sendMessagePromise({ action: "fetchItemDetails", items: emailsToFetch });
            if (emailDetailsResponse?.status === 'success' && emailDetailsResponse.details) {
                processedEmails = Object.values(emailDetailsResponse.details).map(detail => ({
                    ...detail,
                    dateObject: new Date(detail.dateObject)
                }));
            }
        } catch (error) {
            psmhLogger.error("Error fetching email details:", error);
            statusDiv.textContent = 'Error fetching emails.';
        }
    }
    
    // --- Combine and Sort Data ---
    statusDiv.textContent = 'Combining data...';
    const allTimelineItems = [...processedNotes, ...processedEmails];

    const validTimelineItems = allTimelineItems.filter(item => item.dateObject && !isNaN(item.dateObject.getTime()));
    validTimelineItems.sort((a, b) => a.dateObject - b.dateObject);

    // --- Process Work Orders ---
    statusDiv.textContent = 'Finding Work Orders...';
    await scrollToElementAndWait('lst-related-list-view-manager:has(span[title="Work Orders"])', activeTabPanel);
    const workOrdersData = await processWorkOrdersList(activeTabPanel);

    // --- Build HTML ---
    statusDiv.textContent = 'Generating HTML...';
    const safeRecordNumber = escapeHtml(recordNumber || 'N/A');
    const safeSubject = escapeHtml(subject || 'N/A');
    const safeObjectType = escapeHtml(objectType);
    const safeAccountName = escapeHtml(accountName || 'N/A');

    const woCount = workOrdersData.count;
    const woScrollClass = woCount > 6 ? 'wo-table-scrollable' : '';
    const workOrdersSummaryHtml = `
        <div class="wo-summary-container">
            <h3>${woCount} Work Order(s)</h3>
            ${woCount > 0 ? `<div class="${woScrollClass}">${workOrdersData.html}</div>` : '<p><i>No related work orders found.</i></p>'}
        </div>
    `;
    
    let debugInfoSection = `
        <div class="debug-info-section">
            <h2>Debug Info</h2>
            <details>
                <summary>Fetched Notes Data (${processedNotes.length} items)</summary>
                <pre>${escapeHtml(JSON.stringify(processedNotes, null, 2))}</pre>
            </details>
            <details>
                <summary>Fetched Emails Data (${processedEmails.length} items)</summary>
                <pre>${escapeHtml(JSON.stringify(processedEmails, null, 2))}</pre>
            </details>
            <details>
                <summary>Work Orders Table Data (${workOrdersData.count} items)</summary>
                <pre>${escapeHtml(JSON.stringify(workOrdersData, null, 2))}</pre>
            </details>
        </div>
    `;
    
    let htmlOutput = `
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
            .generation-info { font-size: 0.85em; color: #555; text-align: right; }
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
            .item-header { font-size: 0.95em; color: #444; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 6px; line-height: 1.4; background-color: #fffbe6; cursor: pointer; }
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
            .item-content p, .item-content ul, .item-content ol { margin-top: 0; margin-bottom: 0.5em; }
            .item-content a { color: #007bff; text-decoration: underline; }
            .item-content blockquote { border-left: 3px solid #ccc; padding-left: 10px; margin-left: 5px; color: #666; font-style: italic; }
            .item-content pre, .item-content code { font-family: monospace; background-color: #eee; padding: 1px 3px; border-radius: 2px; white-space: pre-wrap; }
            .item-attachments { font-style: italic; color: #888; font-size: 0.85em; margin-top: 10px; }
            .error-message { color: red; font-weight: bold; background-color: #ffebeb; border: 1px solid red; padding: 5px 8px; border-radius: 3px; display: inline-block; margin-top: 5px; }
            .item-visibility { margin-left: 8px; font-size: 0.9em; font-weight: bold; text-transform: lowercase; padding: 1px 5px; border-radius: 3px; border: 1px solid transparent; }
            .item-visibility.public { color: #8e1b03; background-color: #fdd; border-color: #fbb; }
            .item-visibility.internal { color: #333; background-color: #eee; border-color: #ddd; }
            .debug-info-section { margin-top: 25px; }
            .slds-table { width: 100%; border-collapse: collapse; background: #fff; }
            .slds-table th, .slds-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #dddbda; }
            .slds-table th { background-color: #f3f2f2; font-weight: 600; }
            .debug-info-section details { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; background: #fafafa; border-radius: 4px;}
            .debug-info-section summary { font-weight: bold; cursor: pointer; }
            .debug-info-section pre { background-color: #eee; padding: 10px; border-radius: 3px; white-space: pre-wrap; word-wrap: break-word; }
            @media (max-width: 900px) { .details-and-wo-wrapper { grid-template-columns: 1fr; gap: 25px; } }
        </style>
    </head>
    <body>
        <h1>${safeObjectType} ${safeRecordNumber}: ${safeSubject}</h1>
        
        <div class="meta-info-bar">
            <div class="customer-account-info"><strong>Customer Account:</strong> ${safeAccountName}</div>
            <div class="generation-info">Generated: ${escapeHtml(generatedTime)}</div>
        </div>
    
        <div class="record-details">
            <div class="details-and-wo-wrapper">
                 <dl class="details-grid">
                    <dt>Date Created:</dt><dd>${escapeHtml(createdDateStr || 'N/A')}</dd>
                    <dt>Created By:</dt><dd>${escapeHtml(creatorName || 'N/A')}</dd>
                    <dt>Status:</dt><dd>${escapeHtml(status || 'N/A')}</dd>
                    <dt>Owner:</dt><dd>${escapeHtml(owner || 'N/A')}</dd>
                 </dl>
                 ${workOrdersSummaryHtml}
            </div>
            <div class="description-label">Description:</div>
            <div class="description-content">${description || '<p><i>Description empty or not found.</i></p>'}</div>
        </div>

        <div class="timeline-header">
            <h2>Timeline / ${allTimelineItems.length} items (${processedNotes?.length || 0} Notes, ${processedEmails?.length || 0} Emails)</h2>
            <a href="#" id="toggle-all-timeline">Collapse All</a>
        </div>
    `;

    if (validTimelineItems.length === 0) {
        htmlOutput += "<p>No Notes or Emails found or extracted successfully.</p>";
    } else {
        validTimelineItems.forEach(item => {
            let contentHtml = '';
            // Use the unified 'content' property
            if (item.content && (item.content.startsWith('Error:') || item.content.startsWith('[Fetch Error') || item.content.startsWith('[Body Fetch Error') || item.content.startsWith('[Content'))) {
               contentHtml = `<span class="error-message">${escapeHtml(item.content)}</span>`;
            } else {
               contentHtml = item.content || '<i>[Content Missing]</i>';
            }

            let visibilityLabel = '';
            if (item.type === 'Note') {
                if (item.isPublic === true) visibilityLabel = `<span class="item-visibility public">(public)</span>`;
                else if (item.isPublic === false) visibilityLabel = `<span class="item-visibility internal">(internal)</span>`;
            }

            let formattedTimestamp = 'N/A';
            if (item.dateObject && !isNaN(item.dateObject.getTime())) {
                formattedTimestamp = item.dateObject.toLocaleString(undefined, {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                });
            } else {
                formattedTimestamp = escapeHtml(item.dateStr || 'Date Error');
            }

            const itemTypeClass = `type-${escapeHtml(item.type?.toLowerCase() || 'unknown')}`;
            const itemTypeLabel = escapeHtml(item.type || 'Item');
            // Use the unified 'title' property
            const itemTitle = escapeHtml(item.title || 'N/A');
            const itemAuthor = escapeHtml(item.author || 'N/A');
            const itemTo = escapeHtml(item.to || 'N/A');

            let headerMetaDetails = (item.type === 'Email')
                ? `<span class="item-meta"><span class="item-meta-label">From:</span> <span class="item-meta-info">${itemAuthor}</span> | <span class="item-meta-label">To:</span> <span class="item-meta-info">${itemTo}</span></span>`
                : `<span class="item-meta"><span class="item-meta-label">By:</span> <span class="item-meta-info"><strong>${itemAuthor}</strong></span></span>`;

            htmlOutput += `
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

    // Add the debug info at the end
    htmlOutput += debugInfoSection;

    htmlOutput += `
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const headers = document.querySelectorAll('.item-header');
            headers.forEach(header => {
                header.addEventListener('click', () => {
                    header.closest('.timeline-item').classList.toggle('collapsed');
                });
            });

            const toggleAllButton = document.getElementById('toggle-all-timeline');
            if (toggleAllButton) {
                toggleAllButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    const timelineItems = document.querySelectorAll('.timeline-item');
                    if (timelineItems.length === 0) return;

                    const shouldCollapse = !timelineItems[0].classList.contains('collapsed');
                    
                    timelineItems.forEach(item => {
                        if (shouldCollapse) {
                            item.classList.add('collapsed');
                        } else {
                            item.classList.remove('collapsed');
                        }
                    });

                    e.target.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
                });
            }
        });
    </script>
</body></html>`;
    return htmlOutput;
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    psmhLogger.debug(`Content Script: Received message action="${message.action}"`);

    if (message.action === "generateFullView") {
        psmhLogger.info("Handling 'generateFullView' command.");
        const now = new Date();
        const generatedTime = now.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
        const statusDiv = document.getElementById('psmh-status');
        if (statusDiv) {
            statusDiv.textContent = 'Extracting data...';
            statusDiv.style.color = 'var(--psmh-status-warn)';
        }

        generateCaseViewHtml(generatedTime)
          .then(fullHtml => {
            psmhLogger.info("HTML generation complete. Sending to background.");
            if (statusDiv) {
                statusDiv.textContent = 'Opening results...';
                statusDiv.style.color = 'var(--psmh-status-success)';
            }
            chrome.runtime.sendMessage({ action: "openFullViewTab", htmlContent: fullHtml });

            setTimeout(() => {
                const currentStatusDiv = document.getElementById('psmh-status');
                if (currentStatusDiv) {
                    currentStatusDiv.textContent = 'Ready.';
                    currentStatusDiv.style.color = ''; 
                }
            }, 4000);
          })
          .catch(error => {
            psmhLogger.error("Error during HTML generation:", error);
            if (statusDiv) {
                statusDiv.textContent = 'Error generating view!';
                statusDiv.style.color = 'var(--psmh-status-error)';
            }
            chrome.runtime.sendMessage({
                action: "openFullViewTab",
                htmlContent: `<html><body><h1>Error Generating View</h1><pre>${escapeHtml(error.message)}</pre></body></html>`
            });
          });

        return true; 
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

    return false;
});
// End of file
EOF

echo "✅ All files fixed and updated successfully."
