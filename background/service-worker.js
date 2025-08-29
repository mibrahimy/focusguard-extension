// FOCUSGUARD SERVICE WORKER - COORDINATOR ONLY
// This service worker manages state and coordinates with content scripts
// It does NOT inject DOM elements directly

const MONITORED_SITES = {
  'youtube.com': 'YouTube',
  'whatsapp.com': 'WhatsApp',
  'web.whatsapp.com': 'WhatsApp'
};

// State management - persisted in chrome.storage
let activeSessions = {};
let sessionState = {
  initialized: false,
  lastUpdate: Date.now()
};

// Performance monitoring
let performanceMetrics = {
  messageCount: 0,
  storageOperations: 0,
  errors: 0,
  lastReset: Date.now()
};

// Initialize service worker state
async function initializeServiceWorker() {
  try {
    console.log('FocusGuard: Initializing service worker');
    
    // Restore state from storage
    const result = await retryStorageOperation(() => 
      new Promise((resolve, reject) => {
        chrome.storage.local.get(['activeSessions', 'sessionState'], (data) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(data);
          }
        });
      })
    );
    
    if (result.activeSessions) {
      activeSessions = result.activeSessions;
    }
    if (result.sessionState) {
      sessionState = { ...sessionState, ...result.sessionState };
    }
    
    sessionState.initialized = true;
    sessionState.lastUpdate = Date.now();
    
    // Clean up expired sessions
    await cleanupExpiredSessions();
    
    console.log('FocusGuard: Service worker initialized', { 
      activeSessions: Object.keys(activeSessions).length 
    });
    
  } catch (error) {
    console.error('FocusGuard: Failed to initialize service worker:', error);
  }
}

// Clean up sessions that have expired
async function cleanupExpiredSessions() {
  const now = Date.now();
  const validSessions = {};
  
  for (const [tabId, session] of Object.entries(activeSessions)) {
    if (session && session.startTime && session.duration) {
      const elapsed = now - session.startTime;
      if (elapsed < session.duration) {
        validSessions[tabId] = session;
        
        // Recreate alarm if needed
        const remainingMinutes = Math.ceil((session.duration - elapsed) / 60000);
        if (remainingMinutes > 0) {
          try {
            await chrome.alarms.create(`session-${tabId}`, {
              delayInMinutes: remainingMinutes
            });
          } catch (error) {
            console.warn('FocusGuard: Failed to recreate alarm for tab', tabId);
          }
        }
      } else {
        console.log('FocusGuard: Cleaned up expired session for tab', tabId);
      }
    }
  }
  
  activeSessions = validSessions;
  await saveState();
}

// Save state to storage
async function saveState() {
  try {
    await retryStorageOperation(() => 
      new Promise((resolve, reject) => {
        chrome.storage.local.set({ 
          activeSessions, 
          sessionState: { ...sessionState, lastUpdate: Date.now() }
        }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      })
    );
  } catch (error) {
    console.error('FocusGuard: Failed to save state:', error);
  }
}

// Enhanced storage recovery with retry mechanism
async function retryStorageOperation(operation, maxRetries = 3, delay = 100) {
  performanceMetrics.storageOperations++;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`FocusGuard: Storage operation failed, attempt ${attempt}/${maxRetries}:`, error.message);
      
      if (attempt === maxRetries) {
        performanceMetrics.errors++;
        throw error;
      }
      
      // Exponential backoff delay
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
}

// Enhanced input sanitization function
function sanitizeInput(input, maxLength = 500) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'&]/g, (match) => {
      const escapeMap = { 
        '<': '&lt;', 
        '>': '&gt;', 
        '"': '&quot;', 
        "'": '&#x27;', 
        '&': '&amp;' 
      };
      return escapeMap[match];
    })
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Performance monitoring
function logPerformanceMetrics() {
  const now = Date.now();
  const elapsed = now - performanceMetrics.lastReset;
  
  if (elapsed > 300000) { // 5 minutes
    console.log('FocusGuard Performance:', {
      messagesPerMinute: (performanceMetrics.messageCount / (elapsed / 60000)).toFixed(2),
      storageOpsPerMinute: (performanceMetrics.storageOperations / (elapsed / 60000)).toFixed(2),
      errorRate: (performanceMetrics.errors / performanceMetrics.messageCount * 100).toFixed(2) + '%',
      activeSessionsCount: Object.keys(activeSessions).length
    });
    
    // Reset metrics
    performanceMetrics = {
      messageCount: 0,
      storageOperations: 0,
      errors: 0,
      lastReset: now
    };
  }
}

// Check if intention is needed for a site
function checkIntentionRequired(siteName, tabId) {
  return new Promise((resolve) => {
    // Check if there's already an active session for this tab
    if (activeSessions[tabId] && activeSessions[tabId].site === siteName) {
      resolve(false);
      return;
    }
    
    // Check recent intentions
    chrome.storage.local.get(['intention'], (data) => {
      const intentions = data.intention || {};
      const recent = intentions[siteName] && 
                    (Date.now() - intentions[siteName].timestamp < 300000); // 5 minutes
      
      resolve(!recent);
    });
  });
}

// EVENT LISTENERS

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    sessions: [],
    totalTimeSpent: {},
    distractionCount: 0,
    activeSessions: {},
    intentionTemplates: {
      YouTube: [
        'Learn React hooks for my project',
        'Watch Python tutorial series',
        'Research new design trends',
        'Follow coding best practices guide',
        'Watch conference talk on AI',
        'Learn new JavaScript framework'
      ],
      WhatsApp: [
        'Check important family messages',
        'Coordinate team meeting for Friday',
        'Share project document with Sarah',
        'Reply to client about deliverables',
        'Plan weekend social activity',
        'Follow up on pending conversation'
      ]
    },
    performanceMetrics: {
      installTime: Date.now(),
      version: chrome.runtime.getManifest().version
    }
  });
  console.log('FocusGuard: Extension installed/updated with templates');
});

chrome.runtime.onStartup.addListener(initializeServiceWorker);

// Web navigation - coordinate with content scripts instead of injecting
chrome.webNavigation.onCommitted.addListener(async (details) => {
  console.log('FocusGuard: Navigation committed', details.url);
  
  if (details.frameId !== 0) return;
  
  // Skip restricted URLs
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'moz-extension:', 'about:', 'data:', 'javascript:', 'file:'];
  const isRestricted = restrictedProtocols.some(protocol => details.url.startsWith(protocol));
  
  if (isRestricted) {
    console.log('FocusGuard: Skipping restricted URL:', details.url);
    return;
  }
  
  let url;
  try {
    url = new URL(details.url);
  } catch (error) {
    console.log('FocusGuard: Invalid URL, skipping:', details.url);
    return;
  }
  
  const hostname = url.hostname.replace('www.', '');
  
  for (const [site, siteName] of Object.entries(MONITORED_SITES)) {
    if (hostname.includes(site)) {
      const tabId = details.tabId;
      const needsIntention = await checkIntentionRequired(siteName, tabId);
      
      if (needsIntention) {
        console.log('FocusGuard: Will request intention from content script for', siteName);
        
        // Store the navigation details for the content script using local storage as fallback
        try {
          // Try session storage first
          if (chrome.storage.session) {
            await chrome.storage.session.set({ 
              [`navigation_${tabId}`]: { 
                url: details.url, 
                site: siteName,
                timestamp: Date.now(),
                requiresIntention: true
              } 
            });
          } else {
            // Fallback to local storage
            await chrome.storage.local.set({ 
              [`navigation_${tabId}`]: { 
                url: details.url, 
                site: siteName,
                timestamp: Date.now(),
                requiresIntention: true
              } 
            });
          }
        } catch (error) {
          console.error('FocusGuard: Failed to store navigation data:', error);
        }
      }
      break;
    }
  }
}, {
  url: [
    { hostContains: 'youtube.com' },
    { hostContains: 'whatsapp.com' }
  ]
});

// Message handling - coordinate with content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  performanceMetrics.messageCount++;
  logPerformanceMetrics();
  
  console.log('FocusGuard: Received message:', request.action);
  
  if (request.action === 'ping') {
    // Simple ping response for connection check
    sendResponse({ pong: true });
    
  } else if (request.action === 'checkIntentionNeeded') {
    // Content script asks if intention is needed
    const { site, tabId } = request;
    checkIntentionRequired(site, tabId || sender.tab?.id).then(needed => {
      sendResponse({ needsIntention: needed, site });
    });
    return true;
    
  } else if (request.action === 'setIntention') {
    (async () => {
      const tabId = sender.tab.id;
      const { site, intention, duration } = request;
      
      // Comprehensive input validation and sanitization
      if (!site || typeof site !== 'string' || site.length > 100) {
        console.error('FocusGuard: Invalid site parameter');
        sendResponse({ success: false, error: 'Invalid site' });
        return;
      }
      
      if (!intention || typeof intention !== 'string' || intention.length > 500) {
        console.error('FocusGuard: Invalid intention parameter');
        sendResponse({ success: false, error: 'Invalid intention' });
        return;
      }
      
      if (!duration || typeof duration !== 'number' || duration < 1 || duration > 480) {
        console.error('FocusGuard: Invalid duration parameter');
        sendResponse({ success: false, error: 'Invalid duration' });
        return;
      }
      
      // Sanitize inputs to prevent XSS and injection attacks
      const sanitizedSite = sanitizeInput(site, 100);
      const sanitizedIntention = sanitizeInput(intention, 500);
      
      if (!sanitizedSite || !sanitizedIntention) {
        console.error('FocusGuard: Sanitization failed');
        sendResponse({ success: false, error: 'Invalid input content' });
        return;
      }
      
      console.log('FocusGuard: Setting intention for', sanitizedSite, ':', sanitizedIntention, 'Duration:', duration);
      
      // Create session object with sanitized and validated data
      const sessionData = {
        site: sanitizedSite,
        intention: sanitizedIntention,
        duration: Math.floor(duration) * 60 * 1000, // Ensure integer milliseconds
        startTime: Date.now(),
        tabId: tabId,
        version: 1 // Schema version for future migrations
      };
      
      // Also save to sessions array for dashboard
      chrome.storage.local.get(['sessions'], (data) => {
        const sessions = data.sessions || [];
        sessions.push({
          timestamp: Date.now(),
          site: sanitizedSite,
          intention: sanitizedIntention,
          duration: Math.floor(duration) * 60 * 1000
        });
        
        // Keep only last 1000 sessions
        if (sessions.length > 1000) {
          sessions.splice(0, sessions.length - 1000);
        }
        
        chrome.storage.local.set({ sessions });
      });
      
      // Atomic storage transaction with rollback capability
      const originalActiveSessions = { ...activeSessions };
      activeSessions[tabId] = sessionData;
      
      try {
        await saveState();
        
        // Store intention separately
        const data = await retryStorageOperation(() => 
          new Promise((resolve, reject) => {
            chrome.storage.local.get(['intention'], (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          })
        );
        
        const intentions = data.intention || {};
        intentions[sanitizedSite] = {
          text: sanitizedIntention,
          timestamp: Date.now()
        };
        
        await retryStorageOperation(() => 
          new Promise((resolve, reject) => {
            chrome.storage.local.set({ intention: intentions }, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve();
              }
            });
          })
        );
        
        // Create alarm for session end
        if (duration > 0) {
          await chrome.alarms.create(`session-${tabId}`, {
            delayInMinutes: duration
          });
          console.log('FocusGuard: Created alarm for', duration, 'minutes');
        }
        
        sendResponse({ success: true });
        
      } catch (error) {
        console.error('FocusGuard: Failed to save session after retries:', error);
        // Atomic rollback on storage failure
        activeSessions = originalActiveSessions;
        sendResponse({ success: false, error: 'Storage transaction failed after retries' });
      }
    })().catch(error => {
      console.error('FocusGuard: Error in setIntention handler:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
    
  } else if (request.action === 'getActiveSession') {
    const tabId = request.tabId || sender.tab?.id;
    const session = activeSessions[tabId];
    sendResponse(session || null);
    
  } else if (request.action === 'getIntentionTemplates') {
    chrome.storage.local.get(['intentionTemplates'], (data) => {
      const templates = data.intentionTemplates || {};
      sendResponse({ templates: templates[request.site] || [] });
    });
    return true;
    
  } else if (request.action === 'trackActivity') {
    const { site, activityType, activityData } = request;
    
    // Sanitize activity tracking inputs
    const sanitizedSite = sanitizeInput(site, 100);
    const sanitizedActivityType = sanitizeInput(activityType, 50);
    const sanitizedActivityData = sanitizeInput(activityData, 300);
    
    if (!sanitizedSite || !sanitizedActivityType) {
      console.warn('FocusGuard: Invalid activity tracking data, ignoring');
      sendResponse({ success: false });
      return;
    }
    
    chrome.storage.local.get(['activityLog'], (data) => {
      const activities = data.activityLog || [];
      
      activities.push({
        timestamp: Date.now(),
        site: sanitizedSite,
        activityType: sanitizedActivityType,
        activityData: sanitizedActivityData,
        tabId: sender.tab?.id
      });
      
      // Keep only last 500 activities to avoid storage bloat
      if (activities.length > 500) {
        activities.splice(0, activities.length - 500);
      }
      
      chrome.storage.local.set({ activityLog: activities });
    });
    
    sendResponse({ success: true });
  } else if (request.action === 'trackSessionReflection') {
    const { outcome } = request;
    
    chrome.storage.local.get(['sessionReflections'], (data) => {
      const reflections = data.sessionReflections || [];
      
      reflections.push({
        timestamp: Date.now(),
        outcome: outcome,
        tabId: sender.tab?.id
      });
      
      // Keep only last 1000 reflections
      if (reflections.length > 1000) {
        reflections.splice(0, reflections.length - 1000);
      }
      
      chrome.storage.local.set({ sessionReflections: reflections });
    });
    
    sendResponse({ success: true });
  }
  
  return true;
});

// Alarm handling for session timeouts
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('session-')) {
    const tabId = parseInt(alarm.name.split('-')[1]);
    
    if (isNaN(tabId) || tabId <= 0) {
      console.warn('FocusGuard: Invalid tabId from alarm:', alarm.name);
      return;
    }
    
    // Notify content script that time is up
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'timeUp' });
    } catch (error) {
      console.log('FocusGuard: Could not send timeUp message to tab:', tabId);
      // Clean up alarm for non-existent tab
      chrome.alarms.clear(alarm.name);
    }
    
    // Clean up session
    if (activeSessions[tabId]) {
      delete activeSessions[tabId];
      await saveState();
    }
  }
});

// Tab cleanup
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (activeSessions[tabId]) {
    const session = activeSessions[tabId];
    const duration = Date.now() - session.startTime;
    
    // Track total time spent
    chrome.storage.local.get(['totalTimeSpent'], (data) => {
      const timeSpent = data.totalTimeSpent || {};
      timeSpent[session.site] = (timeSpent[session.site] || 0) + duration;
      chrome.storage.local.set({ totalTimeSpent: timeSpent });
    });
    
    delete activeSessions[tabId];
    chrome.alarms.clear(`session-${tabId}`);
    
    await saveState();
  }
});

// Initialize on startup
initializeServiceWorker();