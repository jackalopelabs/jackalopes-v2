// Debug utilities for Jackalopes game

// Debug level constants
export const DEBUG_LEVELS = {
  NONE: 0,      // No logs except critical errors
  ERROR: 1,     // Only error logs
  WARNING: 2,   // Errors and warnings
  INFO: 3,      // General information (default)
  VERBOSE: 4,   // Detailed logs
  ALL: 5        // Everything including repetitive frame-by-frame updates
};

// Colors for different log types
const LOG_COLORS = {
  error: '#FF5555',
  warn: '#FFAA00',
  info: '#55AAFF',
  debug: '#55FF55',
  network: '#AA55FF',
  audio: '#FFFF55',
  player: '#FF55FF',
  physics: '#55FFFF',
  camera: '#AAAAAA',
  model: '#FFAAAA'
};

// Get the current debug level
export const getDebugLevel = (): number => {
  return window.jackalopesGame?.debugLevel ?? 0;
};

// Check if a specific debug level is enabled
export const isDebugEnabled = (level: number): boolean => {
  return getDebugLevel() >= level;
};

// Console logging with built-in debug level checks
export const log = {
  // Error logs - shown at level 1+
  error: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.ERROR) {
      console.error(`%c${message}`, `color: ${LOG_COLORS.error}; font-weight: bold`, ...data);
    }
  },

  // Warning logs - shown at level 2+
  warn: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.WARNING) {
      console.warn(`%c${message}`, `color: ${LOG_COLORS.warn}; font-weight: bold`, ...data);
    }
  },

  // Info logs - shown at level 3+
  info: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c${message}`, `color: ${LOG_COLORS.info}`, ...data);
    }
  },

  // Debug logs - shown at level 4+
  debug: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.VERBOSE) {
      console.log(`%c${message}`, `color: ${LOG_COLORS.debug}`, ...data);
    }
  },

  // Verbose logs - shown at level 5 only
  verbose: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.ALL) {
      console.log(`%c${message}`, `color: ${LOG_COLORS.debug}; opacity: 0.7`, ...data);
    }
  },

  // Specialized logs by system
  network: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c🌐 ${message}`, `color: ${LOG_COLORS.network}`, ...data);
    }
  },

  audio: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c🔊 ${message}`, `color: ${LOG_COLORS.audio}`, ...data);
    }
  },

  player: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c🎮 ${message}`, `color: ${LOG_COLORS.player}`, ...data);
    }
  },

  physics: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.VERBOSE) {
      console.log(`%c⚛️ ${message}`, `color: ${LOG_COLORS.physics}`, ...data);
    }
  },

  camera: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c📷 ${message}`, `color: ${LOG_COLORS.camera}`, ...data);
    }
  },

  model: (message: string, ...data: any[]) => {
    if (getDebugLevel() >= DEBUG_LEVELS.INFO) {
      console.log(`%c🧩 ${message}`, `color: ${LOG_COLORS.model}`, ...data);
    }
  }
};

// Set up a listener for debug level changes
export const setupDebugListener = () => {
  window.addEventListener('debugLevelChanged', ((event: Event) => {
    // Cast to CustomEvent to access the detail property
    const customEvent = event as CustomEvent<{level: number}>;
    const level = customEvent.detail?.level ?? 0;
    
    if (level >= DEBUG_LEVELS.INFO) {
      console.log(`%cDebug level changed to ${level}`, 'background: #333; color: #fff; padding: 2px 4px; border-radius: 2px;');
      
      // Show what each level means
      if (level >= DEBUG_LEVELS.VERBOSE) {
        console.table({
          [DEBUG_LEVELS.NONE]: 'No logs',
          [DEBUG_LEVELS.ERROR]: 'Error only',
          [DEBUG_LEVELS.WARNING]: 'Errors and warnings',
          [DEBUG_LEVELS.INFO]: 'General information',
          [DEBUG_LEVELS.VERBOSE]: 'Detailed logs',
          [DEBUG_LEVELS.ALL]: 'Everything including frame updates'
        });
      }
    }
  }) as EventListener);
};

// Initialize debug system
export const initDebugSystem = () => {
  // Set default debug level if not already set
  if (window.jackalopesGame && window.jackalopesGame.debugLevel === undefined) {
    window.jackalopesGame.debugLevel = DEBUG_LEVELS.NONE; // Default to no logs
  }
  
  // Set up the global setter function
  window.__setDebugLevel = (level: number) => {
    if (!window.jackalopesGame) {
      window.jackalopesGame = {};
    }
    
    window.jackalopesGame.debugLevel = level;
    console.log(`Debug level set to ${level}.`);
    console.log(`  ${DEBUG_LEVELS.NONE}: No logs except critical errors`);
    console.log(`  ${DEBUG_LEVELS.ERROR}: Error only`); 
    console.log(`  ${DEBUG_LEVELS.WARNING}: Errors and warnings`);
    console.log(`  ${DEBUG_LEVELS.INFO}: General information (default)`);
    console.log(`  ${DEBUG_LEVELS.VERBOSE}: Detailed logs`);
    console.log(`  ${DEBUG_LEVELS.ALL}: Everything including frame updates`);
    
    // Broadcast event to all components
    window.dispatchEvent(new CustomEvent('debugLevelChanged', {
      detail: { level }
    }));
  };
  
  // Set up debug level change listener
  setupDebugListener();
  
  return {
    setDebugLevel: (level: number) => window.__setDebugLevel?.(level)
  };
}; 