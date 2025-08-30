# FocusGuard Browser Extension

A mindfulness-focused browser extension that helps you maintain intentional browsing habits by requiring you to set clear goals before accessing distracting websites.

## ✨ Features

- **🎯 Intent Capture**: Set clear intentions before accessing monitored websites
- **⏱️ Smart Focus Timer**: Visual countdown timer with pause functionality and session tracking
- **🌐 Custom Website Monitoring**: Add any website to monitor beyond the defaults (YouTube & WhatsApp)
- **📊 Advanced Dashboard**: Beautiful analytics with charts, focus scores, and session insights
- **🎨 Dark Mode Support**: Automatic theme detection with manual override option
- **💭 Mindful Reminders**: Gentle prompts to stay focused during your session
- **📈 Recent Intentions**: Quick access to your last 5 intentions per site for faster setup
- **🔍 Activity Tracking**: Compare intended goals vs. actual browsing behavior
- **💾 Local Storage**: All data stays private on your device

## Installation

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `focusguard-extension` folder
5. The extension icon should appear in your toolbar

## 🚀 Usage

### Setting Your Intention
1. Navigate to any monitored website (YouTube, WhatsApp, or your custom sites)
2. A beautiful overlay will appear prompting you to set your intention
3. Enter your specific goal or select from your recent intentions
4. Choose session duration (5, 10, 15, 25 minutes or custom)
5. Click "Begin focused session" to start browsing mindfully

### Managing Custom Websites
1. Click the extension icon and go to Dashboard
2. Navigate to the Settings tab
3. In "Monitored Websites" section:
   - Add new sites with URL pattern, name, and icon
   - Remove custom sites (defaults cannot be removed)
   - Sites are automatically monitored after adding

### Session Features
- **Focus Timer**: Minimizable timer shows remaining time and intention
- **Pause/Resume**: Take breaks without losing your session
- **Mindful Reminders**: Get gentle prompts at 50% completion
- **Session Reflection**: Rate your focus level when time's up
- **Quick Extend**: Add 5 more minutes if needed

### Dashboard Analytics
- **Focus Score**: Track your intention alignment percentage
- **Time Tracking**: See time spent per website today
- **Session History**: Review past sessions with outcomes
- **Visual Charts**: Beautiful graphs showing your focus patterns
- **Export Data**: Download your session history as JSON

## 🎨 Customization

### Theme Settings
- **System**: Follows your OS dark/light mode preference
- **Light**: Always use light theme
- **Dark**: Always use dark theme with high-contrast colors

### Adding Extension Icons
To add custom extension icons:
1. Create PNG images in sizes: 16x16, 48x48, and 128x128
2. Save as `icon-16.png`, `icon-48.png`, `icon-128.png` in `assets/icons/`

## 🔒 Privacy & Security

- **100% Local**: All data stored locally using Chrome Storage API
- **No Tracking**: No analytics, telemetry, or external connections
- **Your Data**: Export and delete your data anytime from settings
- **Open Source**: Fully transparent, auditable code

## 🛠️ Technical Details

### Supported Browsers
- Google Chrome (v88+)
- Microsoft Edge (v88+)
- Any Chromium-based browser with Manifest V3 support

### Permissions Used
- `storage`: Save your intentions and settings locally
- `tabs`: Detect when you visit monitored sites
- `activeTab`: Interact with current tab only
- `scripting`: Inject focus overlay on monitored sites
- `<all_urls>`: Allow monitoring custom websites you add

## 🐛 Troubleshooting

### Extension Not Working?
1. Refresh the page you're trying to monitor
2. Check if the site is in your monitored websites list
3. Reload the extension from `chrome://extensions/`

### Context Invalidation Errors?
The extension now handles reload scenarios gracefully. If you see errors:
1. Refresh the current page
2. The extension will automatically reconnect

## 📝 Recent Updates

- ✅ Custom website monitoring beyond YouTube/WhatsApp
- ✅ Enhanced dark mode with better visibility
- ✅ Recent intentions for quick access
- ✅ Improved focus timer with pause functionality
- ✅ Fixed extension context invalidation errors
- ✅ Material Design 3 UI with mindfulness focus
- ✅ Advanced dashboard with analytics

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## 📄 License

MIT License - feel free to use this extension for personal or commercial purposes.