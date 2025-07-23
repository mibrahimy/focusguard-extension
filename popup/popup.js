let activeSession = null;
let timerInterval = null;
let isVisible = true;

async function updatePopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('FocusGuard Popup: No active tab found');
      showErrorState();
      return;
    }
    
    console.log('FocusGuard Popup: Active tab:', tab.url);
    
    // Add timeout to prevent hanging
    const messageTimeout = setTimeout(() => {
      console.error('FocusGuard Popup: Message timeout - background script may not be responding');
      showErrorState();
    }, 5000);
    
    chrome.runtime.sendMessage({ action: 'getActiveSession', tabId: tab.id }, (session) => {
      clearTimeout(messageTimeout);
      if (chrome.runtime.lastError) {
        console.error('FocusGuard Popup: Error getting session:', chrome.runtime.lastError);
        showErrorState();
        return;
      }
      
      // Handle the new response format
      if (typeof session === 'object' && session !== null) {
        session = session; // Response is the session object directly
      }
      
      console.log('FocusGuard Popup: Session data:', session);
      
      activeSession = session;
      
      if (session) {
        const noSessionEl = document.getElementById('no-session');
        const activeSessionEl = document.getElementById('active-session');
        const siteNameEl = document.querySelector('.site-name');
        const intentionTextEl = document.querySelector('.intention-text');
        
        if (noSessionEl && activeSessionEl && siteNameEl && intentionTextEl) {
          noSessionEl.style.display = 'none';
          activeSessionEl.style.display = 'block';
          
          siteNameEl.textContent = session.site;
          intentionTextEl.textContent = session.intention;
        } else {
          console.error('FocusGuard Popup: Required DOM elements not found');
          showErrorState();
          return;
        }
        
        updateTimer();
        if (!timerInterval && isVisible) {
          timerInterval = setInterval(updateTimer, 1000);
        }
      } else {
        const noSessionEl = document.getElementById('no-session');
        const activeSessionEl = document.getElementById('active-session');
        
        if (noSessionEl && activeSessionEl) {
          noSessionEl.style.display = 'block';
          activeSessionEl.style.display = 'none';
        }
        
        // Show site info even when no session
        showSiteInfo(tab);
        
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      }
    });
    
    updateStats();
  } catch (error) {
    console.error('FocusGuard Popup: Error updating popup:', error);
    showErrorState();
  }
}

function showErrorState() {
  const noSessionEl = document.getElementById('no-session');
  const activeSessionEl = document.getElementById('active-session');
  
  if (noSessionEl && activeSessionEl) {
    noSessionEl.style.display = 'block';
    activeSessionEl.style.display = 'none';
    
    const errorTextEl = noSessionEl.querySelector('p');
    if (errorTextEl) {
      errorTextEl.textContent = 'Unable to connect to FocusGuard. Please refresh the page.';
    }
  } else {
    // Fallback: create error display if DOM elements are missing
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #666;">
        <h3>FocusGuard Error</h3>
        <p>Unable to load popup. Please try:</p>
        <ul style="text-align: left; margin: 10px 0;">
          <li>Refresh the YouTube page</li>
          <li>Reload the extension</li>
          <li>Check browser console for errors</li>
        </ul>
      </div>
    `;
  }
}

function showSiteInfo(tab) {
  if (!tab || !tab.url) return;
  
  const url = new URL(tab.url);
  const hostname = url.hostname.replace('www.', '');
  
  const statusTextEl = document.querySelector('.status-text');
  const helpTextEl = document.querySelector('.help-text');
  
  if (statusTextEl && helpTextEl) {
    if (hostname.includes('youtube.com')) {
      statusTextEl.textContent = 'On YouTube';
      helpTextEl.textContent = 'Navigate to a video or search to set your focus intention';
    } else if (hostname.includes('whatsapp.com')) {
      statusTextEl.textContent = 'On WhatsApp';
      helpTextEl.textContent = 'Start browsing to set your focus intention';
    } else {
      statusTextEl.textContent = 'Ready to focus';
      helpTextEl.textContent = 'Navigate to YouTube or WhatsApp to set your intention';
    }
  }
}

function updateTimer() {
  if (!activeSession) return;
  
  const elapsed = Date.now() - activeSession.startTime;
  const remaining = Math.max(0, activeSession.duration - elapsed);
  
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  
  document.querySelector('.time-remaining').textContent = 
    `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function updateStats() {
  const data = await chrome.storage.local.get(['totalTimeSpent', 'sessions']);
  const timeSpent = data.totalTimeSpent || {};
  const sessions = data.sessions || [];
  
  const youtubeMinutes = Math.floor((timeSpent.YouTube || 0) / 60000);
  const whatsappMinutes = Math.floor((timeSpent.WhatsApp || 0) / 60000);
  
  document.getElementById('youtube-time').textContent = `${youtubeMinutes} min`;
  document.getElementById('whatsapp-time').textContent = `${whatsappMinutes} min`;
  
  const todaySessions = sessions.filter(s => {
    const sessionDate = new Date(s.timestamp);
    const today = new Date();
    return sessionDate.toDateString() === today.toDateString();
  });
  
  const focusScore = calculateFocusScore(todaySessions);
  document.getElementById('focus-score').textContent = `${focusScore}%`;
}

function calculateFocusScore(sessions) {
  if (sessions.length === 0) return 100;
  
  let matchingSearches = 0;
  sessions.forEach(session => {
    if (session.actualSearch && session.intention) {
      const intentionWords = session.intention.toLowerCase().split(' ');
      const searchWords = session.actualSearch.toLowerCase().split(' ');
      
      const hasMatch = intentionWords.some(word => 
        searchWords.some(searchWord => searchWord.includes(word))
      );
      
      if (hasMatch) matchingSearches++;
    }
  });
  
  return Math.round((matchingSearches / sessions.length) * 100);
}

document.getElementById('end-session-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.remove(tab.id);
  window.close();
});

document.getElementById('dashboard-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('settings-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('test-youtube').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://youtube.com' });
  window.close();
});

document.getElementById('test-whatsapp').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  window.close();
});

// Proper cleanup and visibility handling
function cleanup() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Handle popup visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    isVisible = false;
    cleanup();
  } else {
    isVisible = true;
    updatePopup();
  }
});

// Clean up when popup closes
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

// Enhanced initialization with multiple fallbacks
function initializePopup() {
  console.log('FocusGuard Popup: Initializing...');
  
  // Check if required DOM elements exist
  const requiredElements = ['no-session', 'active-session'];
  const missingElements = requiredElements.filter(id => !document.getElementById(id));
  
  if (missingElements.length > 0) {
    console.error('FocusGuard Popup: Missing DOM elements:', missingElements);
    showErrorState();
    return;
  }
  
  // Check if we can access chrome APIs
  if (!chrome || !chrome.tabs || !chrome.runtime) {
    console.error('FocusGuard Popup: Chrome APIs not available');
    showErrorState();
    return;
  }
  
  updatePopup();
}

// Try multiple initialization methods
document.addEventListener('DOMContentLoaded', initializePopup);

// Fallback if DOMContentLoaded already fired
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  // DOM is already ready
  setTimeout(initializePopup, 10);
}

// Throttled refresh - only when visible and less frequent
let refreshTimeout;
function scheduleRefresh() {
  if (refreshTimeout) clearTimeout(refreshTimeout);
  
  refreshTimeout = setTimeout(() => {
    if (isVisible && !document.hidden) {
      updatePopup();
      scheduleRefresh(); // Schedule next refresh
    }
  }, 3000); // Reduced frequency to 3 seconds
}

scheduleRefresh();