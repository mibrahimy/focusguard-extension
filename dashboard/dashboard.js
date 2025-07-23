let allSessions = [];
let currentFilter = 'all';
let dateFilter = 'today';
let updateInterval = null;

async function loadDashboardData() {
  const data = await chrome.storage.local.get(['sessions', 'totalTimeSpent']);
  allSessions = data.sessions || [];
  const timeSpent = data.totalTimeSpent || {};
  
  updateStats(timeSpent);
  updateSessionsList();
  analyzePatterns();
}

function updateStats(timeSpent) {
  const filteredSessions = filterSessionsByDate(allSessions);
  
  // Calculate time based on filtered sessions
  const filteredTimeSpent = calculateFilteredTimeSpent(filteredSessions, timeSpent);
  const youtubeTime = filteredTimeSpent.YouTube || 0;
  const whatsappTime = filteredTimeSpent.WhatsApp || 0;
  const totalTime = youtubeTime + whatsappTime;
  
  document.getElementById('total-time').textContent = formatTime(totalTime);
  document.getElementById('youtube-total').textContent = formatTime(youtubeTime);
  document.getElementById('whatsapp-total').textContent = formatTime(whatsappTime);
  
  document.getElementById('session-count').textContent = filteredSessions.length;
  
  const focusScore = calculateFocusScore(filteredSessions);
  document.getElementById('focus-score').textContent = `${focusScore}%`;
  document.getElementById('score-fill').style.width = `${focusScore}%`;
  
  const avgDuration = calculateAverageDuration(filteredSessions);
  document.getElementById('avg-duration').textContent = `${avgDuration}m`;
  
  const onTrack = calculateOnTrackPercentage(filteredSessions);
  document.getElementById('on-track-percentage').textContent = `${onTrack}%`;
}

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

function calculateFocusScore(sessions) {
  if (sessions.length === 0) return 100;
  
  let totalScore = 0;
  let scoredSessions = 0;
  
  sessions.forEach(session => {
    if (session.intention) {
      scoredSessions++;
      let sessionScore = 50; // Base score for having an intention
      
      if (session.actualSearch) {
        const similarity = calculateIntentionSimilarity(session.intention, session.actualSearch);
        sessionScore = Math.round(similarity * 100);
      } else {
        // No search tracked - give benefit of doubt but reduce score slightly
        sessionScore = 70;
      }
      
      totalScore += sessionScore;
    }
  });
  
  return scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 100;
}

function calculateIntentionSimilarity(intention, actualSearch) {
  const intentionWords = intention.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter out short words
    
  const searchWords = actualSearch.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  if (intentionWords.length === 0 || searchWords.length === 0) {
    return 0.5; // Neutral score when can't compare
  }
  
  // Calculate semantic similarity
  let matches = 0;
  let partialMatches = 0;
  
  intentionWords.forEach(intentionWord => {
    searchWords.forEach(searchWord => {
      if (intentionWord === searchWord) {
        matches += 2; // Exact match worth more
      } else if (intentionWord.includes(searchWord) || searchWord.includes(intentionWord)) {
        partialMatches += 1; // Partial match
      } else if (getWordSimilarity(intentionWord, searchWord) > 0.7) {
        partialMatches += 1; // Similar words (e.g., "learning" vs "learn")
      }
    });
  });
  
  const totalPossibleMatches = intentionWords.length * 2;
  const actualMatches = matches + partialMatches;
  
  return Math.min(1, actualMatches / totalPossibleMatches);
}

function getWordSimilarity(word1, word2) {
  // Simple similarity based on common characters
  const longer = word1.length > word2.length ? word1 : word2;
  const shorter = word1.length > word2.length ? word2 : word1;
  
  if (longer.length === 0) return 1;
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }
  
  return matches / longer.length;
}

function calculateFilteredTimeSpent(filteredSessions, totalTimeSpent) {
  // For date filters other than 'all', we need to calculate time based on sessions
  if (dateFilter === 'all') {
    return totalTimeSpent;
  }
  
  const timeByDate = { YouTube: 0, WhatsApp: 0 };
  
  // Group sessions by date and calculate approximate time
  const sessionsByDate = {};
  filteredSessions.forEach(session => {
    const dateKey = new Date(session.timestamp).toDateString();
    if (!sessionsByDate[dateKey]) {
      sessionsByDate[dateKey] = { YouTube: [], WhatsApp: [] };
    }
    sessionsByDate[dateKey][session.site].push(session);
  });
  
  // Estimate time per day based on session frequency (rough approximation)
  Object.values(sessionsByDate).forEach(day => {
    timeByDate.YouTube += day.YouTube.length * 15 * 60 * 1000; // 15 min avg per session
    timeByDate.WhatsApp += day.WhatsApp.length * 10 * 60 * 1000; // 10 min avg per session
  });
  
  return timeByDate;
}

function calculateAverageDuration(sessions) {
  if (sessions.length === 0) return 0;
  
  // Group sessions by unique timestamp/intention combinations to get actual sessions
  const uniqueSessions = [];
  const seen = new Set();
  
  sessions.forEach(session => {
    const key = `${session.timestamp}-${session.intention}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSessions.push(session);
    }
  });
  
  // Assume average session duration based on typical usage patterns
  const avgMinutes = uniqueSessions.reduce((sum, session) => {
    // Estimate duration based on site and intention length
    const baseTime = session.site === 'YouTube' ? 20 : 12; // YouTube sessions tend to be longer
    const intentionBonus = Math.min(session.intention?.length / 10, 5); // Longer intention = more focused
    return sum + baseTime + intentionBonus;
  }, 0);
  
  return Math.round(avgMinutes / uniqueSessions.length);
}

function calculateOnTrackPercentage(sessions) {
  if (sessions.length === 0) return 100;
  
  const onTrack = sessions.filter(session => {
    if (!session.actualSearch || !session.intention) return true;
    
    const intentionWords = session.intention.toLowerCase().split(' ');
    const searchWords = session.actualSearch.toLowerCase().split(' ');
    
    return intentionWords.some(word => 
      searchWords.some(searchWord => searchWord.includes(word))
    );
  });
  
  return Math.round((onTrack.length / sessions.length) * 100);
}

function updateSessionsList() {
  const sessionsList = document.getElementById('sessions-list');
  const filteredSessions = filterSessionsByDate(allSessions);
  const displaySessions = currentFilter === 'all' 
    ? filteredSessions 
    : filteredSessions.filter(s => s.site === currentFilter);
  
  if (displaySessions.length === 0) {
    sessionsList.innerHTML = `
      <div class="empty-state">
        <p>No sessions found for the selected filter.</p>
      </div>
    `;
    return;
  }
  
  sessionsList.innerHTML = displaySessions
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(session => {
      const isMatch = checkIntentionMatch(session);
      const icon = session.site === 'YouTube' ? '📺' : '💬';
      const date = new Date(session.timestamp);
      
      return `
        <div class="session-item">
          <div class="session-icon">${icon}</div>
          <div class="session-details">
            <div class="session-intention">${session.intention}</div>
            <div class="session-meta">
              <span>${date.toLocaleDateString()}</span>
              <span>${date.toLocaleTimeString()}</span>
            </div>
            ${session.actualSearch ? `
              <div class="session-search">Searched: "${session.actualSearch}"</div>
            ` : ''}
          </div>
          <div class="match-indicator ${isMatch ? 'good' : 'poor'}" 
               title="${isMatch ? 'On track' : 'Distracted'}"></div>
        </div>
      `;
    }).join('');
}

function checkIntentionMatch(session) {
  if (!session.actualSearch || !session.intention) return true;
  
  const intentionWords = session.intention.toLowerCase().split(' ');
  const searchWords = session.actualSearch.toLowerCase().split(' ');
  
  return intentionWords.some(word => 
    searchWords.some(searchWord => searchWord.includes(word))
  );
}

function analyzePatterns() {
  const patternsContent = document.getElementById('patterns-content');
  const sessions = filterSessionsByDate(allSessions);
  
  if (sessions.length < 5) {
    patternsContent.innerHTML = `
      <p class="loading">Need more sessions to analyze patterns. Keep using FocusGuard!</p>
    `;
    return;
  }
  
  const patterns = [];
  
  const distractedSessions = sessions.filter(s => !checkIntentionMatch(s));
  if (distractedSessions.length > sessions.length * 0.3) {
    patterns.push({
      title: 'Frequent Distractions Detected',
      description: `${Math.round(distractedSessions.length / sessions.length * 100)}% of your sessions drift from original intentions. Try being more specific with your goals.`
    });
  }
  
  const youtubeSessions = sessions.filter(s => s.site === 'YouTube');
  const whatsappSessions = sessions.filter(s => s.site === 'WhatsApp');
  
  if (youtubeSessions.length > whatsappSessions.length * 2) {
    patterns.push({
      title: 'YouTube is Your Main Distraction',
      description: 'You spend significantly more time on YouTube. Consider using playlists or bookmarks for work-related videos.'
    });
  }
  
  if (patterns.length === 0) {
    patterns.push({
      title: 'Great Focus Habits!',
      description: 'You\'re doing well at staying on track. Keep up the good work!'
    });
  }
  
  patternsContent.innerHTML = patterns.map(pattern => `
    <div class="pattern-item">
      <div class="pattern-title">${pattern.title}</div>
      <div class="pattern-description">${pattern.description}</div>
    </div>
  `).join('');
}

document.getElementById('date-filter').addEventListener('change', (e) => {
  dateFilter = e.target.value;
  loadDashboardData();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.dataset.site;
    updateSessionsList();
  });
});

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
    // Stop updates when tab is hidden
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  } else {
    // Resume updates when tab becomes visible
    loadDashboardData();
    if (!updateInterval) {
      updateInterval = setInterval(loadDashboardData, 15000); // Reduced frequency
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

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  
  // Start periodic updates only if page is visible
  if (!document.hidden) {
    updateInterval = setInterval(loadDashboardData, 15000);
  }
});