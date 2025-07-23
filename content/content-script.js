let intentionOverlay = null;

function createIntentionOverlay(site) {
  const overlay = document.createElement('div');
  overlay.className = 'focusguard-overlay';
  overlay.innerHTML = `
    <div class="focusguard-backdrop"></div>
    <div class="focusguard-modal">
      <div class="modal-header">
        <div class="site-icon">${site === 'YouTube' ? '🎥' : '💬'}</div>
        <h2>What brings you to ${site}?</h2>
        <p class="subtitle">Set your intention to maintain focus</p>
      </div>
      
      <div class="modal-content">
        <div class="input-field">
          <textarea 
            id="intention-input" 
            placeholder="Describe your specific goal here..."
            rows="3"
          ></textarea>
          <label class="floating-label">Your intention</label>
        </div>
        
        <div class="time-selector">
          <label class="field-label">Session duration</label>
          <div class="duration-chips">
            <button class="duration-chip" data-duration="5">5 min</button>
            <button class="duration-chip active" data-duration="15">15 min</button>
            <button class="duration-chip" data-duration="30">30 min</button>
            <button class="duration-chip" data-duration="60">1 hour</button>
          </div>
          <div class="custom-duration">
            <input type="number" id="duration-input" min="1" max="120" value="15" class="duration-input">
            <span class="duration-label">minutes</span>
          </div>
        </div>
      </div>
      
      <div class="modal-actions">
        <button id="skip-btn" class="btn-text">Skip for now</button>
        <button id="set-intention-btn" class="btn-primary">
          <span class="btn-text">Begin focused session</span>
          <div class="btn-ripple"></div>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add ripple effect to primary button
  addRippleEffect(overlay.querySelector('#set-intention-btn'));
  
  // Duration chip selection
  overlay.querySelectorAll('.duration-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      document.getElementById('duration-input').value = chip.dataset.duration;
    });
  });
  
  // Custom duration input
  document.getElementById('duration-input').addEventListener('input', () => {
    overlay.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
  });
  
  document.getElementById('set-intention-btn').addEventListener('click', () => {
    const intention = document.getElementById('intention-input').value.trim();
    const duration = parseInt(document.getElementById('duration-input').value) || 15;
    
    if (intention) {
      // Add loading state
      const btn = document.getElementById('set-intention-btn');
      btn.classList.add('loading');
      btn.innerHTML = '<span class="spinner"></span><span class="btn-text">Starting session...</span>';
      
      chrome.runtime.sendMessage({
        action: 'setIntention',
        site,
        intention,
        duration
      }, () => {
        // The page will redirect automatically
      });
    } else {
      // Show validation error
      const input = document.getElementById('intention-input');
      input.classList.add('error');
      input.focus();
      setTimeout(() => input.classList.remove('error'), 3000);
    }
  });
  
  document.getElementById('skip-btn').addEventListener('click', () => {
    // Get the original URL from window variables
    const tabId = window.focusGuardTabId;
    if (tabId) {
      chrome.storage.session.get([`pending_${tabId}`], (data) => {
        const pending = data[`pending_${tabId}`];
        if (pending) {
          window.location.href = pending.url;
        }
      });
    }
  });
  
  // Auto-focus and animate in
  setTimeout(() => {
    overlay.classList.add('active');
    document.getElementById('intention-input').focus();
  }, 100);
  
  return overlay;
}

function addRippleEffect(button) {
  button.addEventListener('click', function(e) {
    const ripple = this.querySelector('.btn-ripple');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('animate');
    
    setTimeout(() => {
      ripple.classList.remove('animate');
    }, 600);
  });
}

function removeOverlay() {
  if (intentionOverlay) {
    intentionOverlay.remove();
    intentionOverlay = null;
  }
}

function showFocusTimer(duration) {
  const timer = document.createElement('div');
  timer.className = 'focusguard-timer';
  timer.innerHTML = `
    <div class="timer-content">
      <span class="timer-icon">⏱️</span>
      <span class="timer-text">${duration}:00</span>
    </div>
  `;
  
  document.body.appendChild(timer);
  
  let timeLeft = duration * 60;
  const interval = setInterval(() => {
    timeLeft--;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timer.querySelector('.timer-text').textContent = 
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (timeLeft <= 0) {
      clearInterval(interval);
      timer.remove();
      showTimeUpNotification();
    }
  }, 1000);
}

function showTimeUpNotification() {
  const notification = document.createElement('div');
  notification.className = 'focusguard-notification';
  notification.innerHTML = `
    <div class="notification-content">
      <h3>Time's up!</h3>
      <p>Your focused session has ended. Did you accomplish your goal?</p>
      <button id="extend-btn">Extend 5 minutes</button>
      <button id="end-session-btn">End session</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  document.getElementById('extend-btn').addEventListener('click', () => {
    notification.remove();
    showFocusTimer(5);
  });
  
  document.getElementById('end-session-btn').addEventListener('click', () => {
    notification.remove();
  });
}

function trackSearchQuery() {
  const site = window.location.hostname.includes('youtube') ? 'YouTube' : 'WhatsApp';
  
  if (site === 'YouTube') {
    const searchBox = document.querySelector('input#search');
    if (searchBox) {
      searchBox.addEventListener('change', (e) => {
        chrome.runtime.sendMessage({
          action: 'trackSearch',
          site: 'YouTube',
          searchQuery: e.target.value
        });
      });
    }
  }
}

// Initialize on data URL pages
if (window.focusGuardSite && window.focusGuardTabId) {
  document.addEventListener('DOMContentLoaded', () => {
    if (!intentionOverlay) {
      intentionOverlay = createIntentionOverlay(window.focusGuardSite);
    }
  });
} else {
  // Regular page functionality
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showIntentionPrompt') {
      if (!intentionOverlay) {
        intentionOverlay = createIntentionOverlay(request.site);
      }
    } else if (request.action === 'timeUp') {
      showTimeUpNotification();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    trackSearchQuery();
    
    const observer = new MutationObserver(() => {
      trackSearchQuery();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}