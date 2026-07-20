# FlowPost Studio — User Guide

> Upload once, publish everywhere. A complete guide to managing your video distribution across YouTube Shorts, Instagram Reels & Stories, Facebook Pages, TikTok, and LinkedIn.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Uploading & Distributing Videos](#uploading--distributing-videos)
4. [Managing Your Queue](#managing-your-queue)
5. [Content Calendar](#content-calendar)
6. [Storage Manager](#storage-manager)
7. [Profile & Security](#profile--security)
8. [Google Sheets & FlowPost Workflows](#google-sheets--flowpost-workflows)
9. [Connected Accounts](#connected-accounts)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Authentication

FlowPost Studio uses a two-factor authentication flow to protect your publishing dashboard.

**Step 1 — App Password**

Enter your app password. This is a shared password configured by the administrator.

**Step 2 — Google OAuth (Optional)**

If enabled, you can also sign in with Google. This creates a session that links to your Google account for publishing to YouTube.

**Step 3 — Security Questions (Recovery)**

If you have set up security questions, you can use them to recover access if you forget your password. Questions are set once and stored securely.

After successful authentication, you will be redirected to the Dashboard.

---

## Dashboard

The Dashboard provides an at-a-glance overview of your content distribution activity.

![Dashboard overview]

### Stats Cards

| Metric | Description |
|--------|-------------|
| **Videos Uploaded** | Total number of videos you have uploaded |
| **Scheduled** | Number of posts waiting to be published |
| **Published** | Number of successfully published posts |
| **Connected Accounts** | Number of social accounts linked to FlowPost |

### Recent Activity

The lower section shows your five most recent posts with their current status and platform. Click any post to navigate to the Queue for more details.

---

## Uploading & Distributing Videos

### Step-by-Step Guide

#### 1. Upload a Video

Navigate to **Upload** in the sidebar.

- Drag and drop a video file onto the upload area, or click to browse
- Accepted formats: **MP4** and **MOV**
- Recommended aspect ratio: **9:16** (vertical / portrait) for Shorts and Reels
- File size limit: **500 MB**

![Upload area]

#### 2. Select Platforms

Choose which platforms to publish to:

- **YouTube Shorts**
- **Instagram Reels & Stories**
- **Facebook Page & Stories**
- **TikTok**
- **LinkedIn**

After selecting a platform, choose which connected account to use. You can select multiple accounts per platform (e.g., multiple YouTube channels). For image uploads, only Facebook and Instagram are available.

#### 3. Customize Content Per Platform

Each platform has its own caption field:

| Platform | Field | Purpose |
|----------|-------|---------|
| **YouTube** | Title (required) | Video title that appears in search results |
| **YouTube** | Description | Longer description for the video page |
| **Instagram** | Caption | Post caption displayed with the Reel |
| **Facebook** | Caption | Post caption displayed with the video |
| **TikTok** | Caption | Post caption for TikTok (separate from other platforms for platform-specific copy) |
| **LinkedIn** | Title (required) | Post headline for LinkedIn feed |
| **LinkedIn** | Description | Post body text for LinkedIn |
| **All** | Hashtags | Shared hashtags applied across all platforms |

#### 4. Content Settings

**AI/Altered Content Disclosure**
YouTube requires you to disclose if your video contains altered or synthetic content (AI-generated faces, voices, or realistic scenes). Select:

- **No** — This is original content
- **Yes** — This contains AI-generated or altered content

**AI Caption Generation**
Click the **Generate AI Captions** button to automatically create per-platform captions:

1. The browser downloads the video directly from Google Drive (zero server egress)
2. Audio is extracted and transcribed via Groq Whisper
3. Video frames are analyzed to identify subjects and context
4. Per-platform captions are generated, each optimized for that platform's style
5. Review and apply captions in the preview modal

This runs entirely in your browser — no server costs, no file size limits.

**Auto-Captions (Burn-in Subtitles)**
Toggle burn-in subtitles to embed auto-generated captions directly into the video.

#### 5. Publish or Schedule

Choose when to publish:

**Publish Now**
The video is uploaded and publishing begins immediately. You will be redirected to the Queue to monitor progress.

**Schedule**
Pick a future date and time. The video will be published automatically at the scheduled time.

![Publish options]

#### 6. Monitor Progress

During upload, a progress bar shows the current status:

- **Uploading** — Video is being transferred to cloud storage (progress percentage shown)
- **Processing** — Publishing has been triggered
- Check the **Queue** page for detailed per-platform status

---

## Managing Your Queue

The Queue page shows all your posts — both scheduled and in-progress.

### Post Statuses

| Status | Meaning |
|--------|---------|
| **Scheduled** | Awaiting its scheduled publish time |
| **Processing** | Currently being published (video uploading to platform) |
| **Published** | Successfully published |
| **Failed** | Publishing encountered an error |

### Actions

| Action | How |
|--------|-----|
| **Edit** | Click the pencil icon to change captions, hashtags, or scheduled time |
| **Reschedule** | Open the post and pick a new date/time |
| **Delete** | Click the trash icon to cancel a scheduled post |
| **Bulk select** | Use checkboxes to select multiple posts and delete them at once |

### Filters

Use the search bar to filter posts by status, platform, or date range.

---

## Content Calendar

The Calendar page provides a monthly view of all your scheduled and published content.

### Views

| View | Description |
|------|-------------|
| **Month** | See all posts arranged by date on a calendar grid |
| **List** | Chronological list of all posts for the selected month |

### Navigation

- Use the left/right arrows to switch between months
- Click any date to see posts scheduled for that day
- Click on a post card to view details in a popup dialog

---

## Storage Manager

The Storage page lets you browse, upload, and manage files across your connected cloud storage providers.

### Google Drive

If you've connected your Google Drive account, you can:

- **Browse files and folders** in a directory tree view
- **Upload files** directly to any folder in your Drive
- **Create folders** to organize your content
- **Select files** for use in uploads and workflows

### Mega

Mega integration offers two connection modes:

- **Connect your Mega account** — Enter your Mega email and password to link your account. Full access to browse and select files.
- **Public share links** — Enter a Mega file or folder sharing URL. No account needed — files are decrypted and accessed directly.

### Transfer Files

The **Drive to Mega** tool lets you transfer files from Google Drive directly to Mega — all processed in your browser:

1. Select a file from your Drive
2. Choose a destination folder in Mega
3. Click Transfer — the file streams through your browser from Drive to Mega
4. Progress is shown in real-time

This uses no server bandwidth — the file never touches your server.

---

## Profile & Security

The Profile page gives you control over your account settings.

### Profile Information

- **Display name and avatar** — Update how you appear in the dashboard
- **Change password** — Update your app password

### Security Questions

Admin accounts can set up security questions for account recovery:

1. Go to **Profile** in the sidebar
2. Scroll to **Security Questions**
3. Write your questions and answers
4. Save — these will be used if you need to reset your password

---

## Google Sheets & FlowPost Workflows

Workflows automate publishing by pulling content from a **Google Sheet** (Sheet mode) or from the built-in **workflow_items table** (FlowPost mode).

### Workflow Modes

| Mode | Source | Best For |
|------|--------|----------|
| **Google Sheet** | An external Google Sheet you maintain | Existing sheet-based workflows, collaborating via spreadsheets |
| **FlowPost** | The internal `workflow_items` table | Full FlowPost UI — add items directly in the app, AI captions, image support |

### Scheduling Modes

| Mode | Description |
|------|-------------|
| **Once Daily** | One run per day at a random time within a configured trigger window (e.g., 9:00–17:00 UTC) |
| **Every N Hours** | Runs repeatedly every N hours (e.g., every 4 hours), 24/7 |
| **Custom Time Range** | Runs every N hours but only during a specified UTC window (e.g., every 3 hours between 8:00–20:00 UTC) |

### Google Sheet Workflows

#### Step 1 — Prepare Your Sheet

Create a Google Sheet with these columns (header row is required):

| Column Name | Required | Description |
|-------------|----------|-------------|
| `video_url` or `image_url` | Yes | Google Drive or Mega sharing URL |
| `title` | No | Title for the video/image |
| `yt_video_title` | No | YouTube-specific video title (overrides `title`) |
| `yt_video_description` | No | YouTube video description |
| `fb_ig_caption` | No | Caption for both Facebook and Instagram posts |
| `image_fb_ig_caption` | No | Caption for image workflows (Facebook + Instagram only). Takes precedence over `fb_ig_caption` for image workflows. |
| `tiktok_caption` | No | Caption for TikTok posts |
| `linkedin_title` | No | Title for LinkedIn posts (overrides `title` for LinkedIn) |
| `linkedin_description` | No | Body text for LinkedIn posts |
| `hashtags` | No | Shared hashtags applied across platforms |
| `platforms` | No | Comma-separated list: `youtube`, `facebook`, `instagram`, `tiktok`, `linkedin` |
| `status` | Yes | Set to `ready to post` to trigger publishing |
| `youtube_channels` | No | Specific YouTube channel IDs (row-level override) |
| `facebook_pages` | No | Specific Facebook page IDs (row-level override) |

#### Step 2 — Create a Workflow

1. Go to **Workflows** in the sidebar
2. Click **Create Workflow**
3. Fill in the settings (see table below)

### FlowPost Workflows

FlowPost mode uses the internal database table — no spreadsheet needed.

1. Create a workflow in **FlowPost** mode
2. Add items directly in the app with media URLs and content settings
3. Enable **AI Captions** per workflow to auto-generate captions for all items
4. Activate the workflow — items are processed on the configured schedule

### Workflow Settings

| Field | Description |
|-------|-------------|
| **Name** | A label for this workflow |
| **Mode** | Google Sheet or FlowPost |
| **Google Sheet URL** | (Sheet mode only) The URL of your Google Sheet |
| **Scheduling Mode** | Once Daily / Every N Hours / Custom Time Range |
| **Interval (hours)** | (Every N / Custom modes) How often to run |
| **Trigger Window** | Hours of the day when processing runs (in UTC) |
| **Platforms** | Default platforms to publish to |
| **Accounts** | Default YouTube/Facebook/Instagram/TikTok/LinkedIn accounts |
| **Drive Account** | Which Drive connection to use for fetching media |
| **Max Items Per Run** | How many items to process in each run (default: 3) |
| **Post as Story** | Also publish as a story after the main post |
| **AI Captions** | (FlowPost mode) Auto-generate captions for each item using AI |

### AI Captions for Workflows

When AI captions are enabled for a FlowPost workflow:

- Each item's media is analyzed — audio is transcribed, frames are extracted
- Per-platform captions are generated using Groq Whisper + Vision + LLM
- Captions are stored with each workflow item and applied during publishing
- This runs entirely client-side when workflow items are pre-processed

### Media Sources

Workflows support media from multiple sources:

| Source | URL Format |
|--------|------------|
| **Google Drive** | Standard Drive sharing URL (`https://drive.google.com/...`) |
| **Mega** | Mega file/folder URL (`https://mega.nz/...`) |

### Image Workflows

Image workflows work like video workflows but:
- Only publish to Facebook and Instagram (Photo posts + Stories)
- Use the `image_url` column instead of `video_url`
- Use `image_fb_ig_caption` for per-post captions
- TikTok and LinkedIn are excluded automatically

### Processing Behavior

- Runs according to the configured scheduling mode, not just once daily
- In **Once Daily** mode, a random minute within the window is selected
- Only Sheet rows with `status = "ready to post"` are processed
- After processing, the sheet row status is updated automatically
- Manual runs can be triggered from the Workflows page

### Best Practices

- Keep videos under 500 MB
- Use Google Drive share links accessible by the service account
- For Mega URLs, ensure share links have no expiration or password
- Only mark rows as "ready to post" when the content is finalized
- Use the `platforms` column to override default platforms per item

---

## Connected Accounts

The Accounts page manages all your social media connections.

### Supported Platforms

| Platform | What You Can Do |
|----------|----------------|
| **YouTube** | Publish Shorts to your channel(s) |
| **Facebook** | Publish videos to your Page(s) |
| **Instagram** | Publish Reels to your Business account(s) |
| **TikTok** | Publish videos to your TikTok account (video only, no images) |
| **LinkedIn** | Publish videos to your LinkedIn profile or Page |
| **Google Drive** | Browse files and folders from your connected Drive account |
| **Mega** | Connect a Mega account or use public share links for file access |

### TikTok Notes
- TikTok only supports **video** posts. Image workflows automatically exclude TikTok.
- Each TikTok account uses a `tiktok_caption` column in your sheet (falls back to empty if absent — there's no automatic fallback to `fb_ig_caption`).
- The TikTok app must be connected with the `video.publish` scope. For development/testing, add your TikTok handle to the developer allowlist in the TikTok app dashboard.

### LinkedIn Notes
- LinkedIn supports both **video** and **article-style** posts with a title and description.
- Each LinkedIn account requires a separate connection via OAuth with the `w_member_social` or `w_organization_social` scope.
- LinkedIn posts use a separate title + description format (different from other platforms' single caption field).

### Connecting an Account

1. Go to **Accounts** in the sidebar
2. Click **Connect** next to the platform you want to link
3. You will be redirected to the platform's authorization page
4. Grant the requested permissions
5. You will be returned to FlowPost with the account connected

### Managing Connections

| Action | How |
|--------|-----|
| **View status** | Each account shows its connection status (Connected / Disconnected) |
| **Reconnect** | If a token expires, click Reconnect to re-authorize |
| **Remove** | Disconnect an account from FlowPost |

### Token Expiry

OAuth tokens expire periodically. FlowPost automatically attempts to refresh tokens when possible. If a token cannot be refreshed, you will see a notification prompting you to reconnect the account.

---

## Troubleshooting

### Upload Fails

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| "Failed to obtain upload URL" | R2 credentials misconfigured | Check R2 endpoint and keys in Supabase secrets |
| File rejected | Unsupported format | Use MP4 or MOV files only |
| Upload stalls at 0% | CORS issue | Verify `ALLOWED_ORIGIN` in Supabase secrets matches your frontend URL |
| "File too large" | Exceeds 500 MB limit | Compress the video or split into shorter clips |

### Post Stuck on "Processing"

Posts can remain in "processing" status if the edge function encounters an error.

1. Check the **edge function logs** in **Supabase Dashboard → Edge Functions → [function name] → Logs**
2. Common causes:
   - **OAuth token expired** → Reconnect the account in Accounts page
   - **Video URL inaccessible** → Verify the video is still in R2 or Google Drive/Mega
   - **API quota exceeded** → Check your platform's API usage limits
   - **LinkedIn media upload timeout** → LinkedIn has a 30-minute media processing window; very large files may time out

### OAuth Errors

| Error | Solution |
|-------|----------|
| "Google hasn't verified this app" | The Google OAuth consent screen is in testing mode. Add your email as a test user in Google Cloud Console, or submit the app for verification |
| "Access token not found" | Reconnect the account |
| "Token refresh failed" | The refresh token may have expired. Reconnect the account |

### CORS Errors in Browser Console

If you see CORS errors in the browser developer console:

1. Verify `ALLOWED_ORIGIN` is set in **Supabase Dashboard → Edge Functions → Secrets**
2. It should match your frontend URL exactly (e.g., `https://flowpost-studio.vercel.app`)
3. If using a preview/Vercel deployment URL, add it to `ALLOWED_ORIGIN`

### AI Caption Generation Fails

| Symptom | Solution |
|---------|----------|
| "Failed to transcribe audio" | Verify the video has audible audio. Try a shorter video. |
| Groq API error | Check that `GROQ_API_KEY` is set in Supabase secrets and has available quota |
| Captions not generating | Ensure the video is accessible via a Google Drive token (reconnect Drive if needed) |

### LinkedIn Post Fails

| Symptom | Solution |
|---------|----------|
| "Access token invalid" | Reconnect the LinkedIn account in Accounts page |
| LinkedIn title missing | LinkedIn requires a title — ensure it's filled in |
| "Not authorized for this action" | Verify the LinkedIn OAuth app has `w_member_social` or `w_organization_social` scope |

### FlowPost Workflow Not Triggering

| Symptom | Solution |
|---------|----------|
| Workflow is active but nothing happens | Check the scheduling mode and trigger window |
| FlowPost items not processed | Ensure items have a valid media URL and the workflow is active |
| AI captions not applied | AI captions are generated during pre-processing — check the workflow run logs |

### Google Sheets Workflow Not Triggering

| Symptom | Solution |
|---------|----------|
| Workflow is active but nothing happens | Check that the scheduling mode and trigger window are correctly configured |
| "Failed to read sheet" error | Verify the service account has access to the Google Sheet |
| Rows not being processed | Ensure row status is exactly `ready to post` (lowercase) |
| Media not found | Verify the Drive or Mega URL is correct and accessible |
| `video_url` or `image_url` column empty | Add the URL matching your workflow's media type |

### Google Drive / Mega Issues

| Symptom | Solution |
|---------|----------|
| "Drive not connected" | Connect your Google Drive account on the Accounts page |
| Mega login fails | Verify email and password are correct. For share links, ensure they are valid. |
| "Transfer failed" (Drive to Mega) | The file may be too large for browser streaming. Try a smaller file. |
| Files not appearing in Storage | Check that you've granted the right Drive permissions (read-only is sufficient for browsing) |

### Getting Help

If you encounter issues not covered here, check the edge function logs in the Supabase Dashboard for detailed error messages. Each error log includes a stack trace and request context to help diagnose the problem.
