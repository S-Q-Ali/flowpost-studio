# FlowPost Desktop App - Statement of Intent

**Outcome:** Fully functional FlowPost desktop application for Windows with feature parity to the current web app

**User:** Social media managers/content creators scheduling across YouTube Shorts, Instagram Reels/Stories, Facebook Pages, TikTok, and LinkedIn

**Why now:** Desktop-native experience without browser dependency; existing web app works but desktop distribution desired

**Success Criteria:**
- All 17 current web features functional in desktop `.exe` application
- Auto-updates mechanism works correctly
- Users can install and use without keeping browser open
- Windows-only support (initial release)

**Constraints:**
- Windows-only operating system (initial release)
- Build on existing React 18 + TypeScript + Vite + Tailwind + Supabase codebase
- **No Electron framework** - using lighter desktop wrapper alternative (Tauri recommended)
- Auto-update capability required
- Feature parity with web app (all 17 pages/features)

**Out of Scope (Explicitly Not Building):**
- macOS/Linux support (for now)
- Electron framework
- Mobile platforms (iOS/Android)
- Chrome/Firefox extension version (already exists separately)
- New features not in current web app
- Cross-platform compatibility beyond Windows initial release

**Key Features to Port from Web App:**
- Dashboard overview page
- Upload & schedule videos/images across 5 platforms
- Workflow management and creation
- Content calendar view
- Social accounts connection (YouTube, Instagram, Facebook, TikTok, LinkedIn)
- Publishing queue management
- Analytics/insights dashboard
- AI caption generation (with stop button)
- Bulk operations (select all/deselect, mark as ready/posted/delete)
- Platform-specific settings per network
- Real-time status updates
- 2-column grid layout adapted for desktop
- Numeric file name sorting
- Sort preference persistence

**Distribution:**
- `.exe` installer from website
- Auto-update mechanism
- No app store distribution