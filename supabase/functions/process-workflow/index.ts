import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { decrypt } from "../_shared/crypto.ts";
import { fileProxyUrl } from "../_shared/get-file-token.ts";
import { driveMediaUrl, getDriveToken, type DriveTokenContext } from "../_shared/google-drive.ts";
import { createRequestAuthorizer, createSessionLookup } from "../_shared/auth.ts";
import { skipReason, type ScheduledWorkflow } from "../_shared/workflow-schedule.ts";
import { closeWorkflowRun, describeRun, maintainWorkflowRuns, openWorkflowRun } from "../_shared/workflow-runs.ts";
import { readR2Config } from "../_shared/r2.ts";
import { SecretProblem } from "../_shared/secrets.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
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

const authorize = createRequestAuthorizer({
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  cronApiKey: CRON_API_KEY,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
  sessionLookup: createSessionLookup(supabase),
});

const driveTokenCtx: DriveTokenContext = {
  supabase,
  decrypt,
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  supabaseUrl: SUPABASE_URL!,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY!,
};

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

function normalizePlatform(p: string): "youtube" | "facebook" | "instagram" | "tiktok" | "linkedin" | null {
  const v = p.toLowerCase();
  if (v === "youtube") return "youtube";
  if (v === "facebook") return "facebook";
  if (v === "instagram") return "instagram";
  if (v === "tiktok") return "tiktok";
  if (v === "linkedin") return "linkedin";
  return null;
}

// Long enough that one row cannot outlive the lock, short enough that a run
// killed mid-flight frees its workflow again within a few minutes.
const WORKFLOW_LOCK_MINUTES = 15;

function lockExpiry(): string {
  return new Date(Date.now() + WORKFLOW_LOCK_MINUTES * 60 * 1000).toISOString();
}

/**
 * Takes the run lock of one workflow.
 *
 * The insert is the lock: two runs of the same workflow cannot both win, while
 * runs of different workflows do not wait for each other.
 */
async function takeWorkflowLock(workflowId: string): Promise<boolean> {
  const { error } = await supabase.from("workflow_locks").insert({
    lock_key: `workflow:${workflowId}`,
    locked_at: new Date().toISOString(),
    expires_at: lockExpiry(),
  });
  return !error;
}

/** Keeps the lock alive while the run is still working through its rows. */
async function renewWorkflowLock(workflowId: string): Promise<void> {
  const { error } = await supabase
    .from("workflow_locks")
    .update({ expires_at: lockExpiry() })
    .eq("lock_key", `workflow:${workflowId}`);
  if (error) console.error(`Failed to renew the run lock of workflow ${workflowId}`, error);
}

async function releaseWorkflowLock(workflowId: string): Promise<void> {
  const { error } = await supabase
    .from("workflow_locks")
    .delete()
    .eq("lock_key", `workflow:${workflowId}`);
  if (error) console.error(`Failed to release the run lock of workflow ${workflowId}`, error);
}

type HeldRun = {
  id: string | null;
  errorsSeen: number;
  report: { rows: number; posts: number } | null;
  failed: boolean;
};

async function endHeldRun(held: HeldRun, errors: string[]): Promise<void> {
  const runId = held.id;
  const outcome = describeRun(held.report, errors.slice(held.errorsSeen), held.failed);
  held.id = null;
  held.report = null;
  held.failed = false;
  held.errorsSeen = errors.length;
  await closeWorkflowRun(supabase, runId, outcome);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await authorize(req);
  if (!auth.allowed) {
    return json({ error: "Unauthorized" }, 401);
  }
  // A signed-in caller runs its own workflow; the cron and the service key
  // have no user and run whatever they name.
  const sessionUserId = auth.kind === "session" ? auth.userId : null;

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

  await maintainWorkflowRuns(supabase);

  const uploadPromises: Promise<void>[] = [];
  const functionStartMs = Date.now();
  // The workflow whose run lock this invocation holds, if any.
  let heldWorkflowId: string | null = null;
  const errors: string[] = [];
  const heldRun: HeldRun = { id: null, errorsSeen: 0, report: null, failed: false };

  // R2 is a best-effort cache: without it the run keeps serving Drive URLs.
  // Read once per invocation so a key saved in the guided setup applies here.
  type R2Bucket = { client: S3Client; bucket: string; publicUrl: string };
  let r2Load: Promise<R2Bucket | null> | undefined;
  const r2Bucket = (): Promise<R2Bucket | null> =>
    r2Load ??= readR2Config(supabase)
      .then((config) => ({
        client: new S3Client({
          region: "auto",
          endpoint: config.endpoint,
          credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
        }),
        bucket: config.bucket,
        publicUrl: config.publicUrl,
      }))
      .catch((err) => {
        if (err instanceof SecretProblem) {
          console.error("R2 unavailable, keeping Drive URLs:", err.message);
          return null;
        }
        throw err;
      });

  try {

    const filters: Record<string, unknown> = { is_active: true };
    if (workflowId) {
      filters.id = workflowId;
      if (sessionUserId) filters.user_id = sessionUserId;
    }

    const { data: workflows, error: wfError } = await supabase
      .from("workflows")
      .select("*")
      .match(filters);

    if (wfError) {
      console.error("Failed to fetch workflows", wfError);
      return json({ error: "Could not load the workflows" }, 500);
    }

    const list = (workflows as any[] | null) ?? [];
    if (list.length === 0) {
      return json({ processed: 0, workflows_triggered: 0, errors: [] });
    }

    let totalProcessedVideos = 0;
    let workflowsTriggered = 0;

    // Use UTC time directly for scheduling
    const now = new Date();
    let sheetId: string | undefined;

    for (const wf of list) {
      // Released here rather than with a `finally` per workflow, so every
      // `continue` in the body below lets go of the previous lock.
      if (heldWorkflowId) {
        await endHeldRun(heldRun, errors);
        await releaseWorkflowLock(heldWorkflowId);
        heldWorkflowId = null;
      }

      if (wf.data_source !== 'flowpost') {
        sheetId = wf.sheet_id || GOOGLE_FALLBACK_SHEET_ID;
        if (!sheetId) {
          errors.push(`Workflow ${wf.id} has no sheet_id and no GOOGLE_SHEET_ID fallback`);
          continue;
        }
      }

      if (!isManualRun) {
        const reason = skipReason(wf as ScheduledWorkflow, now);
        if (reason) {
          console.log(`Workflow ${wf.name}: ${reason}`);
          continue;
        }
      }

      // A cron tick can overlap a manual run of the same workflow; other
      // workflows are free to run at the same time.
      if (!await takeWorkflowLock(wf.id)) {
        if (isManualRun) {
          return json({ error: "This workflow is already running. Please wait for it to complete." }, 409);
        }
        console.log(`Workflow ${wf.name} is already running, skipping`);
        continue;
      }
      heldWorkflowId = wf.id;
      heldRun.id = await openWorkflowRun(supabase, {
        workflowId: wf.id,
        triggeredBy: isManualRun ? "manual" : "cron",
      });
      heldRun.errorsSeen = errors.length;

      const googleToken = await getDriveToken(wf.user_id, wf.drive_account_id, driveTokenCtx);
      if (!googleToken) {
        errors.push(`No Google Drive connected for workflow ${wf.id} (user ${wf.user_id})`);
        continue;
      }

      // Determine data source: FlowPost workflow_items or Google Sheet
      let rows: string[][] = [];
      let sheetIdForMetadata: string | undefined;
      const workflowItemIdByRowIndex: Record<number, string> = {};

      if (wf.data_source === 'flowpost' && wf.drive_folder_id) {
        // FlowPost mode: read from workflow_items table where status = 'ready'
        const { data: items, error: itemsError } = await supabase
          .from("workflow_items")
          .select("*")
          .eq("workflow_id", wf.id)
          .eq("status", "ready")
          .order("sort_order");

        if (itemsError) {
          errors.push(`Failed to fetch workflow items for ${wf.id}: ${itemsError.message}`);
          continue;
        }

        if (!items || items.length === 0) {
          console.log(`No ready workflow items for workflow ${wf.name}, skipping`);
          continue;
        }

        // Build synthetic header + data rows matching the sheet format expected below
        const isImageWorkflow = (wf as any).media_type === "image";
        const urlCol = isImageWorkflow ? "image_url" : "video_url";
        const fbCaptionCol = isImageWorkflow ? "image_fb_ig_caption" : "fb_ig_caption";
        const headerRow = [urlCol, "title", "yt_video_title", "yt_video_description", fbCaptionCol, "tiktok_caption", "linkedin_caption", "platforms", "status"];
        const dataRows = items.map((item, idx) => {
          const rowIndex = idx + 2;
          workflowItemIdByRowIndex[rowIndex] = item.id;
          return [
            `https://drive.google.com/file/d/${item.drive_file_id}`,
            item.file_name ?? "",
            item.yt_video_title ?? "",
            item.yt_video_description ?? "",
            item.fb_ig_caption ?? "",
            item.tiktok_caption ?? "",
            item.linkedin_caption ?? "",
            (item.platforms_override ?? []).join(","),
            "ready to post",
          ];
        });
        rows = [headerRow, ...dataRows];
        console.log(`FlowPost items count: ${items.length} for workflow ${wf.name}`);
      } else {
        // Legacy mode: read from Google Sheet
        sheetIdForMetadata = sheetId;
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
        const fetchedRows = sheetData.values ?? [];
        console.log(`Sheet rows count: ${fetchedRows.length}, headers: ${JSON.stringify(fetchedRows[0] ?? [])}`);
        if (fetchedRows.length < 2) {
          console.log(`Sheet for workflow ${wf.name} has fewer than 2 rows, skipping`);
          continue;
        }
        rows = fetchedRows;
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
      const isCarouselWorkflow = mediaType === "carousel";
      const urlColumn = isImageWorkflow ? "image_url" : "video_url";
      const urlIdx = headerIndex[urlColumn];
      const titleIdx = headerIndex["title"];
      const ytTitleIdx = headerIndex["yt_video_title"];
      const ytDescIdx = headerIndex["yt_video_description"];
      const fbIgCaptionIdx = isImageWorkflow || isCarouselWorkflow
        ? headerIndex["image_fb_ig_caption"]
        : headerIndex["fb_ig_caption"];
      const platformsIdx = headerIndex["platforms"];
      const statusIdx = headerIndex["status"];
      console.log(`Columns for ${wf.name}: urlColumn=${urlColumn}, urlIdx=${urlIdx}, statusIdx=${statusIdx}`);
      const ytChannelsIdx = headerIndex["youtube_channels"];
      const fbPagesIdx = headerIndex["facebook_pages"];
      const tiktokCaptionIdx = headerIndex["tiktok_caption"];
      const linkedinCaptionIdx = headerIndex["linkedin_caption"];

      // Detect carousel image_url_N columns
      const carouselUrlColumns: { index: number; colIdx: number }[] = [];
      if (isCarouselWorkflow) {
        for (const [header, colIdx] of Object.entries(headerIndex)) {
          const match = header.match(/^image_url_(\d+)$/);
          if (match) carouselUrlColumns.push({ index: parseInt(match[1]), colIdx });
        }
        carouselUrlColumns.sort((a, b) => a.index - b.index);
        console.log(`Carousel columns for ${wf.name}:`, JSON.stringify(carouselUrlColumns.map(c => `image_url_${c.index}`)));
      }

      if (statusIdx === undefined) {
        errors.push(`Sheet for workflow ${wf.id} is missing required status column`);
        continue;
      }
      if (!isCarouselWorkflow && urlIdx === undefined) {
        errors.push(`Sheet for workflow ${wf.id} is missing required column (${urlColumn})`);
        continue;
      }
      if (isCarouselWorkflow && carouselUrlColumns.length < 2) {
        errors.push(`Sheet for workflow ${wf.id} needs at least 2 image_url_N columns for carousel`);
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

      heldRun.report = { rows: readyRows.length, posts: 0 };
      console.log(`Ready rows for workflow ${wf.name}: ${readyRows.length}`);
      if (readyRows.length === 0) {
        console.log(`No ready rows found for workflow ${wf.name}, skipping`);
        continue;
      }

      const videosPerRun = (wf.videos_per_run as number) ?? 1;
      const toProcess = readyRows.slice(0, videosPerRun);
      let workflowVideoCount = 0;

      for (const { row, rowIndex } of toProcess) {
        await renewWorkflowLock(wf.id);
        try {
          // === CAROUSEL PATH: process multiple image_url_N columns ===
          if (isCarouselWorkflow) {
            const carouselRawUrls: string[] = [];
            for (const cc of carouselUrlColumns) {
              const val = row[cc.colIdx]?.trim();
              if (val) carouselRawUrls.push(val);
            }
            if (carouselRawUrls.length < 2) {
              errors.push(`Row ${rowIndex}: carousel needs at least 2 images, got ${carouselRawUrls.length}`);
              continue;
            }

            const carouselVideoIds: string[] = [];
            let carouselError: string | null = null;

            for (let ci = 0; ci < carouselRawUrls.length; ci++) {
              const url = carouselRawUrls[ci];
              const isMegaPublic = url.includes("mega.nz/");
              const isMegaAccount = url.startsWith("mega:");
              let driveDownloadUrl: string | undefined;
              let megaUrl: string | undefined;
              let megaFileName: string | undefined;
              let megaAccountId: string | undefined;
              let storedFileUrl: string;
              let videoDisplayName: string;

              if (isMegaAccount) {
                megaFileName = url.slice(5).trim();
                if (!megaFileName) { carouselError = `Row ${rowIndex} carousel image ${ci + 1}: empty filename after mega:`; break; }
                const { data: megaAccount } = await supabase
                  .from("connected_accounts")
                  .select("id")
                  .eq("user_id", wf.user_id)
                  .eq("platform", "mega")
                  .eq("is_connected", true)
                  .maybeSingle();
                if (!megaAccount) { carouselError = `Row ${rowIndex}: no Mega account connected`; break; }
                megaAccountId = megaAccount.id;
                storedFileUrl = `mega:${megaFileName}`;
                videoDisplayName = megaFileName.replace(/\.[^/.]+$/, "");
              } else if (isMegaPublic) {
                megaUrl = url;
                storedFileUrl = url;
                videoDisplayName = `carousel-${rowIndex}-${ci + 1}`;
              } else {
                const match = url.match(/\/d\/([^/]+)/);
                const fileId = match?.[1];
                if (!fileId) { carouselError = `Row ${rowIndex} carousel image ${ci + 1}: could not extract Drive file ID`; break; }
                driveDownloadUrl = driveMediaUrl(fileId);
                storedFileUrl = driveDownloadUrl;
                videoDisplayName = `carousel-${rowIndex}-${ci + 1}`;
              }

              const { data: videoRecord, error: videoError } = await supabase
                .from("videos")
                .insert({
                  user_id: wf.user_id,
                  title: videoDisplayName,
                  file_url: storedFileUrl,
                  media_type: "image",
                })
                .select("id")
                .single();

              if (videoError || !videoRecord) {
                carouselError = `Row ${rowIndex} carousel image ${ci + 1}: failed to insert video: ${videoError?.message || "no record"}`;
                break;
              }
              carouselVideoIds.push(videoRecord.id);

              // R2 upload for Drive-sourced carousel children
              const carouselR2 = await r2Bucket();
              if (!isMegaAccount && !isMegaPublic && driveDownloadUrl && googleToken && carouselR2) {
                try {
                  const driveRes = await fetch(driveDownloadUrl, {
                    headers: { Authorization: `Bearer ${googleToken}` },
                  });
                  if (driveRes.ok) {
                    const key = `${wf.user_id}/${videoRecord.id}.jpg`;
                    const uploadUrl = await getSignedUrl(carouselR2.client, new PutObjectCommand({
                      Bucket: carouselR2.bucket,
                      Key: key,
                      ContentType: "image/jpeg",
                    }), { expiresIn: 600 });
                    const putRes = await fetch(uploadUrl, {
                      method: "PUT",
                      headers: { "Content-Type": "image/jpeg" },
                      body: driveRes.body,
                      // @ts-expect-error duplex required for streaming request body
                      duplex: "half",
                    });
                    if (putRes.ok) {
                      const r2Url = `https://${carouselR2.publicUrl}/${key}`;
                      await supabase.from("videos").update({ file_url: r2Url }).eq("id", videoRecord.id);
                    }
                  }
                } catch (r2Err) {
                  console.error(`R2 upload failed for carousel child ${videoRecord.id}:`, r2Err);
                }
              }
            }

            if (carouselError) {
              errors.push(carouselError);
              continue;
            }

            // Create Instagram post for the carousel
            const igCaption = fbIgCaptionIdx !== undefined && row[fbIgCaptionIdx] ? row[fbIgCaptionIdx] : "";
            const igAccounts = wf.instagram_account_ids ?? [];
            if (!igAccounts.length) {
              errors.push(`Row ${rowIndex}: no Instagram accounts configured for carousel`);
              continue;
            }

            const nowIso = new Date().toISOString();
            const postsPayload: any[] = igAccounts.map((accountId: string) => ({
              user_id: wf.user_id,
              video_id: carouselVideoIds[0],
              platform: "instagram",
              account_id: accountId,
              caption: igCaption,
              hashtags: null,
              scheduled_at: nowIso,
              status: "processing",
              captions_enabled: true,
              workflow_item_id: workflowItemIdByRowIndex[rowIndex],
              metadata: { carousel: true },
            }));

            const { data: insertedPosts, error: postsError } = await supabase
              .from("posts")
              .insert(postsPayload)
              .select("id, platform, account_id, status");

            if (postsError || !insertedPosts) {
              errors.push(`Row ${rowIndex}: failed to insert carousel posts: ${postsError?.message || "no records"}`);
              continue;
            }

            heldRun.report.posts += insertedPosts.length;

            // Insert carousel_items
            for (const post of insertedPosts as { id: string }[]) {
              const carouselItemPayload = carouselVideoIds.map((videoId, i) => ({
                post_id: post.id,
                video_id: videoId,
                sort_order: i,
              }));
              const { error: ciError } = await supabase
                .from("carousel_items")
                .insert(carouselItemPayload);
              if (ciError) {
                console.error(`Failed to insert carousel_items for post ${post.id}:`, ciError);
              }
            }

            // Store sheet metadata
            const { error: metadataUpdateError } = await supabase
              .from("posts")
              .update({
                metadata: { carousel: true, sheet_id: sheetId, sheet_row_index: rowIndex, sheet_col_index: statusIdx },
              })
              .in("id", (insertedPosts as { id: string }[]).map((p) => p.id));
            if (metadataUpdateError) {
              console.error("Failed to update carousel post metadata:", metadataUpdateError);
            }

            // Mark workflow_item as posted
            const postedItemId = workflowItemIdByRowIndex[rowIndex];
            if (postedItemId) {
              await supabase.from("workflow_items").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", postedItemId);
            }

            // Queue carousel upload (awaited for cron runs at the end)
            for (const post of insertedPosts as { id: string; platform: string; status: string }[]) {
              if (post.status !== "processing") continue;
              const carPostId = post.id;
              uploadPromises.push(
                fetch(`${SUPABASE_URL}/functions/v1/instagram-upload`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    apikey: SUPABASE_SERVICE_ROLE_KEY!,
                  },
                  body: JSON.stringify({ postId: carPostId, carousel: true }),
                })
                  .then(async (res) => {
                    if (!res.ok) console.error(`Carousel upload failed for post ${carPostId}: ${res.status}`);
                  })
                  .catch(async () => {
                    console.error(`Carousel upload fetch failed for post ${carPostId}`);
                    const { error: markFailedError } = await supabase
                      .from("posts")
                      .update({ status: "failed" })
                      .eq("id", carPostId);
                    if (markFailedError) console.error("process-workflow: failed to mark carousel post failed", markFailedError);
                  }),
              );
            }

            workflowVideoCount += carouselVideoIds.length;
            continue;
          }

          // === SINGLE MEDIA PATH (video / image) ===
          const rawUrl = row[urlIdx];
          if (!rawUrl) {
            errors.push(`Row ${rowIndex}: empty ${urlColumn}`);
            continue;
          }

          const isMegaPublic = rawUrl.includes("mega.nz/");
          const isMegaAccount = rawUrl.startsWith("mega:");
          let driveDownloadUrl: string | undefined;
          let ytVideoTitle: string | undefined;
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
            driveDownloadUrl = driveMediaUrl(fileId);
            storedFileUrl = driveDownloadUrl;
            const title = titleIdx !== undefined ? row[titleIdx] || "" : "";
            ytVideoTitle = ytTitleIdx !== undefined && row[ytTitleIdx] ? row[ytTitleIdx] : "";
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

          // Upload Drive-sourced files to R2 for zero-egress serving
          let r2Succeeded = false;
          let r2Url: string | null = null;
          const mediaR2 = await r2Bucket();
          if (!isMegaAccount && !isMegaPublic && driveDownloadUrl && googleToken && mediaR2) {
            try {
              const driveRes = await fetch(driveDownloadUrl, {
                headers: { Authorization: `Bearer ${googleToken}` },
              });
              if (!driveRes.ok) {
                console.error(`Drive download failed for video ${videoRecord.id}: ${driveRes.status}`);
              } else {
                const key = `${currentUserId}/${videoRecord.id}${fileExt}`;
                const contentType = driveRes.headers.get("Content-Type") || "video/mp4";
                const uploadUrl = await getSignedUrl(mediaR2.client, new PutObjectCommand({
                  Bucket: mediaR2.bucket,
                  Key: key,
                  ContentType: contentType,
                }), { expiresIn: 600 });
                const putRes = await fetch(uploadUrl, {
                  method: "PUT",
                  headers: { "Content-Type": contentType },
                  body: driveRes.body,
                  // @ts-expect-error duplex required for streaming request body
                  duplex: "half",
                });
                if (!putRes.ok) {
                  throw new Error(`R2 PUT failed: ${putRes.status}`);
                }
                r2Url = `https://${mediaR2.publicUrl}/${key}`;
                const { error: r2UpdateError } = await supabase
                  .from("videos")
                  .update({ file_url: r2Url })
                  .eq("id", videoRecord.id);
                if (r2UpdateError) {
                  console.error(`Failed to update video file_url to R2 for ${videoRecord.id}:`, r2UpdateError);
                } else {
                  r2Succeeded = true;
                  console.log(`Cached video ${videoRecord.id} to R2: ${r2Url}`);
                }
              }
            } catch (r2Err) {
              console.error(`R2 upload failed for video ${videoRecord.id}:`, r2Err);
            }
          }

          // Determine platforms
          let platforms: ("youtube" | "facebook" | "instagram" | "tiktok" | "linkedin")[] = [];
          const rowPlatformsRaw = platformsIdx !== undefined ? row[platformsIdx] : "";
          if (rowPlatformsRaw) {
            const parsed = parseList(rowPlatformsRaw)
              .map(normalizePlatform)
              .filter((p): p is "youtube" | "facebook" | "instagram" | "tiktok" | "linkedin" => !!p);
            platforms = parsed;
          } else if (Array.isArray(wf.platforms)) {
            const parsed = (wf.platforms as string[])
              .map(normalizePlatform)
              .filter((p): p is "youtube" | "facebook" | "instagram" | "tiktok" | "linkedin" => !!p);
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
          const liAccounts = (wf as any).linkedin_account_ids ?? [];

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
                  workflow_item_id: workflowItemIdByRowIndex[rowIndex],
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
                  workflow_item_id: workflowItemIdByRowIndex[rowIndex],
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
                  workflow_item_id: workflowItemIdByRowIndex[rowIndex],
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
                  workflow_item_id: workflowItemIdByRowIndex[rowIndex],
                });
                slotIndex++;
              }
            } else if (p === "linkedin") {
              for (const accountId of liAccounts) {
                const liCaption = linkedinCaptionIdx !== undefined && row[linkedinCaptionIdx] ? row[linkedinCaptionIdx] : "";
                postsPayload.push({
                  user_id: currentUserId,
                  video_id: videoRecord.id,
                  platform: "linkedin",
                  account_id: accountId,
                  caption: liCaption,
                  hashtags: null,
                  scheduled_at: nowIso,
                  status: "processing",
                  captions_enabled: true,
                  workflow_item_id: workflowItemIdByRowIndex[rowIndex],
                });
                slotIndex++;
              }
            }
          }

          if (postsPayload.length === 0) {
            errors.push(`Row ${rowIndex}: no accounts resolved for platforms, posts payload empty`);
            continue;
          }

          // The insert below is all-or-nothing: one target already live in the
          // queue is refused by posts_one_live_per_target and takes every other
          // account's post with it. Drop the live targets first, in one query.
          const { data: livePosts, error: livePostsError } = await supabase
            .from("posts")
            .select("platform, account_id, post_type")
            .eq("user_id", currentUserId)
            .eq("video_id", videoRecord.id)
            .in("status", ["scheduled", "processing", "publishing"]);

          if (livePostsError) {
            errors.push(`Row ${rowIndex}: failed to read the live queue: ${livePostsError.message}`);
            continue;
          }

          const liveTargets = new Set(
            (livePosts ?? []).map((l: any) => `${l.platform}|${l.account_id ?? ""}|${l.post_type}`),
          );
          const newPosts = postsPayload
            .filter(
              (p: any) => !liveTargets.has(`${p.platform}|${p.account_id ?? ""}|${p.post_type ?? "feed"}`),
            )
            // Sheet info rides on the insert: a second update overwrites the
            // whole metadata column, which used to erase the keys the payload
            // itself carried (youtube_video_title among them).
            .map((p: any) => ({
              ...p,
              metadata: {
                ...(p.metadata || {}),
                sheet_id: sheetId,
                sheet_row_index: rowIndex,
                sheet_col_index: statusIdx,
              },
            }));
          if (newPosts.length < postsPayload.length) {
            console.log(
              `Row ${rowIndex}: skipped ${postsPayload.length - newPosts.length} post(s) already live in the queue`,
            );
          }
          let insertedPosts: {
            id: string;
            platform: string;
            account_id: string | null;
            status: string;
            post_type: string;
          }[];
          if (newPosts.length === 0) {
            // Nothing new, but the queue already holds this row's posts, so the
            // sheet status and the workflow item still have to be settled below.
            insertedPosts = [];
          } else {
            const { data, error } = await supabase
              .from("posts")
              .insert(newPosts)
              .select("id, platform, account_id, status, post_type");
            if (error || !data) {
              errors.push(`Row ${rowIndex}: failed to insert posts: ${error?.message || "no records returned"}`);
              continue;
            }
            insertedPosts = data;
          }

          heldRun.report.posts += insertedPosts.length;

          // For FlowPost mode, mark the workflow_item as posted
          const postedItemId = workflowItemIdByRowIndex[rowIndex];
          if (postedItemId) {
            const { error: itemUpdateError } = await supabase
              .from("workflow_items")
              .update({ status: "posted", posted_at: new Date().toISOString() })
              .eq("id", postedItemId);
            if (itemUpdateError) {
              console.error(`Failed to mark workflow_item ${postedItemId} as posted:`, itemUpdateError);
            }
          }

          // Queue upload per post (awaited for cron runs at the end)
          const filePayload: Record<string, unknown> = { postId: "" };
          if (isMegaAccount) {
            filePayload.megaFileName = megaFileName;
            filePayload.megaAccountId = megaAccountId;
          } else if (isMegaPublic) {
            filePayload.megaUrl = megaUrl;
          }
          // Always pass Drive credentials — needed for sheet status updates even when R2 succeeds
          if (driveDownloadUrl) filePayload.driveDownloadUrl = driveDownloadUrl;
          if (googleToken) filePayload.googleAccessToken = googleToken;

          for (const post of insertedPosts) {
            if (post.status !== "processing") continue;
            const body = { ...filePayload, postId: post.id };
            const pId = post.id;
            const pPlatform = post.platform;
            let uploadUrl: string;
            if (pPlatform === "youtube") uploadUrl = `${SUPABASE_URL}/functions/v1/youtube-upload`;
            else if (pPlatform === "facebook") uploadUrl = `${SUPABASE_URL}/functions/v1/facebook-upload`;
            else if (pPlatform === "instagram") uploadUrl = `${SUPABASE_URL}/functions/v1/instagram-upload`;
            else if (pPlatform === "tiktok") uploadUrl = `${SUPABASE_URL}/functions/v1/tiktok-upload`;
            else if (pPlatform === "linkedin") uploadUrl = `${SUPABASE_URL}/functions/v1/linkedin-upload`;
            else continue;
            uploadPromises.push(
              fetch(uploadUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  apikey: SUPABASE_SERVICE_ROLE_KEY!,
                },
                body: JSON.stringify(body),
              })
                .then(async (res) => {
                  if (!res.ok) console.error(`Upload failed for post ${pId} (${pPlatform}): ${res.status}`);
                })
                .catch(async () => {
                  console.error(`Upload fetch failed for post ${pId} (${pPlatform})`);
                  const { error: markFailedError } = await supabase
                    .from("posts")
                    .update({ status: "failed" })
                    .eq("id", pId);
                  if (markFailedError) console.error("process-workflow: failed to mark post failed", markFailedError);
                }),
            );
          }

          if (wf.post_as_story && !isImageWorkflow) {
            // Generate a short-lived get-file proxy URL for the story
            let storyVideoUrl: string | undefined;
            if (isMegaAccount) {
              storyVideoUrl = await fileProxyUrl({ megaFileName, megaAccountId }, currentUserId);
            } else if (isMegaPublic) {
              storyVideoUrl = await fileProxyUrl({ megaUrl }, currentUserId);
            } else if (r2Url) {
              // Drive source cached on R2 — use public URL directly
              storyVideoUrl = r2Url;
            } else {
              storyVideoUrl = await fileProxyUrl(
                { driveUrl: driveDownloadUrl, driveToken: googleToken },
                currentUserId,
              );
            }
            const usedStoryTokens = new Set<string>();

            for (const post of insertedPosts) {
              if (post.platform === "facebook" && post.account_id) {
                const { data: fbAcc } = await supabase
                  .from("connected_accounts")
                  .select("access_token")
                  .eq("user_id", currentUserId)
                  .eq("account_id", post.account_id)
                  .eq("platform", "facebook")
                  .single();

                if (fbAcc?.access_token) {
                  const rawFbToken = await decrypt(fbAcc.access_token);
                  if (!usedStoryTokens.has(rawFbToken)) {
                    usedStoryTokens.add(rawFbToken);
                    const fbStoryBody = JSON.stringify({
                      platform: "facebook",
                      accountId: post.account_id,
                      videoUrl: storyVideoUrl,
                      accessToken: rawFbToken,
                      mediaType,
                    });
                    uploadPromises.push(
                      fetch(`${SUPABASE_URL}/functions/v1/post-story`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        },
                        body: fbStoryBody,
                      })
                        .then(async (res) => {
                          if (!res.ok) console.error(`Facebook story upload failed: ${res.status}`);
                        })
                        .catch(async () => {
                          console.error("Facebook story upload fetch failed");
                        }),
                    );
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
                  .eq("user_id", currentUserId)
                  .eq("account_id", post.account_id)
                  .eq("platform", "instagram")
                  .single();

                if (igAcc?.access_token) {
                  const rawIgToken = await decrypt(igAcc.access_token);
                  // Insert a story post row to track the story outcome
                  const { data: storyPost, error: storyInsertError } = await supabase
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

                  if (storyInsertError || !storyPost) {
                    // A refused insert used to vanish here: the run report said
                    // the story was posted and no row existed to publish it.
                    if (storyInsertError?.code === "23505") {
                      console.log(
                        `Instagram story for account ${post.account_id} is already live in the queue, skipping`,
                      );
                    } else {
                      errors.push(
                        `Instagram story insert failed for account ${post.account_id}: ${storyInsertError?.message || "no record returned"}`,
                      );
                    }
                    continue;
                  }

                  heldRun.report.posts++;
                  const igStoryPId = storyPost.id;
                  uploadPromises.push(
                    fetch(`${SUPABASE_URL}/functions/v1/post-story`, {
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
                        postId: igStoryPId,
                      }),
                    })
                      .then(async (res) => {
                        if (!res.ok) console.error(`Instagram story upload failed for post ${igStoryPId}: ${res.status}`);
                      })
                      .catch(async () => {
                        console.error(`Instagram story upload fetch failed for post ${igStoryPId}`);
                        const { error: markFailedError } = await supabase
                          .from("posts")
                          .update({ status: "failed" })
                          .eq("id", igStoryPId);
                        if (markFailedError) console.error("process-workflow: failed to mark ig story post failed", markFailedError);
                      }),
                  );
                }
              }
            }
          }

          workflowVideoCount++;
        } catch (err) {
          console.error("Error processing sheet row", err);
          errors.push(`Row processing failed for workflow ${wf.id}: ${err instanceof Error ? err.message : String(err)
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
            `Failed to record trigger time for workflow ${wf.id}: ${triggerError.message}`,
          );
        }
      }
    }

    // Await all upload promises for cron runs (manual runs return immediately)
    if (!isManualRun && uploadPromises.length > 0) {
      const elapsed = Date.now() - functionStartMs;
      const budget = 140_000 - elapsed;
      if (budget > 5_000) {
        try {
          await Promise.race([
            Promise.allSettled(uploadPromises),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Upload wait timeout")), budget)),
          ]);
        } catch {
          console.warn(`Upload wait timed out after ${budget}ms — uploads continue as independent invocations`);
        }
      } else {
        console.warn(`Skipping upload await — only ${budget}ms remaining before timeout`);
      }
    }

    return json({
      processed: totalProcessedVideos,
      workflows_triggered: workflowsTriggered,
      errors,
    });
  } catch (err) {
    console.error("process-workflow error", err);
    heldRun.failed = true;
    errors.push(err instanceof Error ? err.message : "Unknown error");

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
    if (heldWorkflowId) {
      await endHeldRun(heldRun, errors);
      await releaseWorkflowLock(heldWorkflowId);
    }
  }
});




