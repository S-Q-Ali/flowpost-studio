# FlowPost Studio — User Guide

> Upload once, publish everywhere. A complete guide to managing your video distribution across YouTube Shorts, Instagram Reels, and Facebook Pages.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Uploading & Distributing Videos](#uploading--distributing-videos)
4. [Managing Your Queue](#managing-your-queue)
5. [Content Calendar](#content-calendar)
6. [Google Sheets Workflows](#google-sheets-workflows)
7. [Connected Accounts](#connected-accounts)
8. [Troubleshooting](#troubleshooting)

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
- **Instagram Reels**
- **Facebook Page**

After selecting a platform, choose which connected account to use. You can select multiple accounts per platform (e.g., multiple YouTube channels).

#### 3. Customize Content Per Platform

Each platform has its own caption field:

| Platform | Field | Purpose |
|----------|-------|---------|
| **YouTube** | Title (required) | Video title that appears in search results |
| **YouTube** | Description | Longer description for the video page |
| **Instagram** | Caption | Post caption displayed with the Reel |
| **Facebook** | Caption | Post caption displayed with the video |
| **All** | Hashtags | Shared hashtags applied across all platforms |

#### 4. Content Settings

**AI/Altered Content Disclosure**
YouTube requires you to disclose if your video contains altered or synthetic content (AI-generated faces, voices, or realistic scenes). Select:

- **No** — This is original content
- **Yes** — This contains AI-generated or altered content

**Auto-Captions**
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

## Google Sheets Workflows

Workflows automate video publishing by pulling content directly from a Google Sheet.

### How It Works

1. You maintain a Google Sheet with rows of video data
2. FlowPost checks the sheet on a schedule (e.g., every 15 minutes)
3. Rows marked **"ready to post"** are automatically processed
4. Videos are uploaded to the platforms you specify

### Setting Up a Workflow

#### Step 1 — Prepare Your Sheet

Create a Google Sheet with these columns (header row is required):

| Column Name | Required | Description |
|-------------|----------|-------------|
| `video_url` or `image_url` | Yes | Google Drive sharing URL (use `video_url` for video workflows, `image_url` for image workflows) |
| `title` | No | Title for the video/image |
| `yt_video_title` | No | YouTube-specific video title (overrides `title`) |
| `yt_video_description` | No | YouTube video description |
| `fb_ig_caption` | No | Caption for both Facebook and Instagram posts |
| `image_fb_ig_caption` | No | Caption for image workflows (Facebook + Instagram only). Takes precedence over `fb_ig_caption` for image workflows. |
| `tiktok_caption` | No | Caption for TikTok posts (separate from `fb_ig_caption` so you can write TikTok-specific copy) |
| `platforms` | No | Comma-separated list: `youtube`, `facebook`, `instagram`, `tiktok` |
| `status` | Yes | Set to `ready to post` to trigger publishing |
| `youtube_channels` | No | Specific YouTube channel IDs (row-level override) |
| `facebook_pages` | No | Specific Facebook page IDs (row-level override) |

#### Step 2 — Create a Workflow

1. Go to **Workflows** in the sidebar
2. Click **Create Workflow**
3. Fill in:

| Field | Description |
|-------|-------------|
| **Name** | A label for this workflow |
| **Google Sheet URL** | The URL of your Google Sheet |
| **Trigger Window** | Hours of the day when processing should run (in UTC) |
| **Platforms** | Default platforms to publish to (can be overridden per row) |
| **Accounts** | Default YouTube/Facebook/Instagram accounts |
| **Max Videos Per Trigger** | How many videos to process in each run (default: 3) |
| **Post as Story** | Also publish as a story after the main video post |

#### Step 3 — Activate

Toggle the workflow to **Active**. The system will begin checking the sheet on its schedule.

### Processing Behavior

- Each workflow runs once per day within its configured **trigger window**
- A **random minute** within the window is selected to avoid congestion
- Only rows with `status = "ready to post"` are processed
- After processing, the row status is updated (the sheet column is updated)
- Manual runs can be triggered from the Workflows page for immediate processing

### Best Practices

- Keep videos under 500 MB
- Use Google Drive share links that are accessible by the service account
- Only mark rows as "ready to post" when the video is finalized
- Use the `platforms` column to override default platforms per video

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

### TikTok Notes
- TikTok only supports **video** posts. Image workflows automatically exclude TikTok.
- Each TikTok account uses a `tiktok_caption` column in your sheet (falls back to empty if absent — there's no automatic fallback to `fb_ig_caption`).
- The TikTok app must be connected with the `video.publish` scope. For development/testing, add your TikTok handle to the developer allowlist in the TikTok app dashboard.

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
   - **Video URL inaccessible** → Verify the video is still in R2 or Google Drive
   - **API quota exceeded** → Check your platform's API usage limits

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

### Google Sheets Workflow Not Triggering

| Symptom | Solution |
|---------|----------|
| Workflow is active but nothing happens | Check that the trigger window includes the current UTC hour |
| "Failed to read sheet" error | Verify the service account has access to the Google Sheet |
| Rows not being processed | Ensure row status is exactly `ready to post` (lowercase) |
| Media not found | Verify the Drive URL is correct and the service account has access |
| `video_url` or `image_url` column empty | Add the Google Drive sharing URL matching your workflow's media type |

### Getting Help

If you encounter issues not covered here, check the edge function logs in the Supabase Dashboard for detailed error messages. Each error log includes a stack trace and request context to help diagnose the problem.
