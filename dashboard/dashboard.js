// FocusGuard Dashboard - Mindfulness-Focused JavaScript

let allSessions = [];
let currentFilter = 'all';
let dateFilter = 'today';
let updateInterval = null;
let sessionReflections = [];

async function loadDashboardData() {
  try {
    const data = await chrome.storage.local.get([
      'sessions', 
      'totalTimeSpent', 
      'sessionReflections',
      'halfwayReminders',
      'reflectionPrompts',
      'youtubeDefault',
      'whatsappDefault',
      'activeSessions'
    ]);
    
    // Initialize with empty arrays if not present
    allSessions = data.sessions || [];
    sessionReflections = data.sessionReflections || [];
    
    // Merge active sessions if they exist
    const activeSessions = data.activeSessions || {};
    Object.values(activeSessions).forEach(activeSession => {
      if (activeSession && activeSession.intention) {
        // Add active sessions as current sessions
        const existingSession = allSessions.find(s => 
          s.timestamp === activeSession.startTime && 
          s.intention === activeSession.intention
        );
        if (!existingSession) {
          allSessions.push({
            timestamp: activeSession.startTime,
            site: activeSession.site,
            intention: activeSession.intention,
            duration: activeSession.duration,
            isActive: true
          });
        }
      }
    });
    
    const timeSpent = data.totalTimeSpent || {};
    
    updateMindfulnessOverview(timeSpent);
    updateSiteBreakdown(timeSpent);
    updateMindfulInsights();
    updateRecentSessions();
    loadSettings(data);
    
  } catch (error) {
    console.error('FocusGuard Dashboard: Error loading data:', error);
    showErrorState();
  }
}

function updateMindfulnessOverview(timeSpent) {
  const filteredSessions = filterSessionsByDate(allSessions);
  
  // Calculate intention score
  const intentionScore = calculateIntentionScore(filteredSessions);
  updateScoreDisplay(intentionScore);
  
  // Update mindful time
  const filteredTimeSpent = calculateFilteredTimeSpent(filteredSessions, timeSpent);
  const totalTime = (filteredTimeSpent.YouTube || 0) + (filteredTimeSpent.WhatsApp || 0);
  document.getElementById('mindful-time').textContent = formatTime(totalTime);
  
  // Update session count
  const uniqueSessions = getUniqueSessions(filteredSessions);
  document.getElementById('session-count').textContent = uniqueSessions.length;
  
  // Update goals achieved
  const goalsAchieved = calculateGoalsAchieved(filteredSessions);
  document.getElementById('goals-achieved').textContent = `${goalsAchieved.achieved}/${goalsAchieved.total}`;
  
  // Update change indicators
  updateChangeIndicators(filteredSessions);
}

function calculateIntentionScore(sessions) {
  if (sessions.length === 0) return 85; // Default score
  
  let totalScore = 0;
  let scoredSessions = 0;
  
  sessions.forEach(session => {
    if (session.intention) {
      scoredSessions++;
      let sessionScore = 50; // Base score for having an intention
      
      // Check if there's a reflection for this session
      const reflection = sessionReflections.find(r => 
        Math.abs(r.timestamp - session.timestamp) < 60000 // Within 1 minute
      );
      
      if (reflection) {
        switch (reflection.outcome) {
          case 'accomplished':
            sessionScore = 95;
            break;
          case 'partial':
            sessionScore = 75;
            break;
          case 'distracted':
            sessionScore = 45;
            break;
        }
      } else if (session.actualSearch) {
        const similarity = calculateIntentionSimilarity(session.intention, session.actualSearch);
        sessionScore = Math.round(similarity * 100);
      } else {
        sessionScore = 70; // No search tracked
      }
      
      totalScore += sessionScore;
    }
  });
  
  return scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 85;
}

function updateScoreDisplay(score) {
  // Update score value
  document.getElementById('intention-score').textContent = score;
  
  // Update SVG progress circle
  const progressCircle = document.getElementById('intention-progress');
  if (progressCircle) {
    const circumference = 2 * Math.PI * 40; // radius = 40
    const offset = circumference - (score / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
  }
  
  // Update insight message
  const insightText = document.querySelector('#score-insight .insight-text');
  if (insightText) {
    if (score >= 90) {
      insightText.textContent = "Excellent focus! You're mastering mindful browsing.";
    } else if (score >= 75) {
      insightText.textContent = "Great focus today! You stayed true to your intentions.";
    } else if (score >= 60) {
      insightText.textContent = "Good awareness. Keep refining your focus practice.";
    } else {
      insightText.textContent = "Room for growth. Try setting clearer intentions.";
    }
  }
}

function updateSiteBreakdown(timeSpent) {
  const filteredSessions = filterSessionsByDate(allSessions);
  const filteredTimeSpent = calculateFilteredTimeSpent(filteredSessions, timeSpent);
  
  // Update YouTube card
  const youtubeTime = filteredTimeSpent.YouTube || 0;
  const youtubeSessions = filteredSessions.filter(s => s.site === 'YouTube');
  document.getElementById('youtube-time').textContent = formatTime(youtubeTime);
  document.getElementById('youtube-sessions').textContent = `${getUniqueSessions(youtubeSessions).length} sessions`;
  
  const youtubeAvg = getUniqueSessions(youtubeSessions).length > 0 ? 
    Math.round(youtubeTime / (getUniqueSessions(youtubeSessions).length * 60000)) : 0;
  document.querySelector('.site-card.youtube .avg-duration').textContent = `Avg: ${youtubeAvg}min`;
  
  // Update YouTube intention match
  const youtubeMatch = calculateSiteIntentionMatch(youtubeSessions);
  document.getElementById('youtube-match').style.width = `${youtubeMatch}%`;
  document.querySelector('.site-card.youtube .match-label').textContent = `${youtubeMatch}% intention match`;
  
  // Update WhatsApp card
  const whatsappTime = filteredTimeSpent.WhatsApp || 0;
  const whatsappSessions = filteredSessions.filter(s => s.site === 'WhatsApp');
  document.getElementById('whatsapp-time').textContent = formatTime(whatsappTime);
  document.getElementById('whatsapp-sessions').textContent = `${getUniqueSessions(whatsappSessions).length} sessions`;
  
  const whatsappAvg = getUniqueSessions(whatsappSessions).length > 0 ? 
    Math.round(whatsappTime / (getUniqueSessions(whatsappSessions).length * 60000)) : 0;
  document.querySelector('.site-card.whatsapp .avg-duration').textContent = `Avg: ${whatsappAvg}min`;
  
  // Update WhatsApp intention match
  const whatsappMatch = calculateSiteIntentionMatch(whatsappSessions);
  document.getElementById('whatsapp-match').style.width = `${whatsappMatch}%`;
  document.querySelector('.site-card.whatsapp .match-label').textContent = `${whatsappMatch}% intention match`;
}

function calculateSiteIntentionMatch(sessions) {
  if (sessions.length === 0) return 90;
  
  let totalMatch = 0;
  let matchedSessions = 0;
  
  sessions.forEach(session => {
    if (session.intention) {
      matchedSessions++;
      
      const reflection = sessionReflections.find(r => 
        Math.abs(r.timestamp - session.timestamp) < 60000
      );
      
      if (reflection) {
        switch (reflection.outcome) {
          case 'accomplished':
            totalMatch += 95;
            break;
          case 'partial':
            totalMatch += 75;
            break;
          case 'distracted':
            totalMatch += 45;
            break;
        }
      } else if (session.actualSearch) {
        const similarity = calculateIntentionSimilarity(session.intention, session.actualSearch);
        totalMatch += similarity * 100;
      } else {
        totalMatch += 80;
      }
    }
  });
  
  return matchedSessions > 0 ? Math.round(totalMatch / matchedSessions) : 90;
}

function updateMindfulInsights() {
  updateReflectionSummary();
  updateHabitTrends();
  updateGoalPatterns();
}

function updateReflectionSummary() {
  const recentReflections = sessionReflections
    .filter(r => r.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    .slice(-20); // Recent 20 reflections
  
  const accomplished = recentReflections.filter(r => r.outcome === 'accomplished').length;
  const partial = recentReflections.filter(r => r.outcome === 'partial').length;
  const distracted = recentReflections.filter(r => r.outcome === 'distracted').length;
  
  document.getElementById('accomplished-count').textContent = accomplished;
  document.getElementById('partial-count').textContent = partial;
  document.getElementById('distracted-count').textContent = distracted;
}

function updateHabitTrends() {
  const sessions = filterSessionsByDate(allSessions);
  const morningFocus = calculateTimeOfDayFocus(sessions, 6, 12); // 6am-12pm
  const afternoonFocus = calculateTimeOfDayFocus(sessions, 12, 18); // 12pm-6pm
  
  // Update trend bars (mock data for now)
  const morningTrend = document.querySelector('.trend-item.improving .trend-fill');
  const afternoonTrend = document.querySelector('.trend-item.stable .trend-fill');
  
  if (morningTrend) morningTrend.style.width = `${morningFocus}%`;
  if (afternoonTrend) afternoonTrend.style.width = `${afternoonFocus}%`;
}

function calculateTimeOfDayFocus(sessions, startHour, endHour) {
  const timePeriodSessions = sessions.filter(session => {
    const hour = new Date(session.timestamp).getHours();
    return hour >= startHour && hour < endHour;
  });
  
  if (timePeriodSessions.length === 0) return 70; // Default
  
  const reflectedSessions = timePeriodSessions.filter(session => {
    const reflection = sessionReflections.find(r => 
      Math.abs(r.timestamp - session.timestamp) < 60000
    );
    return reflection && (reflection.outcome === 'accomplished' || reflection.outcome === 'partial');
  });
  
  return Math.round((reflectedSessions.length / timePeriodSessions.length) * 100);
}

function updateGoalPatterns() {
  const sessions = filterSessionsByDate(allSessions);
  const goalCategories = categorizeIntentions(sessions);
  
  // Update goal insights
  const goalInsightsContainer = document.getElementById('goal-insights');
  if (goalInsightsContainer) {
    goalInsightsContainer.innerHTML = Object.entries(goalCategories)
      .slice(0, 3) // Top 3 categories
      .map(([category, data]) => `
        <div class="goal-insight">
          <span class="goal-category">${category}</span>
          <span class="goal-success">${data.successRate}% success</span>
        </div>
      `).join('');
  }
}

function categorizeIntentions(sessions) {
  const categories = {
    'Learning': { total: 0, successful: 0, successRate: 0 },
    'Communication': { total: 0, successful: 0, successRate: 0 },
    'Entertainment': { total: 0, successful: 0, successRate: 0 }
  };
  
  sessions.forEach(session => {
    if (!session.intention) return;
    
    const intention = session.intention.toLowerCase();
    let category = 'Entertainment'; // default
    
    if (intention.includes('learn') || intention.includes('tutorial') || 
        intention.includes('study') || intention.includes('research')) {
      category = 'Learning';
    } else if (intention.includes('message') || intention.includes('chat') || 
               intention.includes('contact') || intention.includes('call')) {
      category = 'Communication';
    }
    
    categories[category].total++;
    
    const reflection = sessionReflections.find(r => 
      Math.abs(r.timestamp - session.timestamp) < 60000
    );
    
    if (reflection && (reflection.outcome === 'accomplished' || reflection.outcome === 'partial')) {
      categories[category].successful++;
    }
  });
  
  // Calculate success rates
  Object.keys(categories).forEach(category => {
    const data = categories[category];
    data.successRate = data.total > 0 ? Math.round((data.successful / data.total) * 100) : 90;
  });
  
  return categories;
}

function updateRecentSessions() {
  const sessionsList = document.getElementById('sessions-list');
  const filteredSessions = filterSessionsByDate(allSessions);
  
  let displaySessions;
  if (currentFilter === 'all') {
    displaySessions = filteredSessions;
  } else {
    displaySessions = filteredSessions.filter(s => s.site === currentFilter);
  }
  
  if (displaySessions.length === 0) {
    // Keep the empty state HTML that's already in the dashboard
    return;
  }
  
  // Group sessions by unique intention/timestamp combinations
  const uniqueSessions = getUniqueSessions(displaySessions)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10); // Show last 10 sessions
  
  sessionsList.innerHTML = `
    <div class="sessions-timeline">
      ${uniqueSessions.map(session => createSessionCard(session)).join('')}
    </div>
  `;
}

function getUniqueSessions(sessions) {
  const uniqueMap = new Map();
  
  sessions.forEach(session => {
    const key = `${Math.floor(session.timestamp / 60000)}-${session.intention}`;
    if (!uniqueMap.has(key) || uniqueMap.get(key).timestamp < session.timestamp) {
      uniqueMap.set(key, session);
    }
  });
  
  return Array.from(uniqueMap.values());
}

function createSessionCard(session) {
  const reflection = sessionReflections.find(r => 
    Math.abs(r.timestamp - session.timestamp) < 60000
  );
  
  const icon = session.site === 'YouTube' ? '🎥' : '💬';
  const date = new Date(session.timestamp);
  const timeAgo = getTimeAgo(session.timestamp);
  
  let statusColor = '#6750A4'; // Default primary
  let statusText = 'Focused session';
  
  if (reflection) {
    switch (reflection.outcome) {
      case 'accomplished':
        statusColor = '#4CAF50';
        statusText = 'Goal accomplished';
        break;
      case 'partial':
        statusColor = '#FF9800';
        statusText = 'Made progress';
        break;
      case 'distracted':
        statusColor = '#757575';
        statusText = 'Got distracted';
        break;
    }
  }
  
  return `
    <div class="session-item fade-in">
      <div class="session-icon">${icon}</div>
      <div class="session-details">
        <div class="session-intention">${session.intention}</div>
        <div class="session-meta">
          <span>${timeAgo}</span>
          <span style="color: ${statusColor};">•</span>
          <span style="color: ${statusColor};">${statusText}</span>
        </div>
        ${session.actualSearch ? `
          <div class="session-search">Searched: "${session.actualSearch}"</div>
        ` : ''}
      </div>
      <div class="session-outcome" style="background: ${statusColor}; opacity: 0.2; width: 8px; height: 8px; border-radius: 50%;"></div>
    </div>
  `;
}

function getTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function loadSettings(data) {
  // Load checkbox settings
  document.getElementById('halfway-reminders').checked = data.halfwayReminders !== false;
  document.getElementById('reflection-prompts').checked = data.reflectionPrompts !== false;
  
  // Load default durations
  document.getElementById('youtube-default').value = data.youtubeDefault || '15';
  document.getElementById('whatsapp-default').value = data.whatsappDefault || '15';
}

// Utility functions
function formatTime(milliseconds) {
  const minutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
}

function filterSessionsByDate(sessions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  return sessions.filter(session => {
    const sessionDate = new Date(session.timestamp);
    
    switch (dateFilter) {
      case 'today':
        return sessionDate >= today;
      case 'week':
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return sessionDate >= weekAgo;
      case 'month':
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return sessionDate >= monthAgo;
      default:
        return true;
    }
  });
}

function calculateFilteredTimeSpent(filteredSessions, totalTimeSpent) {
  if (dateFilter === 'all') {
    return totalTimeSpent;
  }
  
  const timeByDate = { YouTube: 0, WhatsApp: 0 };
  const sessionsByDate = {};
  
  filteredSessions.forEach(session => {
    const dateKey = new Date(session.timestamp).toDateString();
    if (!sessionsByDate[dateKey]) {
      sessionsByDate[dateKey] = { YouTube: [], WhatsApp: [] };
    }
    sessionsByDate[dateKey][session.site].push(session);
  });
  
  Object.values(sessionsByDate).forEach(day => {
    timeByDate.YouTube += day.YouTube.length * 15 * 60 * 1000; // 15 min avg
    timeByDate.WhatsApp += day.WhatsApp.length * 10 * 60 * 1000; // 10 min avg
  });
  
  return timeByDate;
}

function calculateGoalsAchieved(sessions) {
  const uniqueSessions = getUniqueSessions(sessions);
  const total = uniqueSessions.filter(s => s.intention).length;
  
  const achieved = uniqueSessions.filter(session => {
    const reflection = sessionReflections.find(r => 
      Math.abs(r.timestamp - session.timestamp) < 60000
    );
    return reflection && (reflection.outcome === 'accomplished' || reflection.outcome === 'partial');
  }).length;
  
  return { achieved, total };
}

function updateChangeIndicators(sessions) {
  // Mock positive changes for now
  document.getElementById('time-change').textContent = '+15m from yesterday';
  document.getElementById('session-change').textContent = '+2 from yesterday';
  document.getElementById('goals-change').textContent = '75% success rate';
}

function calculateIntentionSimilarity(intention, actualSearch) {
  const intentionWords = intention.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
    
  const searchWords = actualSearch.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  if (intentionWords.length === 0 || searchWords.length === 0) {
    return 0.5;
  }
  
  let matches = 0;
  let partialMatches = 0;
  
  intentionWords.forEach(intentionWord => {
    searchWords.forEach(searchWord => {
      if (intentionWord === searchWord) {
        matches += 2;
      } else if (intentionWord.includes(searchWord) || searchWord.includes(intentionWord)) {
        partialMatches += 1;
      }
    });
  });
  
  const totalPossibleMatches = intentionWords.length * 2;
  const actualMatches = matches + partialMatches;
  
  return Math.min(1, actualMatches / totalPossibleMatches);
}

function showErrorState() {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: #666;">
        <h2>Unable to load dashboard</h2>
        <p>Please refresh the page or check the browser console for errors.</p>
        <button id="reload-btn" style="
          padding: 12px 24px; 
          background: #6750A4; 
          color: white; 
          border: none; 
          border-radius: 8px; 
          cursor: pointer;
        ">
          Refresh Page
        </button>
      </div>
    `;
    
    // Add event listener after innerHTML is set
    document.getElementById('reload-btn')?.addEventListener('click', () => {
      location.reload();
    });
  }
}

// Theme management
function initializeTheme() {
  chrome.storage.local.get(['themePreference'], (data) => {
    const preference = data.themePreference || 'system';
    applyTheme(preference);
    updateThemeToggle(preference);
  });
}

function applyTheme(preference) {
  const root = document.documentElement;
  
  if (preference === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', preference);
  }
}

function updateThemeToggle(activeTheme) {
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.theme === activeTheme) {
      btn.classList.add('active');
    }
  });
}

function setTheme(theme) {
  chrome.storage.local.set({ themePreference: theme });
  applyTheme(theme);
  updateThemeToggle(theme);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme
  initializeTheme();
  
  // Theme toggle
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
    });
  });
  
  // Date filter
  const dateFilterEl = document.getElementById('date-filter');
  if (dateFilterEl) {
    dateFilterEl.addEventListener('change', (e) => {
      dateFilter = e.target.value;
      loadDashboardData();
    });
  }
  
  // Session filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.site;
      updateRecentSessions();
    });
  });
  
  // Settings toggle
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', () => {
      const isHidden = settingsPanel.style.display === 'none';
      settingsPanel.style.display = isHidden ? 'block' : 'none';
      settingsBtn.textContent = isHidden ? '✕' : '⚙️';
    });
  }
  
  // Settings form handlers
  document.getElementById('halfway-reminders')?.addEventListener('change', saveSettings);
  document.getElementById('reflection-prompts')?.addEventListener('change', saveSettings);
  document.getElementById('youtube-default')?.addEventListener('change', saveSettings);
  document.getElementById('whatsapp-default')?.addEventListener('change', saveSettings);
  
  // Export data buttons
  document.getElementById('export-json')?.addEventListener('click', exportData);
  document.getElementById('export-csv')?.addEventListener('click', exportCSV);
  
  // Reset data button
  document.getElementById('reset-data')?.addEventListener('click', resetData);
  
  // Load initial data
  loadDashboardData();
  
  // Start periodic updates only if page is visible
  if (!document.hidden) {
    updateInterval = setInterval(loadDashboardData, 30000); // 30 seconds
  }
});

async function saveSettings() {
  const settings = {
    halfwayReminders: document.getElementById('halfway-reminders').checked,
    reflectionPrompts: document.getElementById('reflection-prompts').checked,
    youtubeDefault: document.getElementById('youtube-default').value,
    whatsappDefault: document.getElementById('whatsapp-default').value
  };
  
  await chrome.storage.local.set(settings);
  console.log('FocusGuard Dashboard: Settings saved');
}

async function exportData() {
  try {
    const data = await chrome.storage.local.get(null);
    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusguard-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('FocusGuard Dashboard: JSON data exported');
  } catch (error) {
    console.error('FocusGuard Dashboard: Export failed:', error);
    alert('Export failed. Please try again.');
  }
}

async function exportCSV() {
  try {
    const data = await chrome.storage.local.get(['sessions', 'sessionReflections', 'totalTimeSpent']);
    const sessions = data.sessions || [];
    const reflections = data.sessionReflections || [];
    const timeSpent = data.totalTimeSpent || {};
    
    // Create CSV content
    const csvHeaders = [
      'Date',
      'Time',
      'Site',
      'Intention',
      'Duration (minutes)',
      'Outcome',
      'Actual Search',
      'Timestamp'
    ];
    
    const csvRows = sessions.map(session => {
      const date = new Date(session.timestamp);
      const reflection = reflections.find(r => 
        Math.abs(r.timestamp - session.timestamp) < 60000
      );
      
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        session.site || '',
        `"${(session.intention || '').replace(/"/g, '""')}"`, // Escape quotes
        session.duration ? Math.round(session.duration / 60000) : '',
        reflection ? reflection.outcome : '',
        `"${(session.actualSearch || '').replace(/"/g, '""')}"`, // Escape quotes
        session.timestamp
      ].join(',');
    });
    
    // Add summary statistics at the bottom
    csvRows.push('');
    csvRows.push('=== SUMMARY STATISTICS ===');
    csvRows.push(`Total YouTube Time,${Math.round((timeSpent.YouTube || 0) / 60000)} minutes`);
    csvRows.push(`Total WhatsApp Time,${Math.round((timeSpent.WhatsApp || 0) / 60000)} minutes`);
    csvRows.push(`Total Sessions,${sessions.length}`);
    csvRows.push(`Export Date,${new Date().toISOString()}`);
    
    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusguard-sessions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('FocusGuard Dashboard: CSV data exported');
  } catch (error) {
    console.error('FocusGuard Dashboard: CSV export failed:', error);
    alert('CSV export failed. Please try again.');
  }
}

async function resetData() {
  if (confirm('Are you sure you want to reset all your FocusGuard data? This cannot be undone.')) {
    try {
      await chrome.storage.local.clear();
      console.log('FocusGuard Dashboard: Data reset');
      location.reload();
    } catch (error) {
      console.error('FocusGuard Dashboard: Reset failed:', error);
      alert('Reset failed. Please try again.');
    }
  }
}

// Storage change listener for real-time updates
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    let shouldUpdate = false;
    
    if (changes.sessions || changes.totalTimeSpent || changes.sessionReflections) {
      shouldUpdate = true;
    }
    
    if (shouldUpdate) {
      console.log('FocusGuard Dashboard: Storage changed, updating...');
      loadDashboardData();
    }
  }
});

// Handle visibility changes for performance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  } else {
    loadDashboardData();
    if (!updateInterval) {
      updateInterval = setInterval(loadDashboardData, 30000);
    }
  }
});

// Cleanup function
function cleanup() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Clean up when page unloads
window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);