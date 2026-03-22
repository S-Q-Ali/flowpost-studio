import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");
const GOOGLE_FALLBACK_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID") || undefined;

const PERSONAL_USER_ID = "00000000-0000-0000-0000-000000000000";

if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
  console.error("Missing SB_URL, SB_SERVICE_ROLE_KEY or SB_ANON_KEY for process-workflow");
}

const supabase = createClient(SB_URL!, SB_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlEncode(input: string | Uint8Array): string {
  const str =
    typeof input === "string" ? input : String.fromCharCode(...input);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleAccessToken(): Promise<string> {
  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
  const privateKeyEnv = Deno.env.get("GOOGLE_PRIVATE_KEY")!;

  if (!email || !privateKeyEnv) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY");
  }

  // Handle keys stored with escaped newlines
  const normalizedKey = privateKeyEnv.replace(/\\n/g, "\n");

  const pemContents = normalizedKey
    .replace("-----BEGIN RSA PRIVATE KEY-----", "")
    .replace("-----END RSA PRIVATE KEY-----", "")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\r?\n/g, "")
    .trim();

  const binaryKey = Uint8Array.from(atob(pemContents), (c) =>
    c.charCodeAt(0)
  );

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    iss: email,
    scope:
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${base64UrlEncode(
    new Uint8Array(signature),
  )}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token as string;
}

type SheetValuesResponse = {
  values?: string[][];
};

interface GetUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
}

function parseList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizePlatform(p: string): "youtube" | "facebook" | "instagram" | null {
  const v = p.toLowerCase();
  if (v === "youtube") return "youtube";
  if (v === "facebook") return "facebook";
  if (v === "instagram") return "instagram";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [SB_ANON_KEY, SB_SERVICE_ROLE_KEY];

  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let workflowId: string | undefined;
  try {
    const body = await req.json().catch(() => null);
    workflowId = body?.workflowId;
  } catch {
    // ignore invalid JSON when called without body
  }

  try {
    // For scheduled runs (no workflowId), use a per-minute lock to prevent duplicate execution
    if (!workflowId) {
      await supabase
        .from("workflow_locks")
        .delete()
        .lt("expires_at", new Date().toISOString());

      const lockKey =
        "process-workflow-" + new Date().toISOString().slice(0, 16);
      const { error: lockError } = await supabase.from("workflow_locks").insert({
        lock_key: lockKey,
        locked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

      if (lockError) {
        console.log("Another instance is running, exiting");
        return json({ message: "Already running" });
      }
      console.log("Lock acquired:", lockKey);
    }

    const filters: Record<string, unknown> = { is_active: true };
    if (workflowId) {
      filters.id = workflowId;
    } else {
      filters.user_id = PERSONAL_USER_ID;
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

    let googleToken: string | null = null;
    const errors: string[] = [];
    let totalProcessedVideos = 0;
    let workflowsTriggered = 0;

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

      // If manual run (workflowId provided), skip trigger window checks
      if (!workflowId) {
        const start = wf.trigger_hour_start ?? 14;
        const end = wf.trigger_hour_end ?? 15;

        console.log("UTC hour:", utcHour);
        console.log("UTC minute:", utcMinute);
        console.log("Workflow window (UTC):", start, "-", end);

        // Trigger window check in UTC (end hour inclusive so 23:00 is inside 22-23 window)
        if (utcHour < start || utcHour > end) {
          continue;
        }

        // Deterministic random minute and hour within window (UTC)
        const todayUtc = now.toISOString().slice(0, 10);
        const seed = String(wf.id ?? "") + todayUtc;
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
          hash = ((hash << 5) - hash) + seed.charCodeAt(i);
          hash |= 0;
        }

        const randomMinute = Math.abs(hash) % 60;
        const windowSizeRaw = end - start;
        const windowSize = windowSizeRaw > 0 ? windowSizeRaw : 1;
        const randomHourOffset = Math.abs(hash >> 8) % windowSize;
        const randomHour = start + randomHourOffset;

        console.log(
          `Workflow ${wf.name}: random trigger time set to ${randomHour}:${randomMinute
            .toString()
            .padStart(2, "0")} UTC`,
        );

        // Skip until random trigger time reached in UTC
        if (
          utcHour < randomHour ||
          (utcHour === randomHour && utcMinute < randomMinute)
        ) {
          continue;
        }

        // Already triggered today check (UTC date)
        const lastTriggered = wf.last_triggered_at
          ? new Date(wf.last_triggered_at)
          : null;
        const lastTriggeredUtc = lastTriggered
          ? lastTriggered.toISOString().slice(0, 10)
          : null;

        if (lastTriggeredUtc === todayUtc) {
          console.log("Already triggered today, skipping");
          continue;
        }
      }

      if (!googleToken) {
        try {
          googleToken = await getGoogleAccessToken();
        } catch (err) {
          console.error("Google auth error", err);
          errors.push(
            `Google auth failed for workflow ${wf.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }
      }

      // Immediately update last_triggered_at to prevent double trigger (even if processing fails later)
      const { error: earlyTriggerError } = await supabase
        .from("workflows")
        .update({
          last_triggered_at: new Date().toISOString(),
        })
        .eq("id", wf.id);

      if (earlyTriggerError) {
        console.error(
          "Failed to update last_triggered_at (early)",
          wf.id,
          earlyTriggerError,
        );
        errors.push(
          `Failed to claim workflow ${wf.id}: ${earlyTriggerError.message}`,
        );
        continue;
      }

      // Read sheet
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1`,
        {
          headers: {
            Authorization: `Bearer ${googleToken}`,
          },
        },
      );

      if (!sheetRes.ok) {
        const text = await sheetRes.text();
        console.error("Failed to read sheet", sheetRes.status, text);
        errors.push(
          `Failed to read sheet for workflow ${wf.id}: ${sheetRes.status}`,
        );
        continue;
      }

      const sheetData = (await sheetRes.json()) as SheetValuesResponse;
      const rows = sheetData.values ?? [];
      if (rows.length < 2) {
        continue;
      }

      const headers = rows[0] ?? [];
      const headerIndex: Record<string, number> = {};
      headers.forEach((h, idx) => {
        headerIndex[h.toLowerCase()] = idx;
      });

      const videoUrlIdx = headerIndex["video_url"];
      const titleIdx = headerIndex["title"];
      const descIdx = headerIndex["description"];
      const platformsIdx = headerIndex["platforms"];
      const statusIdx = headerIndex["status"];
      const ytChannelsIdx = headerIndex["youtube_channels"];
      const fbPagesIdx = headerIndex["facebook_pages"];

      if (
        videoUrlIdx === undefined || statusIdx === undefined
      ) {
        errors.push(
          `Sheet for workflow ${wf.id} is missing required columns (video_url/status)`,
        );
        continue;
      }

      const dataRows = rows.slice(1);
      const readyRows: { row: string[]; rowIndex: number }[] = [];

      dataRows.forEach((row, i) => {
        const statusVal = row[statusIdx]?.toLowerCase().trim();
        if (statusVal === "ready to post") {
          readyRows.push({ row, rowIndex: i + 2 }); // +2 to account for header row
        }
      });

      if (readyRows.length === 0) {
        continue;
      }

      const maxVideosPerTrigger: number = wf.max_videos_per_trigger ?? 3;
      const toProcess = readyRows.slice(0, maxVideosPerTrigger);

      let workflowVideoCount = 0;

      for (const { row, rowIndex } of toProcess) {
        try {
          const driveUrl = row[videoUrlIdx];
          if (!driveUrl) continue;

          const match = driveUrl.match(/\/d\/([^/]+)/);
          const fileId = match?.[1];
          if (!fileId) {
            console.warn("Could not extract fileId from Drive URL", driveUrl);
            continue;
          }
          const driveDownloadUrl =
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
          const publicDriveUrl =
            `https://drive.google.com/uc?export=download&id=${fileId}`;

          const title = titleIdx !== undefined ? row[titleIdx] || "" : "";
          const description =
            descIdx !== undefined ? row[descIdx] || "" : "";
          const baseName = (title || `workflow-video-${fileId}`).replace(
            /\.mp4$/i,
            "",
          );
          const fileName = `${baseName}.mp4`;

          const { data: videoRecord, error: videoError } = await supabase
            .from("videos")
            .insert({
              user_id: PERSONAL_USER_ID,
              title: title || fileName,
              // Store Drive download URL temporarily – upload functions will stream directly
              file_url: driveDownloadUrl,
            })
            .select("id")
            .single();

          if (videoError || !videoRecord) {
            console.error("Failed to insert video", videoError);
            continue;
          }

          // Determine platforms
          let platforms: ("youtube" | "facebook" | "instagram")[] = [];
          const rowPlatformsRaw =
            platformsIdx !== undefined ? row[platformsIdx] : "";
          if (rowPlatformsRaw) {
            const parsed = parseList(rowPlatformsRaw)
              .map(normalizePlatform)
              .filter((p): p is "youtube" | "facebook" | "instagram" => !!p);
            platforms = parsed;
          } else if (Array.isArray(wf.platforms)) {
            const parsed = (wf.platforms as string[])
              .map(normalizePlatform)
              .filter((p): p is "youtube" | "facebook" | "instagram" => !!p);
            platforms = parsed;
          }

          if (platforms.length === 0) {
            console.warn("No platforms resolved for workflow", wf.id);
            continue;
          }

          const rowYtChannels = ytChannelsIdx !== undefined
            ? parseList(row[ytChannelsIdx])
            : [];
          const rowFbPages = fbPagesIdx !== undefined
            ? parseList(row[fbPagesIdx])
            : [];

          const ytAccounts = rowYtChannels.length
            ? rowYtChannels
            : (wf.youtube_channel_ids ?? []);
          const fbAccounts = rowFbPages.length
            ? rowFbPages
            : (wf.facebook_page_ids ?? []);
          const igAccounts = wf.instagram_account_ids ?? [];

          const postsPayload: any[] = [];
          const nowIso = new Date().toISOString();

          for (const p of platforms) {
            if (p === "youtube") {
              for (const accountId of ytAccounts) {
                postsPayload.push({
                  user_id: PERSONAL_USER_ID,
                  video_id: videoRecord.id,
                  platform: "youtube",
                  account_id: accountId,
                  caption: description || null,
                  hashtags: null,
                  scheduled_at: nowIso,
                  status: "processing",
                  captions_enabled: true,
                  contains_altered_content: wf.youtube_altered_content ?? true,
                });
              }
            } else if (p === "facebook") {
              for (const accountId of fbAccounts) {
                postsPayload.push({
                  user_id: PERSONAL_USER_ID,
                  video_id: videoRecord.id,
                  platform: "facebook",
                  account_id: accountId,
                  caption: description || null,
                  hashtags: null,
                  scheduled_at: nowIso,
                  status: "processing",
                  captions_enabled: true,
                });
              }
            } else if (p === "instagram") {
              for (const accountId of igAccounts) {
                postsPayload.push({
                  user_id: PERSONAL_USER_ID,
                  video_id: videoRecord.id,
                  platform: "instagram",
                  account_id: accountId,
                  caption: description || null,
                  hashtags: null,
                  scheduled_at: nowIso,
                  status: "processing",
                  captions_enabled: true,
                });
              }
            }
          }

          if (postsPayload.length === 0) {
            continue;
          }

          const { data: insertedPosts, error: postsError } = await supabase
            .from("posts")
            .insert(postsPayload)
            .select("id, platform, account_id");

          if (postsError || !insertedPosts) {
            console.error("Failed to insert posts", postsError);
            continue;
          }

          console.log("post_as_story:", wf.post_as_story);
          console.log("instagram_account_ids:", wf.instagram_account_ids);
          console.log(
            "posts created:",
            (insertedPosts as { platform: string }[]).map((p) => p.platform),
          );

          // Immediately mark posts as processing so the scheduled-posts cron
          // does not pick them up again
          const { error: processingUpdateError } = await supabase
            .from("posts")
            .update({ status: "processing" })
            .in(
              "id",
              (insertedPosts as { id: string }[]).map((p) => p.id),
            );

          if (processingUpdateError) {
            console.error(
              "Failed to mark posts as processing",
              processingUpdateError,
            );
          }

          // Kick off uploads via existing Edge Functions
          for (const post of insertedPosts as {
            id: string;
            platform: string;
            account_id: string | null;
          }[]) {
            if (post.platform === "youtube") {
              await fetch(`${SB_URL}/functions/v1/youtube-upload`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
                  apikey: SB_SERVICE_ROLE_KEY!,
                },
                body: JSON.stringify({
                  postId: post.id,
                  driveDownloadUrl,
                  googleAccessToken: googleToken,
                }),
              });
            } else if (post.platform === "facebook") {
              await fetch(`${SB_URL}/functions/v1/facebook-upload`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
                  apikey: SB_SERVICE_ROLE_KEY!,
                },
                body: JSON.stringify({
                  postId: post.id,
                  driveDownloadUrl,
                  googleAccessToken: googleToken,
                }),
              });
            } else if (post.platform === "instagram") {
              await fetch(`${SB_URL}/functions/v1/instagram-upload`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
                  apikey: SB_SERVICE_ROLE_KEY!,
                },
                body: JSON.stringify({
                  postId: post.id,
                  driveDownloadUrl,
                  googleAccessToken: googleToken,
                }),
              });
            }
          }

          if (wf.post_as_story) {
            const { data: updatedVideo } = await supabase
              .from("videos")
              .select("file_url")
              .eq("id", videoRecord.id)
              .single();

            const storyVideoUrl = updatedVideo?.file_url || publicDriveUrl;
            const usedStoryTokens = new Set<string>();

            for (const post of insertedPosts as {
              id: string;
              platform: string;
              account_id: string | null;
            }[]) {
              if (post.platform === "facebook" && post.account_id) {
                const { data: fbAcc } = await supabase
                  .from("connected_accounts")
                  .select("access_token")
                  .eq("account_id", post.account_id)
                  .eq("platform", "facebook")
                  .single();

                if (
                  fbAcc?.access_token &&
                  !usedStoryTokens.has(fbAcc.access_token)
                ) {
                  usedStoryTokens.add(fbAcc.access_token);
                  await fetch(`${SB_URL}/functions/v1/post-story`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                      platform: "facebook",
                      accountId: post.account_id,
                      videoUrl: storyVideoUrl,
                      accessToken: fbAcc.access_token,
                    }),
                  });
                  console.log("Facebook story posted:", post.id);
                }
              }

              if (post.platform === "instagram" && wf.post_as_story) {
                console.log("Calling Instagram story for post:", post.id);
                if (!post.account_id) {
                  console.warn(
                    "Instagram story skipped: missing account_id for post",
                    post.id,
                  );
                  continue;
                }
                const { data: igAcc } = await supabase
                  .from("connected_accounts")
                  .select("access_token")
                  .eq("account_id", post.account_id)
                  .eq("platform", "instagram")
                  .single();

                if (igAcc?.access_token) {
                  await fetch(`${SB_URL}/functions/v1/post-story`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({
                      platform: "instagram",
                      accountId: post.account_id,
                      videoUrl: storyVideoUrl,
                      accessToken: igAcc.access_token,
                    }),
                  });
                  console.log("Instagram story posted:", post.id);
                } else {
                  console.warn(
                    "Instagram story skipped: no access_token for account",
                    post.account_id,
                  );
                }
              }
            }
          }

          // Update sheet row status to "posted"
          if (statusIdx !== undefined) {
            const colLetter = String.fromCharCode("A".charCodeAt(0) + statusIdx);
            const range = `Sheet1!${colLetter}${rowIndex}`;
            const updateRes = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
                range,
              )}?valueInputOption=RAW`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${googleToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ values: [["posted"]] }),
              },
            );
            if (!updateRes.ok) {
              console.error(
                "Failed to update sheet status",
                updateRes.status,
                await updateRes.text(),
              );
            }
          }

          workflowVideoCount++;
        } catch (err) {
          console.error("Error processing sheet row", err);
          errors.push(
            `Row processing failed for workflow ${wf.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (workflowVideoCount > 0) {
        totalProcessedVideos += workflowVideoCount;
        workflowsTriggered++;

        const { error: updateError } = await supabase
          .from("workflows")
          .update({
            total_posted: (wf.total_posted ?? 0) + workflowVideoCount,
          })
          .eq("id", wf.id);

        if (updateError) {
          console.error("Failed to update workflow stats", updateError);
          errors.push(
            `Failed to update stats for workflow ${wf.id}: ${updateError.message}`,
          );
        }
      }
    }

    return json({
      processed: totalProcessedVideos,
      workflows_triggered: workflowsTriggered,
      errors,
    });
  } catch (err) {
    console.error("process-workflow error", err);
    return json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        processed: 0,
        workflows_triggered: 0,
        errors: [],
      },
      500,
    );
  }
});

