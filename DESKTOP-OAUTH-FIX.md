# 🔧 Desktop OAuth Fix - Complete Guide

## **Problem: OAuth Popups Not Closing**

Facebook/Instagram OAuth popups open in browser but don't automatically close and return to the desktop app.

**Why:** Pake wrapper doesn't intercept OAuth callback URLs properly.

---

## **✅ Solution 1: Browser-First Method (RECOMMENDED)**

### **Step-by-Step:**

1. **Open FlowPost in Browser**
   ```powershell
   # Start dev server or use Vercel URL
   npm run dev
   # OR open: https://flowpost-studio.vercel.app
   ```

2. **Connect Accounts in Browser**
   - Go to Accounts page
   - Click "Connect" for Facebook/Instagram
   - Complete OAuth in browser popup
   - Verify connection works (shows "Connected" badge)

3. **Open Desktop App**
   ```powershell
   cd "E:\Web App\flowpost-studio"
   .\FlowPost.exe
   ```

4. **Check Account Status**
   - Desktop app should now see connected status
   - If not, click "Sync" button in header

---

## **✅ Solution 2: Desktop Header Sync (NEW!)**

### **Desktop App Now Has:**
- **Sync Button** - Force data refresh
- **Reload Button** - Full page reload
- **Keyboard Shortcut** - Ctrl+R to reload

### **How to Use:**

**In Desktop App:**
```
1. Open FlowPost.exe
2. See header at top with "Desktop Mode" label
3. Click "Sync" button to force refresh
4. Click "Reload" for full reload
5. Or press Ctrl+R to reload
```

---

## **✅ Solution 3: Manual OAuth Bypass**

### **For Facebook:**

1. **Get Access Token via Facebook Graph API**
   ```
   https://developers.facebook.com/tools/explorer/
   ```

2. **Request Required Permissions:**
   - pages_show_list
   - pages_read_engagement
   - instagram_basic
   - instagram_content_publish

3. **Use Token in App**
   - Go to Accounts → Facebook
   - Enter access token manually
   - Save

### **For Instagram:**

Instagram requires:
- ✅ Instagram Business account
- ✅ Facebook Page connected
- ✅ Facebook App created
- ✅ OAuth configured

**Alternative:** Use Instagram via Facebook first, then connect Instagram to that page.

---

## **🔍 New Desktop Features Added**

### **DesktopHeader Component:**
- Shows "Desktop Mode" indicator
- **Sync Button** - Force data fetch from server
- **Reload Button** - Full page reload
- **Logout Button** - Quick logout

### **Keyboard Shortcuts:**
- **Ctrl+R** - Reload page
- **F5** - Reload page (same as Ctrl+R)

### **Visual Indicator:**
- Blue header bar at top shows "Desktop Mode"
- Only appears when running as desktop app (window.__isDesktop = true)

---

## **📋 Testing Checklist**

| Feature | Test | Status |
|---------|------|--------|
| **Desktop Launch** | Run `FlowPost.exe` | ✅ Try now |
| **Browser OAuth** | Connect in browser first | ✅ Recommended |
| **Sync Button** | Click "Sync" in header | ✅ NEW! |
| **Reload Button** | Click "Reload" | ✅ NEW! |
| **Keyboard Reload** | Press Ctrl+R | ✅ NEW! |
| **Account Status** | Check after sync | ✅ NEW! |

---

## **💡 Best Practices**

### **For Account Connections:**
1. ✅ Use browser first to connect accounts
2. ✅ Verify in browser that "Connected" shows
3. ✅ Close OAuth popup in browser
4. ✅ Open desktop app
5. ✅ Click "Sync" button in desktop header
6. ✅ Verify account shows as connected

### **For Updates:**
1. ✅ Click "Reload" button in desktop header
2. ✅ Or press Ctrl+R
3. ✅ Desktop app will reload with latest code

---

## **🚀 Quick Start**

```powershell
# 1. Build with new sync features
cd "E:\Web App\flowpost-studio"
npm run build
npx pake --config desktop/pake.config.json

# 2. Test the new desktop app
cd "E:\Web App\flowpost-studio"
.\FlowPost.exe

# 3. Connect accounts in browser first
npm run dev
# Go to Accounts page → Connect Facebook/Instagram
# Verify it works

# 4. Then use desktop app
.\FlowPost.exe
# Click "Sync" button to get latest status
```

---

## **🎯 Summary**

| Issue | Solution |
|-------|----------|
| **OAuth popup doesn't close** | Connect accounts in browser first |
| **No refresh in desktop** | Use new "Sync" button (Ctrl+R) |
| **Need fresh data** | Click "Sync" in desktop header |
| **Full reload needed** | Click "Reload" or Ctrl+R |

**New desktop app now has:**
- ✅ Sync button for data refresh
- ✅ Reload button for full reload
- ✅ Keyboard shortcuts (Ctrl+R, F5)
- ✅ Visual "Desktop Mode" indicator

---

**Verdict:** Connect accounts in browser first, then use desktop app's Sync button to verify status! 🚀
