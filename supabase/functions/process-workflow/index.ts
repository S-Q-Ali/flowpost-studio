import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { encrypt, decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_API_KEY = Deno.env.get("CRON_API_KEY");
const GOOGLE_FALLBACK_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID") || undefined;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for process-workflow");
}
if (!CRON_API_KEY) {
  console.error("Missing CRON_API_KEY for process-workflow — cron calls will be rejected");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SheetValuesResponse = {
  values?: string[][];
};

function parseList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizePlatform(p: string): "youtube" | "facebook" | "instagram" | "tiktok" | null {
  const v = p.toLowerCase();
  if (v === "youtube") return "youtube";
  if (v === "facebook") return "facebook";
  if (v === "instagram") return "instagram";
  if (v === "tiktok") return "tiktok";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");

  const isCronKey = CRON_API_KEY && bearerToken === CRON_API_KEY;
  const isServiceRole = bearerToken === SUPABASE_SERVICE_ROLE_KEY || isCronKey;

  let isSessionValid = false;
  if (!isServiceRole) {
    const adminToken = req.headers.get("x-admin-token");
    if (adminToken) {
      const { data: session } = await supabase
        .from("sessions")
        .select("id")
        .eq("token", adminToken)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();
      isSessionValid = !!session;
    }
  }

  if (!isServiceRole && !isSessionValid) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let workflowId: string | undefined;
  let isManualRun = false;
  try {
    const body = await req.json().catch(() => null);
    workflowId = body?.workflowId;
    isManualRun = !!workflowId;
  } catch {
    // ignore invalid JSON when called without body
  }

  // Clean up expired locks
  await supabase.from("workflow_locks").delete().lt("expires_at", new Date().toISOString());

  // Global processing lock — only one invocation runs at a time
  const globalLockKey = "global-workflow-processing";
  const { error: globalLockError } = await supabase.from("workflow_locks").insert({
    lock_key: globalLockKey,
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });

  if (globalLockError) {
    if (isManualRun) {
      return json({ error: "Another workflow is currently running. Please wait for it to complete." }, 409);
    }
    console.log("Global lock held by another invocation, exiting");
    return json({ message: "Another workflow is currently running. Please wait." });
  }
  console.log("Global processing lock acquired");

  let globalLockReleased = false;
  function releaseGlobalLock() {
    if (globalLockReleased) return;
    globalLockReleased = true;
    supabase.from("workflow_locks").delete().eq("lock_key", globalLockKey).then().catch(() => {});
  }

  try {

  const filters: Record<string, unknown> = { is_active: true };
  if (workflowId) {
    filters.id = workflowId;
  }

  const { data: workflows, error: wfError } = await supabase
    .from("workflows")
    .select("*")
    .match(filters);

  if (wfError) {
    console.error("Failed to fetch workflows", wfError);
    return json({ error: wfError.message }, 500);
  }

  const list = (workflows as any[] | null) ?? [];
  if (list.length === 0) {
    return json({ processed: 0, workflows_triggered: 0, errors: [] });
  }

  const errors: string[] = [];
  let totalProcessedVideos = 0;
  let workflowsTriggered = 0;

  async function getDriveToken(userId: string, driveAccountId?: string | null): Promise<string | null> {
    let query = supabase
      .from("connected_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", "google_drive")
      .eq("is_connected", true);

    if (driveAccountId) {
      query = query.eq("id", driveAccountId);
    }

    const { data: driveAccount, error: daError } = await query.maybeSingle();

    if (daError || !driveAccount) {
      console.warn(`No Google Drive connected for user ${userId}${driveAccountId ? ` (id=${driveAccountId})` : ""}`);
      return null;
    }

    const tokenExpiry = driveAccount.token_expiry ? new Date(driveAccount.token_expiry) : null;
    if (tokenExpiry && tokenExpiry.getTime() - Date.now() < 5 * 60 * 1000) {
      // Token expiring soon — refresh it
      const rawRefresh = await decrypt(driveAccount.refresh_token as string);
      if (rawRefresh) {
        try {
          const refreshUrl = `${SUPABASE_URL}/functions/v1/google-drive-auth?action=refresh&user_id=${userId}${driveAccountId ? `&account_id=${driveAccountId}` : ""}`;
          const refreshRes = await fetch(
            refreshUrl,
            { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
          );
          if (refreshRes.ok) {
            // Re-fetch the updated token
            let refreshQuery = supabase
              .from("connected_accounts")
              .select("access_token")
              .eq("user_id", userId)
              .eq("platform", "google_drive");
            if (driveAccountId) {
              refreshQuery = refreshQuery.eq("id", driveAccountId);
            }
            const { data: refreshed } = await refreshQuery.single();
            if (refreshed?.access_token) return await decrypt(refreshed.access_token as string);
          }
        } catch (e) {
          console.warn(`Drive token refresh failed for user ${userId}:`, e);
        }
      }
    }

    return await decrypt(driveAccount.access_token as string);
  }

  // Use UTC time directly for scheduling
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  for (const wf of list) {
    const sheetId: string | undefined =
      wf.sheet_id || GOOGLE_FALLBACK_SHEET_ID;
    if (!sheetId) {
      errors.push(`Workflow ${wf.id} has no sheet_id and no GOOGLE_SHEET_ID fallback`);
      continue;
    }

    if (!isManualRun) {
      const schedulingMode = (wf.scheduling_mode as string) || "once_daily";

      if (schedulingMode === "custom_ranges") {
        // === CUSTOM RANGES: per-day hour ranges with random minute per range ===
        const todayDay = now.getUTCDay();
        const customSchedule = wf.custom_schedule as Record<string, { start: number; end: number }[]> | null;
        const todayRanges = customSchedule?.[todayDay.toString()] ?? [];
        if (todayRanges.length === 0) continue;

        const todayUtc = now.toISOString().slice(0, 10);
        let matched = false;
        const currentMinutes = utcHour * 60 + utcMinute;

        for (let ri = 0; ri < todayRanges.length; ri++) {
          const range = todayRanges[ri];
          const rangeWindowSize = Math.max(range.end - range.start, 1);

          // Deterministic random minute within this range (per range index)
          const seed = String(wf.id ?? "") + todayUtc + ri;
          let hash = 0;
          for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
          }
          const randomMinute = Math.abs(hash) % (rangeWindowSize * 60);
          const rangeStartMinutes = range.start * 60;
          const targetMinutes = rangeStartMinutes + randomMinute;

          console.log(
            `Workflow ${wf.name}: custom range #${ri} target ${Math.floor(targetMinutes / 60)}:${(targetMinutes % 60).toString().padStart(2, "0")} UTC, current ${utcHour}:${utcMinute}`,
          );

          if (currentMinutes >= targetMinutes - 1 && currentMinutes <= targetMinutes + 1) {
            matched = true;
            break;
          }
        }

        if (!matched) continue;

        // Dedup: skip if already triggered within 60 min
        if (wf.last_triggered_at) {
          const minutesSince = (now.getTime() - new Date(wf.last_triggered_at).getTime()) / 60000;
          if (minutesSince < 60) {
            console.log(`Workflow ${wf.name}: custom ranges last triggered ${Math.round(minutesSince)}min ago, skipping`);
            continue;
          }
        }
      } else {
        // Common for once_daily and interval: run_days check
        const runDays = (wf.run_days as number[] | null) ?? [0, 1, 2, 3, 4, 5, 6];
        const todayDay = now.getUTCDay();
        if (!runDays.includes(todayDay)) {
          console.log(`Workflow ${wf.name} not scheduled for today (UTC day ${todayDay}), run_days:`, runDays);
          continue;
        }

        if (schedulingMode === "interval") {
          // === INTERVAL: fire every N hours ===
          const runIntervalHours = (wf.run_interval_hours as number) ?? 2;

          if (wf.last_triggered_at) {
            const hoursSince = (now.getTime() - new Date(wf.last_triggered_at).getTime()) / 3600000;
            if (hoursSince + (1 / 60) < runIntervalHours) {
              console.log(`Workflow ${wf.name}: last triggered ${hoursSince.toFixed(1)}h ago, skipping`);
              continue;
            }
          }
        } else {
          // === ONCE-DAILY: fire once per day on first cron tick ===
          const lastTriggered = wf.last_triggered_at ? new Date(wf.last_triggered_at) : null;
          const todayUTC = now.toISOString().slice(0, 10);
          const lastTriggeredDate = lastTriggered ? lastTriggered.toISOString().slice(0, 10) : null;

          if (lastTriggeredDate === todayUTC) {
            console.log(`Workflow ${wf.name} already triggered today, skipping`);
            continue;
          }
        }
      }
    }

    const googleToken = await getDriveToken(wf.user_id, wf.drive_account_id);
    if (!googleToken) {
      errors.push(`No Google Drive connected for workflow ${wf.id} (user ${wf.user_id})`);
      continue;
    }

    // Read sheet
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1`,
      { headers: { Authorization: `Bearer ${googleToken}` } },
    );

    if (!sheetRes.ok) {
      const text = await sheetRes.text();
      console.error("Failed to read sheet", sheetRes.status, text);
      errors.push(`Failed to read sheet for workflow ${wf.id}: ${sheetRes.status}`);
      continue;
    }

      const sheetData = (await sheetRes.json()) as SheetValuesResponse;
      const rows = sheetData.values ?? [];
      console.log(`Sheet rows count: ${rows.length}, headers: ${JSON.stringify(rows[0] ?? [])}`);
      if (rows.length < 2) {
        console.log(`Sheet for workflow ${wf.name} has fewer than 2 rows, skipping`);
        continue;
      }

     // Update trigger tracking now that we know we can read the sheet
     const triggerUpdate = isManualRun
       ? { last_manual_triggered_at: new Date().toISOString() }
       : { last_triggered_at: new Date().toISOString() };
     const { error: triggerError } = await supabase
       .from("workflows")
       .update(triggerUpdate)
       .eq("id", wf.id);
     if (triggerError) {
       console.error("Failed to update trigger time", wf.id, triggerError);
       errors.push(
         `Failed to claim workflow ${wf.id}: ${triggerError.message}`,
       );
       continue;
     }

      const headers = rows[0] ?? [];
      const headerIndex: Record<string, number> = {};
      headers.forEach((h, idx) => { 
        const key = h.toLowerCase();
        if (!(key in headerIndex)) headerIndex[key] = idx;
      });
      console.log(`Header index for workflow ${wf.name}: ${JSON.stringify(headerIndex)}`);

     const mediaType = (wf as any).media_type ?? "video";
     const isImageWorkflow = mediaType === "image";
     const urlColumn = isImageWorkflow ? "image_url" : "video_url";
     const urlIdx = headerIndex[urlColumn];
     const titleIdx = headerIndex["title"];
     const ytTitleIdx = headerIndex["yt_video_title"];
     const ytDescIdx = headerIndex["yt_video_description"];
      const fbIgCaptionIdx = isImageWorkflow
        ? headerIndex["image_fb_ig_caption"]
        : headerIndex["fb_ig_caption"];
     const platformsIdx = headerIndex["platforms"];
     const statusIdx = headerIndex["status"];
     console.log(`Columns for ${wf.name}: urlColumn=${urlColumn}, urlIdx=${urlIdx}, statusIdx=${statusIdx}`);
      const ytChannelsIdx = headerIndex["youtube_channels"];
      const fbPagesIdx = headerIndex["facebook_pages"];
      const tiktokCaptionIdx = headerIndex["tiktok_caption"];

    if (urlIdx === undefined || statusIdx === undefined) {
      errors.push(`Sheet for workflow ${wf.id} is missing required columns (${urlColumn}/status)`);
      continue;
    }

    const dataRows = rows.slice(1);
    const readyRows: { row: string[]; rowIndex: number }[] = [];

    console.log(`Data rows count for workflow ${wf.name}: ${dataRows.length}`);
    dataRows.forEach((row, i) => {
      const statusVal = row[statusIdx]?.toLowerCase().trim();
      console.log(`Row ${i + 2}: status value = "${row[statusIdx]}", trimmed = "${statusVal}", match = ${statusVal === "ready to post"}`);
      if (statusVal === "ready to post") {
        readyRows.push({ row, rowIndex: i + 2 });
      }
    });

    console.log(`Ready rows for workflow ${wf.name}: ${readyRows.length}`);
    if (readyRows.length === 0) {
      console.log(`No ready rows found for workflow ${wf.name}, skipping`);
      continue;
    }

    const runIntervalHours = (wf.run_interval_hours as number) ?? 1;
    const videosPerRun = (wf.videos_per_run as number) ?? 1;
    const toProcess = readyRows.slice(0, videosPerRun);
    let workflowVideoCount = 0;

      for (const { row, rowIndex } of toProcess) {
        try {
          const rawUrl = row[urlIdx];
          if (!rawUrl) {
            errors.push(`Row ${rowIndex}: empty ${urlColumn}`);
            continue;
          }

          const isMegaPublic = rawUrl.includes("mega.nz/");
          const isMegaAccount = rawUrl.startsWith("mega:");
          let driveDownloadUrl: string | undefined;
          let megaUrl: string | undefined;
          let megaFileName: string | undefined;
          let megaAccountId: string | undefined;
          let storedFileUrl: string;
          let videoDisplayName: string;

          if (isMegaAccount) {
            megaFileName = rawUrl.slice(5).trim();
            if (!megaFileName) {
              errors.push(`Row ${rowIndex}: empty filename after mega:`);
              continue;
            }
            const { data: megaAccount } = await supabase
              .from("connected_accounts")
              .select("id")
              .eq("user_id", wf.user_id)
              .eq("platform", "mega")
              .eq("is_connected", true)
              .maybeSingle();
            if (!megaAccount) {
              errors.push(`Row ${rowIndex}: no Mega account connected for user ${wf.user_id}`);
              continue;
            }
            megaAccountId = megaAccount.id;
            storedFileUrl = `mega:${megaFileName}`;
            videoDisplayName = megaFileName.replace(/\.[^/.]+$/, "");
          } else if (isMegaPublic) {
            megaUrl = rawUrl;
            storedFileUrl = rawUrl;
            videoDisplayName = `mega-video-${rowIndex}`;
          } else {
           const match = rawUrl.match(/\/d\/([^/]+)/);
           const fileId = match?.[1];
           if (!fileId) {
             errors.push(`Row ${rowIndex}: could not extract fileId from Drive URL: ${rawUrl}`);
             continue;
           }
           driveDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
           storedFileUrl = driveDownloadUrl;
           const title = titleIdx !== undefined ? row[titleIdx] || "" : "";
           const ytVideoTitle = ytTitleIdx !== undefined && row[ytTitleIdx] ? row[ytTitleIdx] : "";
           videoDisplayName = ytVideoTitle || title || `workflow-video-${fileId}`;
         }

         const baseName = videoDisplayName.replace(/\.(mp4|mov|jpg|jpeg|png)$/i, "");
         const fileExt = isImageWorkflow ? ".jpg" : ".mp4";
         const fileName = `${baseName}${fileExt}`;

         const currentUserId = wf.user_id;
        if (!currentUserId) {
          errors.push(`Row ${rowIndex}: workflow has no user_id, skipping`);
          continue;
        }
        const { data: videoRecord, error: videoError } = await supabase
          .from("videos")
          .insert({
            user_id: currentUserId,
            title: videoDisplayName,
            file_url: storedFileUrl,
            media_type: mediaType,
          })
          .select("id")
          .single();

        if (videoError || !videoRecord) {
          errors.push(`Row ${rowIndex}: failed to insert video: ${videoError?.message || "no record returned"}`);
          continue;
        }

        // Determine platforms
        let platforms: ("youtube" | "facebook" | "instagram" | "tiktok")[] = [];
        const rowPlatformsRaw = platformsIdx !== undefined ? row[platformsIdx] : "";
        if (rowPlatformsRaw) {
          const parsed = parseList(rowPlatformsRaw)
            .map(normalizePlatform)
            .filter((p): p is "youtube" | "facebook" | "instagram" | "tiktok" => !!p);
          platforms = parsed;
        } else if (Array.isArray(wf.platforms)) {
          const parsed = (wf.platforms as string[])
            .map(normalizePlatform)
            .filter((p): p is "youtube" | "facebook" | "instagram" | "tiktok" => !!p);
          platforms = parsed;
        }

        if (platforms.length === 0) {
          errors.push(`Row ${rowIndex}: no platforms resolved`);
          continue;
        }

        const rowYtChannels = ytChannelsIdx !== undefined ? parseList(row[ytChannelsIdx]) : [];
        const rowFbPages = fbPagesIdx !== undefined ? parseList(row[fbPagesIdx]) : [];

        const ytAccounts = rowYtChannels.length ? rowYtChannels : (wf.youtube_channel_ids ?? []);
        const fbAccounts = rowFbPages.length ? rowFbPages : (wf.facebook_page_ids ?? []);
        const igAccounts = wf.instagram_account_ids ?? [];
        const ttAccounts = (wf as any).tiktok_account_ids ?? [];

        if (isImageWorkflow) {
          platforms = platforms.filter((p) => p !== "youtube" && p !== "tiktok");
        }

        const postsPayload: any[] = [];
        const nowIso = new Date().toISOString();

        for (const p of platforms) {
          let slotIndex = 0;
          if (p === "youtube") {
            for (const accountId of ytAccounts) {
              const ytCaption = ytDescIdx !== undefined && row[ytDescIdx] ? row[ytDescIdx] : "";
              postsPayload.push({
                user_id: currentUserId,
                video_id: videoRecord.id,
                platform: "youtube",
                account_id: accountId,
                caption: ytCaption,
                hashtags: null,
                scheduled_at: nowIso,
                status: "processing",
                captions_enabled: true,
                contains_altered_content: wf.youtube_altered_content ?? true,
                metadata: { youtube_video_title: ytVideoTitle },
              });
              slotIndex++;
            }
          } else if (p === "facebook") {
            for (const accountId of fbAccounts) {
              const fbCaption = fbIgCaptionIdx !== undefined && row[fbIgCaptionIdx] ? row[fbIgCaptionIdx] : "";
              postsPayload.push({
                user_id: currentUserId,
                video_id: videoRecord.id,
                platform: "facebook",
                account_id: accountId,
                caption: fbCaption,
                hashtags: null,
                scheduled_at: nowIso,
                status: "processing",
                captions_enabled: true,
              });
              slotIndex++;
            }
          } else if (p === "instagram") {
            for (const accountId of igAccounts) {
              const igCaption = fbIgCaptionIdx !== undefined && row[fbIgCaptionIdx] ? row[fbIgCaptionIdx] : "";
              postsPayload.push({
                user_id: currentUserId,
                video_id: videoRecord.id,
                platform: "instagram",
                account_id: accountId,
                caption: igCaption,
                hashtags: null,
                scheduled_at: nowIso,
                status: "processing",
                captions_enabled: true,
              });
              slotIndex++;
            }
          } else if (p === "tiktok") {
            for (const accountId of ttAccounts) {
              const ttCaption = tiktokCaptionIdx !== undefined && row[tiktokCaptionIdx] ? row[tiktokCaptionIdx] : "";
              postsPayload.push({
                user_id: currentUserId,
                video_id: videoRecord.id,
                platform: "tiktok",
                account_id: accountId,
                caption: ttCaption,
                hashtags: null,
                scheduled_at: nowIso,
                status: "processing",
                captions_enabled: true,
              });
              slotIndex++;
            }
          }
        }

        if (postsPayload.length === 0) {
          errors.push(`Row ${rowIndex}: no accounts resolved for platforms, posts payload empty`);
          continue;
        }

        const { data: insertedPosts, error: postsError } = await supabase
          .from("posts")
          .insert(postsPayload)
          .select("id, platform, account_id, status");

        if (postsError || !insertedPosts) {
          errors.push(`Row ${rowIndex}: failed to insert posts: ${postsError?.message || "no records returned"}`);
          continue;
        }

        // Store sheet info in post metadata before triggering uploads
        const { error: metadataUpdateError } = await supabase
          .from("posts")
          .update({
            metadata: {
              ...((insertedPosts as any[])[0]?.metadata || {}),
              sheet_id: sheetId,
              sheet_row_index: rowIndex,
              sheet_col_index: statusIdx,
            },
          })
          .in("id", (insertedPosts as { id: string }[]).map((p) => p.id));

        if (metadataUpdateError) {
          console.error("Failed to update post metadata with sheet info", metadataUpdateError);
        }

        // Kick off uploads via existing Edge Functions (fire-and-forget) — only for immediate slot
        const filePayload: Record<string, unknown> = { postId: "" };
        if (isMegaAccount) {
          filePayload.megaFileName = megaFileName;
          filePayload.megaAccountId = megaAccountId;
        } else if (isMegaPublic) {
          filePayload.megaUrl = megaUrl;
        } else {
          filePayload.driveDownloadUrl = driveDownloadUrl;
          filePayload.googleAccessToken = googleToken;
        }

        for (const post of insertedPosts as { id: string; platform: string; account_id: string | null; status: string }[]) {
          if (post.status !== "processing") continue;
          const body = { ...filePayload, postId: post.id };
          if (post.platform === "youtube") {
            void fetch(`${SUPABASE_URL}/functions/v1/youtube-upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_SERVICE_ROLE_KEY!,
              },
              body: JSON.stringify(body),
            });
          } else if (post.platform === "facebook") {
            void fetch(`${SUPABASE_URL}/functions/v1/facebook-upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_SERVICE_ROLE_KEY!,
              },
              body: JSON.stringify(body),
            });
          } else if (post.platform === "instagram") {
            void fetch(`${SUPABASE_URL}/functions/v1/instagram-upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_SERVICE_ROLE_KEY!,
              },
              body: JSON.stringify(body),
            });
          } else if (post.platform === "tiktok") {
            void fetch(`${SUPABASE_URL}/functions/v1/tiktok-upload`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_SERVICE_ROLE_KEY!,
              },
              body: JSON.stringify(body),
            });
          }
        }

        if (wf.post_as_story && !isImageWorkflow) {
          // Generate a short-lived get-file proxy URL for the story
          let storyVideoUrl: string;
          if (isMegaAccount) {
            const storyToken = await encrypt(JSON.stringify({
              megaFileName,
              megaAccountId,
              exp: Date.now() + 15 * 60 * 1000,
            }));
            storyVideoUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(storyToken)}`;
          } else if (isMegaPublic) {
            const storyToken = await encrypt(JSON.stringify({
              megaUrl,
              exp: Date.now() + 15 * 60 * 1000,
            }));
            storyVideoUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(storyToken)}`;
          } else {
            const storyToken = await encrypt(JSON.stringify({
              driveUrl: driveDownloadUrl,
              driveToken: googleToken,
              exp: Date.now() + 15 * 60 * 1000,
            }));
            storyVideoUrl = `${SUPABASE_URL}/functions/v1/get-file?token=${encodeURIComponent(storyToken)}`;
          }
          const usedStoryTokens = new Set<string>();

            for (const post of insertedPosts as { id: string; platform: string; account_id: string | null }[]) {
              if (post.platform === "facebook" && post.account_id) {
                const { data: fbAcc } = await supabase
                  .from("connected_accounts")
                  .select("access_token")
                  .eq("account_id", post.account_id)
                  .eq("platform", "facebook")
                  .single();

                 if (fbAcc?.access_token) {
                    const rawFbToken = await decrypt(fbAcc.access_token);
                    if (!usedStoryTokens.has(rawFbToken)) {
                      usedStoryTokens.add(rawFbToken);
                      void fetch(`${SUPABASE_URL}/functions/v1/post-story`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        },
                        body: JSON.stringify({
                          platform: "facebook",
                          accountId: post.account_id,
                          videoUrl: storyVideoUrl,
                          accessToken: rawFbToken,
                          mediaType,
                        }),
                      });
                    }
                 }
              }

              if (post.platform === "instagram") {
                if (!post.account_id) {
                  console.warn("Instagram story skipped: missing account_id for post", post.id);
                  continue;
                }
                const { data: igAcc } = await supabase
                  .from("connected_accounts")
                  .select("access_token")
                  .eq("account_id", post.account_id)
                  .eq("platform", "instagram")
                  .single();

                 if (igAcc?.access_token) {
                    const rawIgToken = await decrypt(igAcc.access_token);
                    // Insert a story post row to track the story outcome
                    const { data: storyPost } = await supabase
                      .from("posts")
                      .insert({
                        user_id: currentUserId,
                        video_id: videoRecord.id,
                        platform: "instagram",
                        account_id: post.account_id,
                        caption: "",
                        hashtags: null,
                        scheduled_at: null,
                        status: "publishing",
                        captions_enabled: true,
                        post_type: "story",
                      })
                      .select("id")
                      .single();

                    if (storyPost) {
                      void fetch(`${SUPABASE_URL}/functions/v1/post-story`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        },
                        body: JSON.stringify({
                          platform: "instagram",
                          accountId: post.account_id,
                          videoUrl: storyVideoUrl,
                          accessToken: rawIgToken,
                          mediaType,
                          postId: storyPost.id,
                        }),
                      });
                    }
                  }
              }
          }
        }

        workflowVideoCount++;
      } catch (err) {
        console.error("Error processing sheet row", err);
        errors.push(`Row processing failed for workflow ${wf.id}: ${
          err instanceof Error ? err.message : String(err)
        }`);
      }
    }

    if (workflowVideoCount > 0) {
      totalProcessedVideos += workflowVideoCount;
      workflowsTriggered++;

      const { error: updateError } = await supabase
        .from("workflows")
        .update({ total_posted: (wf.total_posted ?? 0) + workflowVideoCount })
        .eq("id", wf.id);

      if (updateError) {
        console.error("Failed to update workflow stats", updateError);
        errors.push(`Failed to update stats for workflow ${wf.id}: ${updateError.message}`);
      }
    }
  }

  // Release global manual run lock if was manual run
  if (isManualRun) {
    try {
      await supabase.from("workflow_locks").delete().eq("lock_key", "manual-workflow-global-running");
      console.log("Global manual run lock released");
    } catch (e) {
      console.error("Failed to release manual lock:", e);
    }
  }

  return json({
    processed: totalProcessedVideos,
    workflows_triggered: workflowsTriggered,
    errors,
  });
  } catch (err) {
    console.error("process-workflow error", err);

    // Release global manual run lock on error
    if (isManualRun) {
      try {
        await supabase.from("workflow_locks").delete().eq("lock_key", "manual-workflow-global-running");
      } catch (e) {
        // ignore
      }
    }

    return json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        processed: 0,
        workflows_triggered: 0,
        errors: [],
      },
      500,
    );
  } finally {
    releaseGlobalLock();
  }
});




