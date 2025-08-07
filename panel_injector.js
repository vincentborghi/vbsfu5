// panel_injector.js - Injects the UI, makes it draggable, and handles events.
// The logger is now accessed via the global psmhLogger object defined in logger.js

psmhLogger.info("UI Panel Injector Loaded.");

// --- Helper: Wait for an element to appear in the DOM ---
/**
 * Waits for an element matching the selector to appear in the DOM.
 * @param {string} selector - CSS selector
 * @param {Element} [baseElement=document] - Base element
 * @param {number} [timeout=8000] - Timeout in ms (lowered as requested).
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, baseElement = document, timeout = 8000) {
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

/**
 * Updates the status div with a message and a corresponding style.
 * @param {string} message - The text to display.
 * @param {'info'|'success'|'warn'|'error'} type - The type of message.
 */
function updateStatus(message, type = 'info') {
    const statusDiv = document.getElementById('psmh-status');
    if (!statusDiv) return;

    // Clear previous content
    statusDiv.innerHTML = '';

    if (!message) {
        statusDiv.style.color = 'var(--psmh-button-text)';
        return;
    }

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    statusDiv.appendChild(msgSpan);

    const clearBtn = document.createElement('span');
    clearBtn.className = 'psmh-status-clear-btn';
    clearBtn.innerHTML = '&times;';
    clearBtn.title = 'Clear message';
    clearBtn.onclick = () => {
        statusDiv.innerHTML = '';
        statusDiv.style.color = 'var(--psmh-button-text)';
    };
    statusDiv.appendChild(clearBtn);

    switch (type) {
        case 'success':
            statusDiv.style.color = 'var(--psmh-status-success)';
            break;
        case 'warn':
            statusDiv.style.color = 'var(--psmh-status-warn)';
            break;
        case 'error':
            statusDiv.style.color = 'var(--psmh-status-error)';
            break;
        default: // 'info'
            statusDiv.style.color = 'var(--psmh-button-text)';
            break;
    }
}

// --- Feature: Inject Custom Information Below the Header Row ---
/**
 * Finds key information on the page and injects it into a custom, visible container.
 * This is now triggered by a button click.
 */
async function injectCustomHeaderInfo() {
    psmhLogger.info('"Show Key Info" button clicked.');    
    updateStatus('Gathering info...', 'warn');
    
    // Find the currently active Salesforce tab button to reliably get the panel ID.
    const activeTabButtonSelector = 'li.slds-is-active[role="presentation"] a[role="tab"]';
    const activeTabButton = await waitForElement(activeTabButtonSelector);
     if (!activeTabButton) {
        psmhLogger.error("Could not find the active Salesforce tab button. Selector used:", activeTabButtonSelector);
        updateStatus('Error: Active tab missing', 'error');
        return;
    }
    psmhLogger.debug("Found active tab button.", activeTabButton);

    const panelId = activeTabButton.getAttribute('aria-controls');
    if (!panelId) {
        psmhLogger.error("Active tab button has no 'aria-controls' ID.");
        updateStatus('Error: Could not identify tab content.', 'error');
        return;
    }
    psmhLogger.debug("Found panel ID:", panelId);
    
    const activeTabPanel = document.getElementById(panelId);
    if (!activeTabPanel) {
        psmhLogger.error(`Could not find tab panel with ID: ${panelId}`);
        updateStatus('Error: Could not find tab content.', 'error');
        return;
    }
    psmhLogger.debug("Found active tab panel.", activeTabPanel);

    // Get current record ID from URL to handle toggling vs. re-fetching stale data
    const url = window.location.href;
    const recordIdMatch = url.match(/\/(Case|WorkOrder)\/([a-zA-Z0-9]{15,18})/);
    const currentRecordId = recordIdMatch ? recordIdMatch[2] : null;
    if (!currentRecordId) {
        psmhLogger.warn("Could not determine record ID from URL for 'Show Key Info'. Toggle may show stale data on navigation.");
    }

    // 1. Find the main highlights panel to insert our container into.
    const highlightsPanelSelector = 'records-highlights2';
    const highlightsPanel = await waitForElement(highlightsPanelSelector, activeTabPanel);
    if (!highlightsPanel) {
        psmhLogger.warn('Could not find highlights panel. Selector used:', highlightsPanelSelector);        
        updateStatus('Error: Page structure error', 'error');
        return;
    }
    psmhLogger.debug("Found highlights panel.", highlightsPanel);

    // 2. Check if the container exists to implement toggle logic.
    const containerSelector = '.psmh-custom-info-container';
    let infoContainer = highlightsPanel.querySelector(containerSelector);

    if (infoContainer) {
        const storedRecordId = infoContainer.dataset.recordId;
        // If the container is for the current record, toggle its visibility.
        if (currentRecordId && storedRecordId === currentRecordId) {
            if (infoContainer.style.display === 'none') {
                psmhLogger.info("Info container exists but is hidden. Showing it.");
                infoContainer.style.display = 'block';                
                updateStatus('Key info shown.', 'success');
            } else {
                psmhLogger.info("Info container is visible. Hiding it.");
                infoContainer.style.display = 'none';
                updateStatus('Key info hidden.', 'info');
            }
            return; // We're done, no need to re-create or re-populate.
        }
        psmhLogger.info("Stale data detected for a new record. Re-populating info container.");
        infoContainer.innerHTML = ''; // Data is stale, so clear the container for re-population.
        infoContainer.style.display = 'block'; // Ensure it's visible if it was previously hidden on another page.
    } else {
        psmhLogger.debug("Creating new info container.");
        infoContainer = document.createElement('div');
        infoContainer.className = 'psmh-custom-info-container';
        infoContainer.style.cssText = `padding: 4px 6px; margin: 0; border-top: 1px solid #dddbda; border-bottom: 1px solid #dddbda;`; // Compact style
        highlightsPanel.appendChild(infoContainer);
    }
    
    // --- Build the info string ---
    const infoParts = [];
    
    // Store the current record ID on the container so we can check for staleness next time.
    if (currentRecordId) {
        infoContainer.dataset.recordId = currentRecordId;
    }

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
            infoParts.push({ label: 'Account:', value: accountName });
        } else {
            psmhLogger.warn("Found Account container but no name inside.");
            infoParts.push({ label: 'Account:', value: 'N/A' });
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
            infoParts.push({ label: 'Created By:', value: createdBy });
        }
    } else {
        psmhLogger.warn("Created By container not found.");
    }

    // --- Display the combined info ---
    if (infoParts.length > 0) {
        infoContainer.innerHTML = ''; // Clear previous content
        const infoDisplayDiv = document.createElement('div');
        infoDisplayDiv.className = 'psmh-info-display';
        infoDisplayDiv.style.cssText = `font-size: 1em; color: #664d03; background-color: #fffbe6; padding: 8px 14px; border-radius: 6px; border-left: 5px solid #ffc107; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;`;

        infoParts.forEach((part, index) => {
            const pairSpan = document.createElement('span');
            pairSpan.className = 'psmh-info-pair';
            pairSpan.innerHTML = `<span class="psmh-info-label">${part.label}</span><span class="psmh-info-value">${part.value}</span>`;
            infoDisplayDiv.appendChild(pairSpan);

            if (index < infoParts.length - 1) {
                const separator = document.createElement('span');
                separator.className = 'psmh-info-separator';
                separator.textContent = '/';
                infoDisplayDiv.appendChild(separator);
            }
        });

        infoContainer.appendChild(infoDisplayDiv);
        psmhLogger.info(`Displayed Info: "${infoParts.join(' / ')}"`);        
        updateStatus('Key info shown.', 'success');
    } else {
        psmhLogger.warn("No info parts were found to display.");        
        updateStatus('Could not find info.', 'warn');
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

/**
 * A generic function to set the value of a standard text input and dispatch events.
 * @param {string} selector - The CSS selector for the <input> element.
 * @param {string} value - The value to set.
 * @param {string} fieldName - A human-readable name for logging.
 * @returns {Promise<boolean>}
 */
async function setInputValue(selector, value, fieldName) {
    psmhLogger.debug(`setInputValue: Setting ${fieldName} with selector "${selector}"`);
    const inputElement = await waitForElement(selector, document, 3000);
    if (!inputElement) {
        psmhLogger.error(`setInputValue: Could not find the ${fieldName} input element.`);
        return false;
    }
    inputElement.value = value;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
    psmhLogger.info(`setInputValue: Successfully set ${fieldName} to "${value}".`);
    return true;
}

/**
 * A generic function to click a picklist (combobox) trigger and select an option.
 * @param {string} triggerSelector - The CSS selector for the button that opens the dropdown.
 * @param {string} optionValue - The exact value of the option to select (e.g., from a 'data-value' attribute).
 * @param {string} fieldName - A human-readable name for logging.
 * @returns {Promise<boolean>}
 */
async function setPicklistValue(triggerSelector, optionValue, fieldName) {
    psmhLogger.debug(`setPicklistValue: Setting ${fieldName} to "${optionValue}"`);
    const triggerElement = await waitForElement(triggerSelector, document, 3000);
    if (!triggerElement) {
        psmhLogger.error(`setPicklistValue: Could not find the ${fieldName} trigger button.`);
        return false;
    }
    triggerElement.click(); // Open the dropdown

    // This selector is specific to how Salesforce LWC combobox items are rendered
    const optionSelector = `lightning-base-combobox-item[data-value="${optionValue}"]`;
    const optionElement = await waitForElement(optionSelector, document, 3000);

    if (!optionElement) {
        psmhLogger.error(`setPicklistValue: Could not find option "${optionValue}" for ${fieldName}.`);
        triggerElement.click(); // Attempt to close the dropdown
        return false;
    }

    optionElement.click(); // Select the option
    psmhLogger.info(`setPicklistValue: Successfully set ${fieldName} to "${optionValue}".`);
    return true;
}


async function autofillCommunity() {
    psmhLogger.info('autofillCommunity: called');    
    updateStatus('Autofilling Community Info...', 'warn');

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
        updateStatus(`Autofilled ${fieldsToAutofill.length} fields successfully!`, 'success');
    } else {
        updateStatus('Error: Failed to autofill one or more fields.', 'error');
    }
}

/**
 * Finds the "From" address dropdown in a Salesforce "New Email" form and selects a specific address.
 */
async function autofillFromAddress() {
    psmhLogger.info('"Autofill From Address" button clicked.');
    updateStatus('Searching for "From" dropdown...', 'warn');

    // Get the configured email address from storage
    const data = await chrome.storage.sync.get('preferredFromAddress');
    const desiredEmail = data.preferredFromAddress || 'PSM-Support-Email <psm-support-email@atos.net>';
    psmhLogger.debug(`Using preferred "From" address from settings: "${desiredEmail}"`);

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
        updateStatus('Error: "From" field label not found.', 'error');
        return;
    }

    // Step 2: Find the associated trigger link (<a>) from the label's parent container.
    const container = fromLabel.closest('.uiInput.uiInputSelect');
    if (!container) {
        psmhLogger.error('Could not find the parent container (.uiInput.uiInputSelect) for the label.');
        updateStatus('Error: "From" field container not found.', 'error');
        return;
    }
    psmhLogger.debug('Found parent container:', container);
    
    const dropdownTrigger = container.querySelector('a[role="combobox"]');
    if (!dropdownTrigger) {
         psmhLogger.error('Could not find the dropdown trigger link inside the container.');
         updateStatus('Error: Cannot click "From" dropdown.', 'error');
         return;
    }

    psmhLogger.debug('Clicking the dropdown trigger.', dropdownTrigger);
    dropdownTrigger.click();

    // Step 3: Wait for the desired option to appear and click it. In Aura, this is typically a `li.uiMenuItem a`.
    const optionSelector = `li.uiMenuItem a[title="${desiredEmail}"]`;
    
    psmhLogger.debug(`Waiting for option with selector: "${optionSelector}"`);
    const emailOptionElement = await waitForElement(optionSelector, document, 3000);

    if (!emailOptionElement) {
        psmhLogger.error(`The email option "${desiredEmail}" was not found in the dropdown.`);
        updateStatus(`Error: Option "${desiredEmail}" not found.`, 'error');
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
        updateStatus(`Autofilled "${desiredEmail}"!`, 'success');
        psmhLogger.info('Successfully autofilled. New value confirmed:', selectedText);
    } else {
        psmhLogger.warn('Clicked the option, but the new value was not immediately reflected. Current value:', selectedText);
        updateStatus('Autofill may have failed.', 'warn');
    }
}

/**
 * Gets an email from the FUDFE input, falling back to the clipboard if the input is empty.
 * Updates the status panel and the input field accordingly.
 * @returns {Promise<string|null>} A valid email address or null.
 */
async function getEmailFromInputOrClipboard() {
    psmhLogger.debug("getEmailFromInputOrClipboard: Starting.");
    const emailInput = document.getElementById('psmh-fudfe-input');
    let email = emailInput.value.trim();

    if (email) {
        psmhLogger.debug(`getEmailFromInputOrClipboard: Found email in input field: "${email}"`);
        return email;
    }

    psmhLogger.info("getEmailFromInputOrClipboard: Input is empty, trying to read from clipboard.");
    updateStatus('Input empty, checking clipboard...', 'info');
    
    try {
        const clipboardText = await navigator.clipboard.readText();
        const trimmedText = clipboardText.trim();
        psmhLogger.debug(`getEmailFromInputOrClipboard: Read from clipboard (trimmed): "${trimmedText}"`);

        // Stricter, anchored email validation regex to ensure the whole string is an email
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (emailRegex.test(trimmedText)) {
            email = trimmedText;
            psmhLogger.info(`getEmailFromInputOrClipboard: Found valid email in clipboard: "${email}"`);
            updateStatus('Using email from clipboard.', 'success');
            emailInput.value = email;
            // Trigger input event to show clear button
            emailInput.dispatchEvent(new Event('input', { bubbles: true })); 
            return email;
        } else {
            psmhLogger.warn(`getEmailFromInputOrClipboard: Clipboard content is not a valid email: "${clipboardText}"`);
            updateStatus('Clipboard has no valid email.', 'error');
            return null;
        }
    } catch (err) {
        psmhLogger.error("getEmailFromInputOrClipboard: Could not read from clipboard.", err);
        updateStatus('Failed to read clipboard.', 'error');
        return null;
    }
}

/**
 * Opens a Salesforce report to look up the last login time for a given email.
 */
async function lookupLastLoginFromEmail() {
    psmhLogger.info("FUDFE: 'Lookup Last Login' button clicked.");
    updateStatus('Getting email...', 'info');

    const email = await getEmailFromInputOrClipboard();
    if (!email) {
        psmhLogger.warn("lookupLastLoginFromEmail: No valid email found. Aborting.");
        return;
    }

    const encodedEmail = encodeURIComponent(email);
    const reportUrl = `${window.location.origin}/lightning/r/Report/00ObD0000027JRNUA2/view?fv0=${encodedEmail}`;

    window.open(reportUrl, '_blank');
    updateStatus('Last login report opened.', 'info');
}

/**
 * Parses an email to extract first/last names and populates the "New Contact" form.
 */
async function fillUserDataFromEmail() {
    psmhLogger.info("FUDFE: 'Fill User Data From Email' button clicked.");

    /* Do not suppress this comment, NB: the if does not do the trick apparently
    if (!window.location.href.includes('/lightning/r/Contact/')) {
        const errorMsg = "Operation not available here: the current view is not a Contact.";
        psmhLogger.warn(`fillUserDataFromEmail: Aborting. ${errorMsg}`);
        updateStatus(errorMsg, 'error');
        return;
    }
        */ 

    updateStatus('Getting email...', 'info');

    const email = await getEmailFromInputOrClipboard();
    if (!email) {
        psmhLogger.warn("fillUserDataFromEmail: No valid email found. Aborting.");
        return;
    }
    psmhLogger.debug(`fillUserDataFromEmail: Proceeding with email: "${email}"`);

    const lowerCaseEmail = email.toLowerCase();
    const namePart = lowerCaseEmail.split('@')[0];
    const nameParts = namePart.split('.');

    // Helper to capitalize names, including hyphenated ones
    const capitalize = (str) => {
        if (!str) return '';
        return str.trim().split('-').map(part => {
            const trimmedPart = part.trim();
            return trimmedPart.charAt(0).toUpperCase() + trimmedPart.slice(1);
        }).join('-');
    };

    let firstName, lastName;
    if (nameParts.length < 2) {
        psmhLogger.warn(`FUDFE: Email does not contain a '.' separator. Using the whole name part for both First and Last Name.`);
        firstName = capitalize(namePart);
        lastName = capitalize(namePart);
    } else {
        firstName = capitalize(nameParts[0]);
        lastName = capitalize(nameParts[1]);
    }

    psmhLogger.debug(`Parsed email. First: ${firstName}, Last: ${lastName}, Email: ${lowerCaseEmail}`);

    // Populate the form fields
    const successTitle = await setPicklistValue('button[name="salutation"]', 'Mr.', 'Title');
    const successFirstName = await setInputValue('input[name="firstName"]', firstName, 'First Name');
    const successLastName = await setInputValue('input[name="lastName"]', lastName, 'Last Name');
    const successEmail = await setInputValue('input[name="Email"]', lowerCaseEmail, 'Email');

    if (successTitle && successFirstName && successLastName && successEmail) {
        updateStatus('User data filled successfully!', 'success');
    } else {
        updateStatus('Error: Could not fill all fields.', 'error');
    }
}

// --- Draggable Panel Logic ---
function makePanelDraggable(panel, header, lastVisiblePosition) {
    psmhLogger.debug('makePanelDraggable: Initializing for panel:', panel);
    
    let initialPanelTop = 0, initialPanelRight = 0, initialMouseX = 0, initialMouseY = 0;
    const toggleButton = document.getElementById('psmh-toggle');

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        psmhLogger.debug('dragMouseDown: Mouse down on header.');
        e.preventDefault();
        
        // Get the initial mouse cursor position
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;

        // Get the initial panel position
        initialPanelTop = panel.offsetTop;
        initialPanelRight = parseFloat(window.getComputedStyle(panel).right);

        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        psmhLogger.debug('Attaching mousemove and mouseup listeners.');
        header.style.cursor = 'grabbing';
    }

    function elementDrag(e) {
        e.preventDefault();
        
        // Calculate the displacement of the mouse from its starting point
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;

        // Calculate the new panel position based on its initial position and the mouse displacement
        const newTop = initialPanelTop + dy;
        // For 'right' property, moving mouse right (positive dx) should decrease the 'right' value.
        const newRight = initialPanelRight - dx;

        panel.style.top = newTop + "px";
        panel.style.right = newRight + "px";
        panel.style.left = ''; // Ensure left is not set, to avoid conflicts

        // Move the toggle button along with the panel during the drag
        if (toggleButton) {
           toggleButton.style.top = newTop + "px";
           toggleButton.style.right = (newRight + 15) + "px";
        }
    }

    function closeDragElement() {
        psmhLogger.debug('closeDragElement: Mouse up. Removing listeners.');

        // Update the last known position for the toggle functionality
        lastVisiblePosition.top = panel.offsetTop;
        lastVisiblePosition.right = parseFloat(window.getComputedStyle(panel).right);
        
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
    const dragHandle = myCreateElement('span', { className: 'psmh-drag-handle', textContent: '⠿' });
    const title = myCreateElement('h4', { textContent: 'PSM Helper' });
    header.append(dragHandle, title);

    const content = myCreateElement('div', { id: 'psmh-content' });

    const caseOpenerContainer = myCreateElement('div', { id: 'psmh-case-opener-container' });
    const caseInput = myCreateElement('input', { id: 'psmh-case-input', type: 'text', placeholder: 'Case Number...', name: 'psmh-case-number', autocomplete: 'on' });
    const openCaseButton = myCreateElement('button', { id: 'psmh-open-case', textContent: 'View', className: 'psmh-button' });
    caseOpenerContainer.append(caseInput, openCaseButton);

    const autofillButton = myCreateElement('button', { id: 'psmh-autofill-from', textContent: 'Fill "From" Field', className: 'psmh-button' });
    const showInfoButton = myCreateElement('button', { id: 'psmh-show-info', textContent: 'Show Key Info', className: 'psmh-button' });
    const generateButton = myCreateElement('button', { id: 'psmh-generate', textContent: 'Generate Full View', className: 'psmh-button' });
    const copyButton = myCreateElement('button', { id: 'psmh-copy', textContent: 'Copy Case Link', className: 'psmh-button' });
    const updateByEmailButton = myCreateElement('button', { id: 'psmh-update-by-email', textContent: 'Update Case by Email', className: 'psmh-button' });

    // --- Create Collapsible Sections ---
    const autofillDetails = myCreateElement('details', {});
    const autofillSummary = myCreateElement('summary', { textContent: 'Admin Tools' });
    const autofillContent = myCreateElement('div', { className: 'psmh-section-content' });    
    const autofillCommButton = myCreateElement('button', { id: 'psmh-autofill-comm', textContent: 'Fill Community Info', className: 'psmh-button' });
    
    // Create new FUDFE elements
    const fudfeContainer = myCreateElement('div', { id: 'psmh-fudfe-container' });
    const fudfeActionsContainer = myCreateElement('div', { className: 'psmh-fudfe-actions' });
    // keep the string e\u200Bmail as it is to prevent LastPass from interfering
    const fudfeInput = myCreateElement('input', { id: 'psmh-fudfe-input',  type: 'text', placeholder: 'Enter e\u200Bma\u200Bil or use clipboard' });
    fudfeInput.setAttribute('data-lpignore', 'true');
    const lookupLoginButton = myCreateElement('button', { id: 'psmh-lookup-login-btn', textContent: 'Lookup Last Login From Email', className: 'psmh-button psmh-button-small' });
    const fudfeButton = myCreateElement('button', { id: 'psmh-fudfe-button', textContent: 'Fill Contact Data From Email', className: 'psmh-button psmh-button-small' });

    // --- Create a wrapper for the input and its new clear button ---
    const fudfeInputWrapper = myCreateElement('div', {});
    fudfeInputWrapper.style.cssText = 'position: relative; display: flex; align-items: center; width: 100%;';

    const fudfeClearButton = myCreateElement('span', { innerHTML: '&times;', title: 'Clear email' });
    fudfeClearButton.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; font-size: 18px; color: #999; display: none;';

    // Adjust input style to make space for the clear button
    fudfeInput.style.width = '100%';
    fudfeInput.style.boxSizing = 'border-box'; // Ensure padding is included in the width
    fudfeInput.style.paddingRight = '25px';

    // Append the input and clear button to their wrapper
    fudfeInputWrapper.append(fudfeInput, fudfeClearButton);

    // Assemble the FUDFE container
    fudfeActionsContainer.append(lookupLoginButton, fudfeButton);
    fudfeContainer.append(fudfeInputWrapper, fudfeActionsContainer);

    autofillContent.append(autofillCommButton, fudfeContainer); // Group autofill buttons
    autofillDetails.append(autofillSummary, autofillContent);

    const devDetails = myCreateElement('details', { id: 'psmh-dev-tools-details' });
    const devSummary = myCreateElement('summary', { textContent: 'Developer Tools' });
    const devContent = myCreateElement('div', { className: 'psmh-section-content' });
    
    const debugButton = myCreateElement('button', { id: 'psmh-debug', textContent: 'Debug to console', className: 'psmh-button' });
    
    // Create Log Level Dropdown
    const logLevelContainer = myCreateElement('div', {});
    logLevelContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 12px;';
    const logLevelLabel = myCreateElement('label', { htmlFor: 'psmh-log-level-select', textContent: 'Log Level:' });
    const logLevelSelect = myCreateElement('select', { id: 'psmh-log-level-select' });
    logLevelSelect.style.cssText = 'padding: 2px; border-radius: 3px; border: 1px solid #ccc;';
    ['ERROR', 'WARN', 'INFO', 'DEBUG'].forEach(level => {
        const option = myCreateElement('option', { value: level, textContent: level });
        logLevelSelect.appendChild(option);
    });
    logLevelContainer.append(logLevelLabel, logLevelSelect);    
    devContent.append(debugButton, logLevelContainer);

    // This setting is being moved to the new Preferences modal
    const shortcutContainer = myCreateElement('div', {});
    shortcutContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-top: 6px;';
    const shortcutLabel = myCreateElement('label', { htmlFor: 'psmh-close-shortcut-toggle', textContent: 'Enable Alt+C  (Close Tab):' });
    const shortcutToggle = myCreateElement('input', { id: 'psmh-close-shortcut-toggle', type: 'checkbox' });
    shortcutContainer.append(shortcutLabel, shortcutToggle);
    devDetails.append(devSummary, devContent); // Group dev tools

    // Create a new row for About and Help buttons
    const aboutHelpRow = myCreateElement('div', { className: 'psmh-button-group-left' });
    aboutHelpRow.style.cssText = 'display: flex; gap: 6px;';
    const newAboutButton = myCreateElement('button', { id: 'psmh-about-btn', textContent: 'About', className: 'psmh-button' });
    newAboutButton.style.flex = '1';
    const helpButton = myCreateElement('button', { id: 'psmh-help-btn', textContent: 'Help', className: 'psmh-button psmh-button-small-text' });
    const prefsButton = myCreateElement('button', { id: 'psmh-prefs-btn', className: 'psmh-button', innerHTML: '⚙️', title: 'Preferences' });

    const leftButtons = myCreateElement('div', { className: 'psmh-button-group-left' });
    leftButtons.append(newAboutButton, helpButton);

    aboutHelpRow.append(leftButtons, prefsButton);
    
    // New button order
    content.appendChild(caseOpenerContainer);
    content.appendChild(copyButton); // Moved up
    content.appendChild(updateByEmailButton);
    content.appendChild(autofillButton);
    content.appendChild(showInfoButton);
    content.appendChild(generateButton);
    content.appendChild(autofillDetails); // Moved down
    content.appendChild(devDetails);
    content.appendChild(aboutHelpRow); // New button row at the bottom

    panel.appendChild(header);
    panel.appendChild(content);
    const statusDiv = myCreateElement('div', { id: 'psmh-status', textContent: 'Ready.' });
    panel.appendChild(statusDiv);

    const toggleButton = myCreateElement('button', { id: 'psmh-toggle', innerHTML: '&#x1F6E0;&#xFE0F;', 'aria-label': 'Toggle Panel' });

    // --- About Modal --- (IDs are now more specific)
    const aboutModalOverlay = myCreateElement('div', { id: 'psmh-modal-overlay-about' });
    aboutModalOverlay.classList.add('psmh-modal-overlay');
    const aboutModalContent = myCreateElement('div', { id: 'psmh-modal-content-about' });
    aboutModalContent.classList.add('psmh-modal-content');
    const aboutModalClose = myCreateElement('button', { id: 'psmh-modal-close-about', innerHTML: '&times;' });
    const aboutModalTitle = myCreateElement('h5', { textContent: 'About PSM Helper' });
    const aboutModalBody = myCreateElement('div', { id: 'psmh-modal-body-about' });
    
    const extensionVersion = chrome.runtime.getManifest().version;
    aboutModalBody.innerHTML = `<p><strong>Version:</strong> ${extensionVersion}</p>
      <p>This Chrome extension is experimental and is not an official tool from Atos IT (the developers of PSM).</p>
      <p>For information or feedback, contact <b>Vincent Borghi</b>.</p>`;
    aboutModalContent.append(aboutModalClose, aboutModalTitle, aboutModalBody);
    aboutModalOverlay.appendChild(aboutModalContent);

    // --- Help Modal (New) ---
    const helpModalOverlay = myCreateElement('div', { id: 'psmh-modal-overlay-help' });
    helpModalOverlay.classList.add('psmh-modal-overlay');
    const helpModalContent = myCreateElement('div', { id: 'psmh-modal-content-help' });
    helpModalContent.classList.add('psmh-modal-content');
    const helpModalClose = myCreateElement('button', { id: 'psmh-modal-close-help', innerHTML: '&times;' });
    const helpModalTitle = myCreateElement('h5', { textContent: 'Help' });
    const helpModalBody = myCreateElement('div', { id: 'psmh-modal-body-help' });
    helpModalBody.innerHTML = `
      <p><i>(Help text draft - under construction)</i></p>
      <h4>Main Tools</h4>
      <p><strong>Case Number Lookup:</strong> Enter a 5 or 8-digit case number and press Enter or 'Go' to open the case page directly.</p>
      <p><strong>Copy Record Link:</strong> Copies a rich-text link of the current Case or Work Order number to your clipboard.</p>
      <p><strong>Show Key Info:</strong> Toggles a display of the Account and Creator's name below the main record header.</p>
      <p><strong>Generate Full View:</strong> Scans the current page for all notes and emails, then compiles them into a single, chronological view in a new tab.</p>
      <h4>Admin Tools</h4>
      <p><strong>Fill From Address:</strong> When composing an email, this sets the 'From' address to the default PSM Support email.</p>
      <p><strong>Fill Community Info:</strong> On the user creation page, this fills Language, Timezone, and other fields with default French/European values.</p>
      <p><strong>Email Tools:</strong> Enter a user's email address to use the 'Lookup Last Login' or 'Fill Contact Data' functions.</p>
      <h4>Developer Tools</h4>
      <p><strong>Log Level:</strong> Sets the verbosity of logs from this extension that appear in the developer console. 'ERROR' is the quietest, 'DEBUG' is the loudest.</p>
      <hr><p>Please report any issues or feedback to the developer.</p>
    `;
    helpModalContent.append(helpModalClose, helpModalTitle, helpModalBody);
    helpModalOverlay.appendChild(helpModalContent);

    // --- Update Case by Email Modal ---
    const updateCaseModalOverlay = myCreateElement('div', { id: 'psmh-modal-overlay-update-case' });
    updateCaseModalOverlay.classList.add('psmh-modal-overlay');
    const updateCaseModalContent = myCreateElement('div', { id: 'psmh-modal-content-update-case' });
    updateCaseModalContent.classList.add('psmh-modal-content');
    const updateCaseModalClose = myCreateElement('button', { id: 'psmh-modal-close-update-case', innerHTML: '&times;' });
    const updateCaseModalTitle = myCreateElement('h5', { textContent: 'Update Case by Email' });
    const updateCaseModalBody = myCreateElement('div', { id: 'psmh-modal-body-update-case' });
    updateCaseModalContent.append(updateCaseModalClose, updateCaseModalTitle, updateCaseModalBody);
    updateCaseModalOverlay.appendChild(updateCaseModalContent);

    // --- Preferences Modal (New) ---
    const prefsModalOverlay = myCreateElement('div', { id: 'psmh-modal-overlay-prefs' });
    prefsModalOverlay.classList.add('psmh-modal-overlay');
    const prefsModalContent = myCreateElement('div', { id: 'psmh-modal-content-prefs' });
    prefsModalContent.classList.add('psmh-modal-content');
    const prefsModalClose = myCreateElement('button', { id: 'psmh-modal-close-prefs', innerHTML: '&times;' });
    const prefsModalTitle = myCreateElement('h5', { textContent: 'Preferences' });
    const prefsModalBody = myCreateElement('div', { id: 'psmh-modal-body-prefs' });
    prefsModalBody.appendChild(shortcutContainer); // Move the shortcut setting here

    // --- Create 'From' Address Preference ---
    const fromAddressContainer = myCreateElement('div', {});
    fromAddressContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee;';
    const fromAddressLabel = myCreateElement('label', { htmlFor: 'psmh-from-address-select', textContent: 'Preferred "From" Address:' });
    const fromAddressSelect = myCreateElement('select', { id: 'psmh-from-address-select' });
    fromAddressSelect.style.cssText = 'padding: 4px; border-radius: 4px; border: 1px solid #ccc;';
    
    const fromOptions = [
        'PSM-Support-Email <psm-support-email@atos.net>',
        'PSM-Support-Email <psm-support-email@eviden.com>'
    ];

    fromOptions.forEach(addr => {
        const emailPart = addr.split('<')[1].split('>')[0];
        const option = myCreateElement('option', { value: addr, textContent: emailPart });
        fromAddressSelect.appendChild(option);
    });

    fromAddressContainer.append(fromAddressLabel, fromAddressSelect);
    prefsModalBody.appendChild(fromAddressContainer);

    prefsModalContent.append(prefsModalClose, prefsModalTitle, prefsModalBody);
    prefsModalOverlay.appendChild(prefsModalContent);


    document.body.appendChild(panel);
    document.body.appendChild(toggleButton);
    document.body.appendChild(aboutModalOverlay);
    document.body.appendChild(helpModalOverlay);
    document.body.appendChild(updateCaseModalOverlay);
    document.body.appendChild(prefsModalOverlay);
    psmhLogger.info('All UI elements appended to the body.');
    
    // --- State and Final Initialization ---

    // Store the last visible position of the panel. Initialize with CSS defaults.
    const lastVisiblePosition = {
        top: 140,
        right: 0
    };

    makePanelDraggable(panel, header, lastVisiblePosition);

    // --- Event Listeners ---
    psmhLogger.debug('Attaching event listeners.');
    toggleButton.onclick = () => {
        psmhLogger.debug('Toggle button clicked.');
        const currentRight = parseFloat(window.getComputedStyle(panel).right);

        if (currentRight < 0) { // If it's hidden, show it by restoring its last known position
            psmhLogger.debug('Panel is hidden. Showing it.');
            // Restore both top and right from the last known position to ensure they are in sync
            panel.style.top = lastVisiblePosition.top + 'px';
            panel.style.right = lastVisiblePosition.right + 'px';
            toggleButton.style.top = lastVisiblePosition.top + 'px';
            toggleButton.style.right = (lastVisiblePosition.right + 15) + 'px';
        } else {
            psmhLogger.debug('Panel is visible. Hiding it.');
            panel.style.right = '-230px';
            toggleButton.style.right = '15px'; // Reset toggle button to its default position
        }
    };

    // --- About Modal Listeners ---
    newAboutButton.onclick = () => {
        psmhLogger.debug('About button clicked, showing About modal.');
        aboutModalOverlay.classList.add('psmh-visible');
    };
    aboutModalClose.onclick = () => aboutModalOverlay.classList.remove('psmh-visible');
    aboutModalOverlay.onclick = (e) => {
        if (e.target === aboutModalOverlay) aboutModalOverlay.classList.remove('psmh-visible');
    };

    // --- Help Modal Listeners ---
    helpButton.onclick = () => {
        psmhLogger.debug('Help button clicked, showing Help modal.');
        helpModalOverlay.classList.add('psmh-visible');
    };
    helpModalClose.onclick = () => helpModalOverlay.classList.remove('psmh-visible');
    helpModalOverlay.onclick = (e) => {
        if (e.target === helpModalOverlay) helpModalOverlay.classList.remove('psmh-visible');
    };
    
    // --- Update Case Modal Listeners ---
    updateByEmailButton.onclick = async () => {
        psmhLogger.info("'Update Case by Email' button clicked.");
        updateStatus('Getting case number...', 'info');

        const recordNumber = await findRecordNumber();
        if (!recordNumber) {
            psmhLogger.error("Could not find record number for Update Case by Email.");
            updateStatus('Error: Case # not found.', 'error');
            return;
        }

        const emailTo = 'psm-case-update@atos.net';
        const subject = `Sample mail subject... [PSM-Case_Id: ${recordNumber}]`;
        const mailtoHref = `mailto:${emailTo}?subject=${encodeURIComponent(subject)}`;

        updateCaseModalBody.innerHTML = `
            <div class="psmh-update-modal-row">
                <a href="${mailtoHref}" id="psmh-update-mailto-link"><strong>To:</strong> ${emailTo}</a>
                <span class="psmh-copy-icon" data-clipboard-text="${emailTo}" title="Copy email address">📋</span>
            </div>
            <div class="psmh-update-modal-row">
                <span><strong>Subject:</strong> ${subject}</span>
                <span class="psmh-copy-icon" data-clipboard-text="${subject}" title="Copy subject">📋</span>
            </div>
            <p class="psmh-modal-instruction">Click the "To:" link to open your email client, or use the copy icons.</p>
            <p class="psmh-modal-instruction">PS: This function is useful because if you send an email to ${emailTo} 
             with a subject ending with "[PSM-Case_Id: ${recordNumber}]", this adds the email to the case.</p>
        `;

        updateCaseModalBody.querySelectorAll('.psmh-copy-icon').forEach(icon => {
            icon.onclick = (e) => {
                const textToCopy = e.target.dataset.clipboardText;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    updateStatus(`Copied: "${textToCopy.substring(0, 20)}..."`, 'success');
                }).catch(err => {
                    updateStatus('Error: Copy failed.', 'error');
                });
            };
        });

        updateCaseModalOverlay.classList.add('psmh-visible');
    };
    updateCaseModalClose.onclick = () => updateCaseModalOverlay.classList.remove('psmh-visible');
    updateCaseModalOverlay.onclick = (e) => {
        if (e.target === updateCaseModalOverlay) updateCaseModalOverlay.classList.remove('psmh-visible');
    };

    // --- Preferences Modal Listeners ---
    prefsButton.onclick = () => {
        psmhLogger.debug('Preferences button clicked, showing Preferences modal.');
        prefsModalOverlay.classList.add('psmh-visible');
    };
    prefsModalClose.onclick = () => prefsModalOverlay.classList.remove('psmh-visible');

    // --- FUDFE Clear Button Listeners ---
    psmhLogger.debug("Attaching FUDFE clear button listeners.");
    fudfeClearButton.onclick = () => {
        psmhLogger.debug('FUDFE clear button clicked.');
        fudfeInput.value = '';
        fudfeClearButton.style.display = 'none';
        fudfeInput.focus();
    };
    fudfeInput.oninput = () => {
        psmhLogger.debug(`fudfeInput.oninput event fired. Length: ${fudfeInput.value.length}`);
        fudfeClearButton.style.display = fudfeInput.value.length > 0 ? 'block' : 'none';
    };

    prefsModalOverlay.onclick = (e) => {
        if (e.target === prefsModalOverlay) prefsModalOverlay.classList.remove('psmh-visible');
    };

    // --- Developer Tools Auto-collapse Logic ---
    let devToolsCollapseTimer = null;
    devDetails.addEventListener('toggle', () => {
        if (devDetails.open) {
            psmhLogger.debug('Developer Tools opened. Starting 30-second auto-collapse timer.');
            // Start a timer to close it after 30 seconds
            devToolsCollapseTimer = setTimeout(() => {
                psmhLogger.info('Auto-collapsing Developer Tools after 30 seconds.');
                devDetails.open = false;
            }, 30000); // 30 seconds
        } else {
            // If the user closes it manually, cancel the timer
            if (devToolsCollapseTimer) {
                psmhLogger.debug('Developer Tools manually closed. Cancelling auto-collapse timer.');
                clearTimeout(devToolsCollapseTimer);
                devToolsCollapseTimer = null;
            }
        }
    });

    // Animate the panel into view on initial load
    setTimeout(() => {
        panel.style.right = lastVisiblePosition.right + 'px';
    }, 100);

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
        // The actual logger level is set by the listener in logger.js
    });
    
    // Listener for the new shortcut toggle
    shortcutToggle.onchange = (e) => {
        const isEnabled = e.target.checked;
        psmhLogger.info(`UI: User set 'Close on Alt+C' to ${isEnabled}.`);
        chrome.storage.sync.set({ closeOnAltC: isEnabled });
    };

    // Populate the shortcut toggle from storage
    chrome.storage.sync.get('closeOnAltC', (data) => {
        const isEnabled = !!data.closeOnAltC;
        shortcutToggle.checked = isEnabled;
        psmhLogger.debug(`UI: Set 'Close on Alt+C' toggle to saved value: ${isEnabled}`);
    });
    
    // Listener for the 'From' address dropdown
    fromAddressSelect.onchange = (e) => {
        const newAddress = e.target.value;
        psmhLogger.info(`UI: User changed preferred 'From' address to ${newAddress}. Saving to storage.`);
        chrome.storage.sync.set({ preferredFromAddress: newAddress });
    };

    // Populate the 'From' address dropdown from storage
    chrome.storage.sync.get('preferredFromAddress', (data) => {
        const savedAddress = data.preferredFromAddress || 'PSM-Support-Email <psm-support-email@atos.net>';
        fromAddressSelect.value = savedAddress;
        psmhLogger.debug(`UI: Set 'From' address dropdown to saved value: ${savedAddress}`);
    });

    showInfoButton.onclick = () => {
        psmhLogger.debug("'Show Key Info' button clicked, calling injectCustomHeaderInfo.");
        injectCustomHeaderInfo();
    };

    autofillButton.onclick = () => {
        psmhLogger.debug("'From Address' button clicked, calling autofillFromAddress.");
        autofillFromAddress();
    };

    autofillCommButton.onclick = () => {
        psmhLogger.debug("'Community Info' button clicked, calling autofillCommunity.");
        autofillCommunity();
    };

    lookupLoginButton.onclick = () => {
        psmhLogger.debug("'Lookup Last Login' button clicked, calling lookupLastLoginFromEmail.");
        lookupLastLoginFromEmail();
    };

    fudfeButton.onclick = () => {
        psmhLogger.debug("'Fill User Data' button clicked, calling fillUserDataFromEmail.");
        fillUserDataFromEmail();
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
            updateStatus('Preparing page for scan...', 'warn');
            
            // Scroll down to trigger lazy loading of related lists, then scroll specific lists into view.
            psmhLogger.debug("Scrolling to bottom and top to trigger lazy loads.");
            window.scrollTo(0, document.body.scrollHeight);
            // Wait for the next browser repaint to ensure the scroll is visible, then wait for content to load.
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 1000));
            window.scrollTo(0, 0);
            await new Promise(r => setTimeout(r, 200));

            psmhLogger.debug("Scrolling related lists into view to ensure they are loaded.");
            const notesList = await waitForElement('lst-related-list-view-manager:has(span[title="Notes"])');
            if (notesList) {
                notesList.scrollIntoView({ block: 'center' });
                await new Promise(r => setTimeout(r, 500));
            }

            const emailsList = await waitForElement('.forceRelatedListPreviewAdvancedGrid:has(span[title="Emails"])');
            if (emailsList) {
                emailsList.scrollIntoView({ block: 'center' });
                await new Promise(r => setTimeout(r, 500));
            }
            
            window.scrollTo({ top: 0, behavior: 'auto' }); // Reset view to the top
            
            updateStatus('Initiating generation...', 'warn');
            psmhLogger.info("Sending 'startFullViewGeneration' message to background script.");
            chrome.runtime.sendMessage({ action: "startFullViewGeneration" }, response => {
                if (chrome.runtime.lastError) {
                    const rawMessage = chrome.runtime.lastError.message;
                    psmhLogger.error("Error sending message:", rawMessage);
                    let userMessage = `Error: ${rawMessage}`;
                    if (rawMessage && rawMessage.includes("message channel closed")) {
                        userMessage = "A Salesforce tab closed unexpectedly. Please try again.";
                    }
                    updateStatus(userMessage, 'error');
                }
            });
        } catch (error) {
             psmhLogger.error('Error preparing page:', error);
             updateStatus('Error preparing page! Reload the web page and try again.', 'error');
        } finally {
             psmhLogger.debug("Re-enabling buttons.");
             generateButton.disabled = false;
             copyButton.disabled = false;
        }
    };

    openCaseButton.onclick = () => {
        let caseNumberInput = caseInput.value.trim();
        psmhLogger.info(`'Go' button clicked for case number: "${caseNumberInput}"`);

        const isFiveDigit = /^\d{5}$/.test(caseNumberInput);
        const isEightDigit = /^000\d{5}$/.test(caseNumberInput);

        if (!isFiveDigit && !isEightDigit) {
            updateStatus('Error: Case # must be 5 or 8 digits.', 'error');
            caseInput.focus();
            return;
        }

        if (isFiveDigit && parseInt(caseNumberInput, 10) <= 67000) {
            updateStatus('Error: 5-digit Case # must be > 67000.', 'error');
            caseInput.focus();
            return;
        }

        // Transform 5-digit number to 8-digit
        if (isFiveDigit) {
            caseNumberInput = '000' + caseNumberInput;
            psmhLogger.debug(`Transformed 5-digit input to ${caseNumberInput}`);
        }

        updateStatus(`Finding Case ${caseNumberInput}...`, 'warn');
        openCaseButton.disabled = true;
        chrome.runtime.sendMessage({ action: "findAndOpenCase", caseNumber: caseNumberInput }, (response) => {
            // Response handling happens via status updates from the background script.
            psmhLogger.debug("Message 'findAndOpenCase' sent to background script.");
            // Re-enable the button after a short delay
            setTimeout(() => { openCaseButton.disabled = false; }, 2000);
        });
    };

    // Add keydown listener to the case input field for 'Enter' key submission
    caseInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent any default form submission
            openCaseButton.click(); // Trigger the button's click event
        }
    };

    copyButton.onclick = async () => {
        psmhLogger.info("'Copy Record Link' button clicked.");
        updateStatus('Copying case link...', 'info');
        
        // Assumes findRecordNumber is in content.js and available globally.
        const recordNumber = await findRecordNumber(); 
        psmhLogger.debug(`Found record number: "${recordNumber}"`);
        const currentUrl = window.location.href;
        let objectType = 'Case';
        
        if (currentUrl.includes('/Case/')) {
            objectType = 'Case';
        } else if (currentUrl.includes('/WorkOrder/')) {
            objectType = 'WorkOrder';
        }
        psmhLogger.debug(`Determined object type: "${objectType}"`);
        
        if (recordNumber && currentUrl) {
            const linkText = `${objectType} ${recordNumber}`;

            // Use non-breaking spaces (&nbsp; in HTML, \u00A0 in JS) to prevent trimming by other apps.
            const richTextWithNbsp = `&nbsp;<a href="${currentUrl}">${linkText}</a>&nbsp;`;
            const plainTextWithNbsp = `\u00A0${linkText}\u00A0`;

            const blobHtml = new Blob([richTextWithNbsp], { type: 'text/html' });
            const blobText = new Blob([plainTextWithNbsp], { type: 'text/plain' });

            try {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
                psmhLogger.info('Successfully wrote to clipboard with surrounding non-breaking spaces.');
                updateStatus(`Copied: ${linkText}`, 'success');
            } catch(err) {
                psmhLogger.error('Clipboard write failed.', err);
                updateStatus('Error: Copy failed.', 'error');
            }
        } else {
            psmhLogger.error(`Failed to copy. Record Number: "${recordNumber}", URL: "${currentUrl}"`);
            updateStatus('Error: Record # not found.', 'error');
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
