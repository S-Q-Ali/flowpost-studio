import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY) {
  console.error("Missing SB_URL or SB_SERVICE_ROLE_KEY for instagram-publish");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(
      "instagram-publish called with body:",
      JSON.stringify(await req.clone().json()),
    );

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token || token !== SB_SERVICE_ROLE_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let postId: string;
    try {
      const body = await req.json();
      postId = body?.postId;
      if (!postId) return json({ error: "postId required" }, 400);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, account_id, platform, caption, status, metadata, video_id")
      .eq("id", postId)
      .single();

    if (postError || !post) return json({ error: "Post not found" }, 404);
    console.log(
      "Post found:",
      JSON.stringify({
        id: post.id,
        status: post.status,
        metadata: post.metadata,
        video_id: post.video_id,
      }),
    );
    if (post.platform !== "instagram") {
      return json({ error: "Post is not for Instagram" }, 400);
    }
    if (!post.account_id) return json({ error: "Post has no account_id" }, 400);

    if (!post.metadata?.instagram_container_id) {
      console.error("No container_id in metadata:", post.metadata);
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "No container_id" }, 400);
    }

    const containerId = post.metadata.instagram_container_id as string;

    const { data: account, error: accountError } = await supabase
      .from("connected_accounts")
      .select("account_id, access_token")
      .eq("platform", "instagram")
      .eq("account_id", post.account_id)
      .eq("is_connected", true)
      .single();

    if (accountError || !account?.access_token) {
      return json({ error: "Connected Instagram account not found" }, 404);
    }

    const accessToken = account.access_token as string;
    console.log("Account found:", account?.account_id);
    const existingPollCount = (post.metadata?.instagram_poll_count as number) ?? 0;
    console.log(
      "Starting poll for container:",
      post.metadata.instagram_container_id,
      "poll count so far:",
      existingPollCount,
    );

    if (existingPollCount >= 90) {
      console.log("Container stuck at UNKNOWN for 90+ polls, marking as failed");
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: "Container timed out in UNKNOWN status" }, 502);
    }

    let status = "UNKNOWN";
    let fullStatusData: Record<string, unknown> = {};
    for (let attempt = 0; attempt < 30; attempt++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v25.0/${containerId}?fields=status_code&access_token=${accessToken}`,
      );
      fullStatusData = await statusRes.json() as Record<string, unknown>;

      // If Meta returns an API error (expired token, auth error, etc.), treat as terminal
      if (fullStatusData?.error) {
        console.error("Meta API error for container", containerId, JSON.stringify(fullStatusData.error));
        status = "ERROR";
        break;
      }

      status = (fullStatusData?.status_code as string) || "UNKNOWN";
      console.log("Container status:", status, JSON.stringify(fullStatusData));

      if (status === "FINISHED") {
        break;
      }
      if (status === "ERROR") {
        break;
      }
      // Still processing, wait 2 seconds and retry
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (status === "FINISHED") {
      // Reset poll count on success
      await supabase
        .from("posts")
        .update({
          metadata: {
            ...(post.metadata as Record<string, unknown> || {}),
            instagram_poll_count: 0,
          },
        })
        .eq("id", postId);

      // Try to claim this publish atomically (only one worker proceeds)
      const { data: claimed, error: claimError } = await supabase
        .from("posts")
        .update({ status: "publishing" })
        .eq("id", postId)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();

      if (claimError) {
        console.error("Claim failed", claimError);
        return json({ error: claimError.message }, 500);
      }
      if (!claimed) {
        console.log(
          "Post already being published or done, skipping",
        );
        return json({ success: true, message: "Already handled" });
      }

      // Now safe to publish — we have the claim
      const publishForm = new URLSearchParams();
      publishForm.append("creation_id", containerId);
      publishForm.append("access_token", accessToken);

      const publishRes = await fetch(
        `https://graph.facebook.com/v25.0/${post.account_id}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: publishForm.toString(),
        },
      );
      const publishData = await publishRes.json();
      if (!publishRes.ok || !publishData?.id) {
        await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
        return json(
          { error: `Publish failed: ${JSON.stringify(publishData)}` },
          502,
        );
      }

      const { error: updateError } = await supabase
        .from("posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (updateError) {
        return json({ error: "Publish succeeded but status update failed" }, 500);
      }

      // Update Google Sheet status to "posted"
      try {
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "posted" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }

      return json({
        success: true,
        instagram_post_id: publishData.id,
        postId,
      });
    }

    if (status === "ERROR") {
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      // Update sheet status to "failed"
      try {
        await fetch(`${SB_URL}/functions/v1/update-sheet-status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SB_SERVICE_ROLE_KEY}`,
            apikey: SB_SERVICE_ROLE_KEY!,
          },
          body: JSON.stringify({ postId, status: "failed" }),
        });
      } catch (sheetErr) {
        console.error("Failed to update sheet status", sheetErr);
      }
      return json({ error: "Container processing failed" }, 502);
    }

    // Still UNKNOWN/IN_PROGRESS. Increment poll count in metadata.
    const newPollCount = existingPollCount + 30;
    await supabase
      .from("posts")
      .update({
        metadata: {
          ...(post.metadata as Record<string, unknown> || {}),
          instagram_poll_count: newPollCount,
          last_unknown_response: fullStatusData,
        },
      })
      .eq("id", postId);

    console.log("Container still processing (UNKNOWN), poll count:", newPollCount, "full response:", JSON.stringify(fullStatusData));
    return json({
      success: false,
      status: "processing",
      message: "Container not ready yet, will retry",
    });
  } catch (err) {
    console.error("instagram-publish crashed:", err);
    return json({ error: String(err) }, 500);
  }
});

