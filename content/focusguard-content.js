// FOCUSGUARD CONTENT SCRIPT - UI LAYER ONLY
// This content script handles DOM manipulation and coordinates with service worker
// It does NOT manage state - that's handled by the service worker

console.log('FocusGuard: Content script loaded');

// IMMEDIATELY clear any residual blur on script load
(function() {
  if (document.documentElement) {
    document.documentElement.style.filter = '';
    document.documentElement.style.transition = '';
    document.documentElement.style.overflow = '';
  }
})();

const MONITORED_SITES = {
  'youtube.com': 'YouTube',
  'whatsapp.com': 'WhatsApp',
  'web.whatsapp.com': 'WhatsApp'
};

// State
let currentOverlay = null;
let currentTimer = null;
let isInitialized = false;

// Get current site name
function getCurrentSite() {
  const hostname = window.location.hostname.replace('www.', '');
  for (const [site, siteName] of Object.entries(MONITORED_SITES)) {
    if (hostname.includes(site)) {
      return siteName;
    }
  }
  return null;
}

// Enhanced input sanitization
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

// Show intention overlay with enhanced UX
function showIntentionOverlay(siteName) {
  // Remove any existing overlay
  removeIntentionOverlay();
  
  // Wait for DOM to be ready
  if (!document.body) {
    setTimeout(() => showIntentionOverlay(siteName), 100);
    return;
  }
  
  // Prepare for overlay (blur will be applied when overlay is shown)
  if (document.documentElement) {
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.transition = 'filter 0.3s ease';
  }
  
  const sanitizedSiteName = sanitizeInput(siteName, 50);
  
  const overlay = document.createElement('div');
  overlay.className = 'focusguard-overlay';
  overlay.innerHTML = `
    <div class="focusguard-backdrop" aria-hidden="true"></div>
    <div class="focusguard-modal" role="dialog" aria-modal="true" aria-labelledby="focus-title" aria-describedby="focus-subtitle">
      <div class="modal-header">
        <div class="site-icon" aria-hidden="true">${siteName === 'YouTube' ? '🎥' : '💬'}</div>
        <h2 id="focus-title">Take a mindful moment...</h2>
        <p id="focus-subtitle" class="subtitle">You're about to visit ${sanitizedSiteName}. Let's set a clear intention first.</p>
        <div class="context-hint">
          <span class="hint-icon">💭</span>
          <span class="hint-text">This helps you stay focused and avoid mindless browsing</span>
        </div>
        <div class="mindfulness-tip">
          <span class="tip-icon">💡</span>
          <span class="tip-text">Being intentional helps you stay focused and avoid mindless browsing</span>
        </div>
      </div>
      
      <div class="modal-content">
        <div class="suggestions-container" id="suggestions-container" style="display: none;">
          <label class="field-label">Quick suggestions:</label>
          <div class="suggestion-chips" id="suggestion-chips"></div>
        </div>
        
        <div class="reflection-section">
          <div class="reflection-question">
            <span class="question-icon">🤔</span>
            <span class="question-text">${getReflectionQuestion(siteName)}</span>
          </div>
        </div>
        
        <div class="input-field">
          <textarea 
            id="intention-input" 
            placeholder="${getIntentionPlaceholder(siteName)}"
            rows="3"
            aria-label="Your specific intention for this session"
            aria-describedby="input-validation"
            maxlength="200"
            required
          ></textarea>
          <label class="floating-label" for="intention-input">My specific goal is...</label>
          <div class="input-validation" id="input-validation" aria-live="polite"></div>
          <div class="input-counter">
            <span class="counter-text" id="char-counter">0/200</span>
          </div>
          <div class="helpful-hints">
            <span class="hint-icon">✨</span>
            <span class="hint-text">Be specific - it helps your brain stay on track!</span>
          </div>
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
            <div class="duration-preview" id="duration-preview">Until 3:45 PM</div>
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
  currentOverlay = overlay;
  
  // Setup event listeners
  setupOverlayEventListeners(overlay, siteName);
  
  // Load suggestions with staggered animation
  setTimeout(() => loadIntentionSuggestions(siteName), 300);
  
  // Show with animation and apply blur
  setTimeout(() => {
    overlay.classList.add('active');
    // Apply blur only when overlay is successfully shown
    if (document.documentElement) {
      document.documentElement.style.filter = 'blur(2px)';
    }
    const input = document.getElementById('intention-input');
    if (input) input.focus();
  }, 100);
  
  // Failsafe: Clear blur after 10 seconds if overlay is still present but something went wrong
  setTimeout(() => {
    if (currentOverlay && document.documentElement && document.documentElement.style.filter.includes('blur')) {
      console.warn('FocusGuard: Failsafe clearing stuck blur');
      clearPageBlur();
    }
  }, 10000);
}

// Setup event listeners for overlay
function setupOverlayEventListeners(overlay, siteName) {
  // Focus trap
  const focusableElements = overlay.querySelectorAll(
    'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  
  const trapFocus = (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    }
  };
  
  overlay.addEventListener('keydown', trapFocus);
  
  // Duration chips
  overlay.querySelectorAll('.duration-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      try {
        overlay.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const durationInput = document.getElementById('duration-input');
        if (durationInput) {
          durationInput.value = chip.dataset.duration;
        }
      } catch (error) {
        console.error('FocusGuard: Error handling duration chip:', error);
      }
    });
  });
  
  // Enhanced duration input with time preview
  const durationInput = document.getElementById('duration-input');
  const durationPreview = document.getElementById('duration-preview');
  
  if (durationInput) {
    const updateDurationPreview = () => {
      const minutes = parseInt(durationInput.value) || 15;
      const endTime = new Date(Date.now() + minutes * 60000);
      const timeString = endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (durationPreview) {
        durationPreview.textContent = `Until ${timeString}`;
      }
    };
    
    durationInput.addEventListener('input', () => {
      overlay.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
      updateDurationPreview();
    });
    
    // Initialize preview
    updateDurationPreview();
  }
  
  // Enhanced intention input with debounced validation
  const intentionInput = document.getElementById('intention-input');
  const validationDiv = document.getElementById('input-validation');
  const charCounter = document.getElementById('char-counter');
  
  if (intentionInput && validationDiv) {
    // Real-time character counter
    intentionInput.addEventListener('input', () => {
      const length = intentionInput.value.length;
      charCounter.textContent = `${length}/200`;
      
      // Color coding for character count
      if (length > 180) {
        charCounter.style.color = 'var(--md-sys-color-error)';
      } else if (length > 150) {
        charCounter.style.color = 'var(--mindful-orange)';
      } else {
        charCounter.style.color = 'var(--md-sys-color-on-surface-variant)';
      }
    });
    
    // Debounced validation
    let validationTimeout;
    intentionInput.addEventListener('input', () => {
      clearTimeout(validationTimeout);
      validationTimeout = setTimeout(() => {
        try {
          validateIntention(intentionInput.value, validationDiv);
        } catch (error) {
          console.error('FocusGuard: Error validating intention:', error);
        }
      }, 300);
    });
    
    // Enhanced focus states
    intentionInput.addEventListener('focus', () => {
      intentionInput.parentElement.classList.add('focused');
    });
    
    intentionInput.addEventListener('blur', () => {
      intentionInput.parentElement.classList.remove('focused');
    });
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const skipBtn = document.getElementById('skip-btn');
      if (skipBtn) skipBtn.click();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      const textarea = document.getElementById('intention-input');
      if (document.activeElement === textarea && textarea.value.trim()) {
        e.preventDefault();
        const setBtn = document.getElementById('set-intention-btn');
        if (setBtn) setBtn.click();
      }
    }
  });
  
  // Set intention button
  const setBtn = document.getElementById('set-intention-btn');
  if (setBtn) {
    setBtn.addEventListener('click', () => handleSetIntention(siteName));
  }
  
  // Skip button
  const skipBtn = document.getElementById('skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => handleSkip());
  }
  
  // Add ripple effect
  addRippleEffect(setBtn);
}

// Handle setting intention
function handleSetIntention(siteName) {
  try {
    const intentionInput = document.getElementById('intention-input');
    const durationInput = document.getElementById('duration-input');
    const btn = document.getElementById('set-intention-btn');
    
    if (!intentionInput || !durationInput || !btn) {
      console.error('FocusGuard: Required elements not found');
      return;
    }
    
    const rawIntention = intentionInput.value.trim();
    const duration = parseInt(durationInput.value) || 15;
    
    // Validate and sanitize
    const sanitizedIntention = sanitizeInput(rawIntention, 500);
    
    if (!sanitizedIntention || sanitizedIntention.length < 3) {
      intentionInput.classList.add('error');
      intentionInput.focus();
      setTimeout(() => intentionInput.classList.remove('error'), 3000);
      return;
    }
    
    // Show loading state
    btn.classList.add('loading');
    btn.innerHTML = '<span class="spinner"></span><span class="btn-text">Starting session...</span>';
    
    // Send to service worker
    chrome.runtime.sendMessage({
      action: 'setIntention',
      site: siteName,
      intention: sanitizedIntention,
      duration
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('FocusGuard: Error setting intention:', chrome.runtime.lastError);
        btn.classList.remove('loading');
        btn.innerHTML = '<span class="btn-text">Error - Try again</span>';
        btn.style.background = 'var(--md-sys-color-error)';
        setTimeout(() => {
          btn.innerHTML = '<span class="btn-text">Begin focused session</span><div class="btn-ripple"></div>';
          btn.style.background = '';
        }, 3000);
        return;
      }
      
      if (response && response.success) {
        console.log('FocusGuard: Intention set successfully');
        removeIntentionOverlay();
        showFocusTimer(duration, sanitizedIntention);
      } else {
        console.error('FocusGuard: Failed to set intention:', response?.error);
      }
    });
    
  } catch (error) {
    console.error('FocusGuard: Error in handleSetIntention:', error);
  }
}

// Handle skip
function handleSkip() {
  console.log('FocusGuard: User skipped intention setting');
  removeIntentionOverlay();
}

// Remove intention overlay
function removeIntentionOverlay() {
  if (currentOverlay) {
    // Clear blur immediately, not after animation
    if (document.documentElement) {
      document.documentElement.style.overflow = '';
      document.documentElement.style.filter = '';
      document.documentElement.style.transition = '';
    }
    
    currentOverlay.classList.remove('active');
    setTimeout(() => {
      if (currentOverlay && currentOverlay.parentNode) {
        currentOverlay.remove();
        currentOverlay = null;
      }
    }, 300);
  }
}

// Show focus timer with intention
function showFocusTimer(duration, intention = null) {
  try {
    // Remove existing timer
    if (currentTimer) {
      currentTimer.remove();
      currentTimer = null;
    }
    
    if (!document.body) return;
    
    // Get intention from service worker if not provided
    if (!intention) {
      chrome.runtime.sendMessage({ action: 'getActiveSession' }, (session) => {
        if (session && session.intention) {
          showFocusTimer(duration, session.intention);
        } else {
          showFocusTimer(duration, 'Focus Session');
        }
      });
      return;
    }
    
    // Sanitize and truncate intention for display
    const sanitizedIntention = sanitizeInput(intention, 100);
    const displayIntention = sanitizedIntention.length > 40 
      ? sanitizedIntention.substring(0, 37) + '...' 
      : sanitizedIntention;
    
    const timer = document.createElement('div');
    timer.className = 'focusguard-timer';
    timer.innerHTML = `
      <div class="timer-content">
        <div class="timer-header">
          <span class="timer-icon">⏱️</span>
          <span class="timer-text">${duration}:00</span>
          <div class="timer-controls">
            <button class="timer-pause" title="Pause timer" aria-label="Pause timer">⏸️</button>
            <button class="timer-minimize" title="Minimize timer" aria-label="Minimize timer">−</button>
          </div>
        </div>
        <div class="timer-intention" title="${sanitizedIntention}">
          <span class="intention-icon">🎯</span>
          <span class="intention-text">${displayIntention}</span>
        </div>
        <div class="timer-progress">
          <div class="progress-fill"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(timer);
    currentTimer = timer;
    
    // Setup enhanced timer functionality
    setupTimerFunctionality(timer, duration, sanitizedIntention);
    
    // Add click-to-expand functionality
    timer.addEventListener('click', (e) => {
      if (!e.target.matches('button')) {
        timer.classList.toggle('minimized');
        const minimizeBtn = timer.querySelector('.timer-minimize');
        if (minimizeBtn) {
          minimizeBtn.textContent = timer.classList.contains('minimized') ? '+' : '−';
          minimizeBtn.title = timer.classList.contains('minimized') ? 'Expand timer' : 'Minimize timer';
        }
      }
    });
    
    // Add hover effects for better feedback
    timer.addEventListener('mouseenter', () => {
      if (!timer.classList.contains('minimized')) {
        timer.style.transform = 'scale(1.02)';
      }
    });
    
    timer.addEventListener('mouseleave', () => {
      timer.style.transform = 'scale(1)';
    });
    
  } catch (error) {
    console.error('FocusGuard: Error showing timer:', error);
  }
}

// Setup enhanced timer functionality with mindfulness features
function setupTimerFunctionality(timer, duration, intention) {
  let timeLeft = duration * 60;
  const totalDuration = duration * 60;
  let reminderShown = false;
  let isPaused = false;
  let pausedTime = 0;
  
  const timerInterval = setInterval(() => {
    try {
      if (!isPaused) {
        timeLeft--;
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        
        const timerText = timer.querySelector('.timer-text');
        if (timerText) {
          timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          
          // Add breathing animation for last 2 minutes
          if (timeLeft <= 120 && timeLeft > 30) {
            timerText.style.animation = 'breathe 4s ease-in-out infinite';
          } else if (timeLeft <= 30) {
            timerText.style.animation = 'finalPulse 1s ease-in-out infinite';
          }
        }
        
        // Update progress indicator with smooth animation
        updateTimerProgress(timer, timeLeft, totalDuration);
        
        // Show mindful reminder at halfway point
        if (!reminderShown && timeLeft <= totalDuration / 2 && timeLeft > totalDuration / 2 - 5) {
          showMindfulReminder(timer, intention);
          reminderShown = true;
        }
        
        // Add warning state when less than 2 minutes
        if (timeLeft <= 120) {
          timer.classList.add('warning');
          
          // Gentle pulsing for last 30 seconds
          if (timeLeft <= 30) {
            timer.classList.add('final-countdown');
          }
        }
        
        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          timer.remove();
          if (currentTimer === timer) {
            currentTimer = null;
          }
          showTimeUpNotification();
        }
      }
    } catch (error) {
      console.error('FocusGuard: Error updating timer:', error);
      clearInterval(timerInterval);
    }
  }, 1000);
  
  // Enhanced control buttons
  const minimizeBtn = timer.querySelector('.timer-minimize');
  const pauseBtn = timer.querySelector('.timer-pause');
  
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      timer.classList.toggle('minimized');
      minimizeBtn.textContent = timer.classList.contains('minimized') ? '+' : '−';
      minimizeBtn.title = timer.classList.contains('minimized') ? 'Expand timer' : 'Minimize timer';
    });
  }
  
  if (pauseBtn) {
    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isPaused = !isPaused;
      
      if (isPaused) {
        pauseBtn.textContent = '▶️';
        pauseBtn.title = 'Resume timer';
        timer.classList.add('paused');
        pausedTime = Date.now();
      } else {
        pauseBtn.textContent = '⏸️';
        pauseBtn.title = 'Pause timer';
        timer.classList.remove('paused');
        
        // Show brief resume feedback
        showBriefFeedback(timer, 'Timer resumed');
      }
    });
  }
}

// Update timer progress indicator with smooth transitions
function updateTimerProgress(timer, timeLeft, totalDuration) {
  const progress = ((totalDuration - timeLeft) / totalDuration) * 100;
  
  const progressFill = timer.querySelector('.progress-fill');
  if (progressFill) {
    // Smooth transition with requestAnimationFrame
    requestAnimationFrame(() => {
      progressFill.style.width = `${progress}%`;
      
      // Color changes based on progress
      if (progress > 75) {
        progressFill.style.background = 'var(--mindful-green)';
      } else if (progress > 50) {
        progressFill.style.background = 'var(--mindful-orange)';
      } else {
        progressFill.style.background = 'var(--md-sys-color-primary)';
      }
    });
  }
}

// Helper function for brief feedback messages
function showBriefFeedback(timer, message) {
  const feedback = document.createElement('div');
  feedback.className = 'brief-feedback';
  feedback.textContent = message;
  
  timer.appendChild(feedback);
  
  setTimeout(() => {
    feedback.style.opacity = '0';
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.remove();
      }
    }, 300);
  }, 1500);
}

// Show enhanced mindful reminder with personalization
function showMindfulReminder(timer, intention) {
  try {
    const reminder = document.createElement('div');
    reminder.className = 'mindful-reminder';
    const shortIntention = intention ? intention.substring(0, 30) + (intention.length > 30 ? '...' : '') : 'your goal';
    
    reminder.innerHTML = `
      <div class="reminder-content">
        <span class="reminder-icon">🧘‍♀️</span>
        <span class="reminder-text">Halfway there! Still working on ${shortIntention}?</span>
      </div>
    `;
    
    timer.appendChild(reminder);
    
    // Remove after 4 seconds
    setTimeout(() => {
      if (reminder.parentNode) {
        reminder.remove();
      }
    }, 4000);
    
  } catch (error) {
    console.error('FocusGuard: Error showing mindful reminder:', error);
  }
}

// Show time up notification
function showTimeUpNotification() {
  try {
    const notification = document.createElement('div');
    notification.className = 'focusguard-notification enhanced';
    // Get current session for personalized message
    chrome.runtime.sendMessage({ action: 'getActiveSession' }, (session) => {
      const intention = session?.intention || 'your goal';
      
      notification.innerHTML = `
        <div class="notification-content">
          <div class="notification-header">
            <span class="notification-icon">🎯</span>
            <h3>Time's up! Take a mindful moment...</h3>
          </div>
          
          <div class="session-summary">
            <div class="intention-reminder">
              <span class="reminder-label">Your intention was:</span>
              <span class="intention-text">"${sanitizeInput(intention, 100)}"</span>
            </div>
            
            <div class="reflection-questions">
              <p class="reflection-prompt">How did you do?</p>
              <ul class="reflection-checklist">
                <li>Did you stay focused on your goal?</li>
                <li>What did you accomplish?</li>
                <li>What would you do differently?</li>
              </ul>
            </div>
          </div>
          
          <div class="reflection-options">
            <button class="reflection-btn accomplished" data-outcome="accomplished">
              <span class="emoji">🎉</span>
              <span class="text">Mission accomplished!</span>
              <span class="subtext">Stayed focused and achieved my goal</span>
            </button>
            <button class="reflection-btn partial" data-outcome="partial">
              <span class="emoji">⚡</span>
              <span class="text">Made good progress</span>
              <span class="subtext">Got some things done, mostly focused</span>
            </button>
            <button class="reflection-btn distracted" data-outcome="distracted">
              <span class="emoji">🔄</span>
              <span class="text">Need to refocus</span>
              <span class="subtext">Got sidetracked, but that's okay!</span>
            </button>
          </div>
          
          <div class="session-actions">
            <button id="extend-btn" class="btn-secondary">
              <span class="icon">⏱️</span>
              Continue for 5 more minutes
            </button>
            <button id="end-session-btn" class="btn-primary">
              <span class="icon">✨</span>
              Complete session
            </button>
          </div>
          
          <div class="mindfulness-quote">
            <span class="quote-icon">💭</span>
            <span class="quote-text">"Every moment of awareness is a step toward intentional living."</span>
          </div>
        </div>
      `;
      
      // Add event listeners after content is set
      addNotificationEventListeners(notification);
    });
    
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
  } catch (error) {
    console.error('FocusGuard: Error showing time up notification:', error);
  }
}

// Add event listeners to notification
function addNotificationEventListeners(notification) {
  try {
    // Reflection buttons
    notification.querySelectorAll('.reflection-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const outcome = btn.dataset.outcome;
        notification.querySelectorAll('.reflection-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        // Show personalized feedback
        showReflectionFeedback(notification, outcome);
        
        // Track reflection
        chrome.runtime.sendMessage({
          action: 'trackSessionReflection',
          outcome
        });
      });
    });
    
    // Extend button
    const extendBtn = notification.querySelector('#extend-btn');
    if (extendBtn) {
      extendBtn.addEventListener('click', () => {
        notification.remove();
        showFocusTimer(5);
      });
    }
    
    // End session button
    const endBtn = notification.querySelector('#end-session-btn');
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        showAppreciationMessage(notification);
        setTimeout(() => {
          notification.remove();
        }, 2000);
      });
    }
  } catch (error) {
    console.error('FocusGuard: Error adding notification listeners:', error);
  }
}

// Show personalized feedback based on reflection
function showReflectionFeedback(notification, outcome) {
  const feedbackMessages = {
    accomplished: "🌟 Fantastic! You stayed true to your intention. This kind of mindful focus builds stronger habits over time.",
    partial: "👏 Great job making progress! Even partial focus is better than mindless browsing. What helped you stay on track?",
    distracted: "💪 Thanks for being honest! Noticing distraction is the first step to building better focus. Try again with a clearer intention."
  };
  
  const existingFeedback = notification.querySelector('.reflection-feedback');
  if (existingFeedback) {
    existingFeedback.remove();
  }
  
  const feedback = document.createElement('div');
  feedback.className = 'reflection-feedback';
  feedback.innerHTML = `
    <div class="feedback-content">
      <p>${feedbackMessages[outcome]}</p>
    </div>
  `;
  
  const reflectionOptions = notification.querySelector('.reflection-options');
  if (reflectionOptions) {
    reflectionOptions.after(feedback);
  }
}

// Show appreciation message when ending session
function showAppreciationMessage(notification) {
  const appreciation = document.createElement('div');
  appreciation.className = 'appreciation-message';
  appreciation.innerHTML = `
    <div class="appreciation-content">
      <span class="appreciation-icon">🙏</span>
      <p>Thank you for choosing mindful browsing. Every intentional moment matters!</p>
    </div>
  `;
  
  const content = notification.querySelector('.notification-content');
  if (content) {
    content.innerHTML = '';
    content.appendChild(appreciation);
  }
}

// Load intention suggestions
function loadIntentionSuggestions(siteName) {
  const suggestions = getIntentionSuggestions(siteName);
  const suggestionsContainer = document.getElementById('suggestions-container');
  const suggestionChips = document.getElementById('suggestion-chips');
  
  if (!suggestionsContainer || !suggestionChips || suggestions.length === 0) {
    return;
  }
  
  try {
    const sanitizedSuggestions = suggestions.map(suggestion => sanitizeInput(suggestion, 100));
    
    suggestionChips.innerHTML = sanitizedSuggestions.map(suggestion => 
      `<button class="suggestion-chip" data-suggestion="${suggestion}">${suggestion}</button>`
    ).join('');
    
    suggestionsContainer.style.display = 'block';
    
    // Add click handlers
    suggestionChips.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        try {
          const intentionInput = document.getElementById('intention-input');
          const validationDiv = document.getElementById('input-validation');
          
          if (intentionInput && validationDiv) {
            intentionInput.value = chip.dataset.suggestion;
            validateIntention(chip.dataset.suggestion, validationDiv);
            chip.classList.add('selected');
            setTimeout(() => {
              if (suggestionsContainer) {
                suggestionsContainer.style.display = 'none';
              }
            }, 500);
          }
        } catch (error) {
          console.error('FocusGuard: Error handling suggestion click:', error);
        }
      });
    });
  } catch (error) {
    console.error('FocusGuard: Error loading suggestions:', error);
  }
}

// Get reflection question for mindfulness
function getReflectionQuestion(siteName) {
  const questions = {
    'YouTube': "What specific knowledge or skill are you hoping to gain?",
    'WhatsApp': "Who do you need to connect with and why?"
  };
  
  return questions[siteName] || "What do you hope to accomplish here?";
}

// Get intention placeholder with better examples
function getIntentionPlaceholder(siteName) {
  const placeholders = {
    'YouTube': 'e.g., "Learn React hooks for my project", "Find 3 healthy breakfast recipes", "Watch the complete Python basics series"',
    'WhatsApp': 'e.g., "Check in with mom about her appointment", "Coordinate team meeting for Friday", "Share the project document with Sarah"'
  };
  
  return placeholders[siteName] || 'Be specific about what you want to accomplish...';
}

// Get intention suggestions
function getIntentionSuggestions(siteName) {
  const suggestions = {
    'YouTube': [
      'Learn a specific skill or topic',
      'Research for a work/school project',
      'Follow a tutorial step-by-step', 
      'Find inspiration for a hobby',
      'Listen to focus/study music',
      'Stay updated on industry news'
    ],
    'WhatsApp': [
      'Check important messages from family',
      'Coordinate upcoming work meeting',
      'Share specific document or info',
      'Plan weekend social activity',
      'Follow up on pending conversation',
      'Send quick update to team/friends'
    ]
  };
  
  return suggestions[siteName] || [];
}

// Validate intention
function validateIntention(intention, validationDiv) {
  if (!validationDiv) return;
  
  const trimmed = intention.trim();
  
  try {
    validationDiv.innerHTML = '';
    validationDiv.className = 'input-validation';
    
    if (trimmed.length === 0) return;
    
    if (trimmed.length < 5) {
      validationDiv.innerHTML = '⚠️ Try to be more specific about your goal';
      validationDiv.classList.add('warning');
    } else if (trimmed.length > 100) {
      validationDiv.innerHTML = '⚠️ Keep it concise (under 100 characters)';
      validationDiv.classList.add('warning');
    } else if (isVagueIntention(trimmed)) {
      validationDiv.innerHTML = '💡 Try to be more specific about what you want to accomplish';
      validationDiv.classList.add('suggestion');
    } else if (isProductiveIntention(trimmed)) {
      validationDiv.innerHTML = '✅ Great! This sounds like a focused goal';
      validationDiv.classList.add('success');
    } else {
      validationDiv.innerHTML = '👍 Good intention! Stay focused on your goal';
      validationDiv.classList.add('neutral');
    }
  } catch (error) {
    console.error('FocusGuard: Error validating intention:', error);
  }
}

// Check if intention is vague
function isVagueIntention(intention) {
  const vagueWords = ['browse', 'look', 'see', 'check', 'watch', 'something', 'stuff', 'things'];
  const words = intention.toLowerCase().split(/\s+/);
  const vagueCount = words.filter(word => vagueWords.includes(word)).length;
  return vagueCount / words.length > 0.5;
}

// Check if intention is productive
function isProductiveIntention(intention) {
  const productiveWords = ['learn', 'study', 'research', 'tutorial', 'course', 'work', 'project', 'create', 'build', 'solve', 'understand'];
  const words = intention.toLowerCase().split(/\s+/);
  return words.some(word => productiveWords.includes(word));
}

// Add ripple effect
function addRippleEffect(button) {
  if (!button) return;
  
  button.addEventListener('click', function(e) {
    const ripple = this.querySelector('.btn-ripple');
    if (!ripple) return;
    
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

// Ensure page is never stuck with blur
function clearPageBlur() {
  if (document.documentElement) {
    document.documentElement.style.filter = '';
    document.documentElement.style.transition = '';
    document.documentElement.style.overflow = '';
  }
}

// Initialize content script
function initializeContentScript() {
  if (isInitialized) return;
  
  // Always clear blur first, regardless of site
  clearPageBlur();
  
  const siteName = getCurrentSite();
  if (!siteName) {
    return;
  }
  
  console.log('FocusGuard: Initializing content script for', siteName);
  
  // Ask service worker if intention is needed
  chrome.runtime.sendMessage({
    action: 'checkIntentionNeeded',
    site: siteName
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('FocusGuard: Error checking intention needed:', chrome.runtime.lastError);
      clearPageBlur(); // Clear blur if there's an error
      return;
    }
    
    if (response && response.needsIntention) {
      console.log('FocusGuard: Intention needed, showing overlay');
      showIntentionOverlay(siteName);
    } else {
      console.log('FocusGuard: No intention needed, checking for active session');
      // Check if there's an active session to restore timer
      chrome.runtime.sendMessage({ action: 'getActiveSession' }, (session) => {
        if (session && session.duration > 0) {
          const elapsed = Date.now() - session.startTime;
          const remaining = Math.max(0, session.duration - elapsed);
          if (remaining > 0) {
            showFocusTimer(Math.ceil(remaining / 60000));
          }
        }
      });
    }
  });
  
  isInitialized = true;
}

// Message listener for service worker communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('FocusGuard: Content script received message:', request.action);
  
  if (request.action === 'timeUp') {
    showTimeUpNotification();
  } else if (request.action === 'startTimer') {
    showFocusTimer(request.duration);
  }
  
  sendResponse({ success: true });
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

// Also initialize after a short delay for SPA navigation
setTimeout(initializeContentScript, 1000);

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // Page became visible, check if we need to restore timer
    const siteName = getCurrentSite();
    if (siteName) {
      chrome.runtime.sendMessage({ action: 'getActiveSession' }, (session) => {
        if (session && session.duration > 0 && !currentTimer) {
          const elapsed = Date.now() - session.startTime;
          const remaining = Math.max(0, session.duration - elapsed);
          if (remaining > 0) {
            showFocusTimer(Math.ceil(remaining / 60000));
          }
        }
      });
    } else {
      // Clear any residual blur if not on a monitored site
      clearPageBlur();
    }
  }
});

console.log('FocusGuard: Content script initialized');