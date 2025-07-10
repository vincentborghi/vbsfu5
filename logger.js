// logger.js - A simple, centralized, level-based logger for the extension.

// Check if the logger has already been initialized to prevent redeclaration errors.
if (typeof globalThis.psmhLogger === 'undefined') {
    const psmhLogger = {
        level: 3, // Default level: INFO
        levels: {
            'ERROR': 1,
            'WARN': 2,
            'INFO': 3,
            'DEBUG': 4
        },

        /**
         * Initializes the logger by fetching the saved log level from chrome.storage.
         * Defaults to INFO if no setting is found.
         */
        async init() {
            try {
                const data = await chrome.storage.sync.get('logLevel');
                const storedLevelName = data.logLevel || 'INFO';
                this.level = this.levels[storedLevelName] || 3;
                console.log(`[PSMH Logger] Initialized. Log level set to ${storedLevelName} (${this.level}).`);
            } catch (e) {
                console.error("[PSMH Logger] Could not initialize from storage. Defaulting to INFO.", e);
                this.level = 3;
            }
        },

        /**
         * Sets the current logging level.
         * @param {string} levelName - The name of the level (e.g., 'DEBUG').
         */
        setLevel(levelName) {
            const newLevel = this.levels[levelName];
            if (newLevel) {
                this.level = newLevel;
                // Use a direct console.log here so this message always appears.
                console.log(`[PSMH Logger] Log level changed to ${levelName} (${this.level}).`);
            } else {
                this.error(`Attempted to set invalid log level: ${levelName}`);
            }
        },

        /**
         * Logs a message at the DEBUG level.
         * For detailed, verbose information like function calls, variable states, etc.
         */
        debug(message, ...args) {
            if (this.level >= this.levels.DEBUG) {
                console.debug(`[PSMH DEBUG]`, message, ...args);
            }
        },

        /**
         * Logs a message at the INFO level.
         * For major lifecycle events and milestones.
         */
        info(message, ...args) {
            if (this.level >= this.levels.INFO) {
                console.info(`[PSMH INFO]`, message, ...args);
            }
        },

        /**
         * Logs a message at the WARN level.
         * For non-critical issues or unexpected situations that don't break functionality.
         */
        warn(message, ...args) {
            if (this.level >= this.levels.WARN) {
                console.warn(`[PSMH WARN]`, message, ...args);
            }
        },

        /**
         * Logs a message at the ERROR level.
         * For critical errors that prevent functionality.
         */
        error(message, ...args) {
            if (this.level >= this.levels.ERROR) {
                console.error(`[PSMH ERROR]`, message, ...args);
            }
        }
    };

    // Self-initialize the logger when the script is loaded.
    // The `globalThis` makes it work in both background (service worker) and content script contexts.
    globalThis.psmhLogger = psmhLogger;
    (async () => {
        await globalThis.psmhLogger.init();
    })();

    // Add a listener to handle dynamic changes to the log level.
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.logLevel) {
            const newLevelName = changes.logLevel.newValue;
            globalThis.psmhLogger.setLevel(newLevelName);
        }
    });
}
// End of file
