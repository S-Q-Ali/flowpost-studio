import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SB_URL = Deno.env.get("SB_URL");
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY");
const SB_ANON_KEY = Deno.env.get("SB_ANON_KEY");

if (!SB_URL || !SB_SERVICE_ROLE_KEY || !SB_ANON_KEY) {
  console.error("Missing SB_URL, SB_SERVICE_ROLE_KEY, or SB_ANON_KEY for instagram-publish");
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
    const validKeys = [SB_ANON_KEY, SB_SERVICE_ROLE_KEY];
    if (!token || !validKeys.includes(token)) {
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
      .select("id, account_id, platform, caption, status, metadata")
      .eq("id", postId)
      .single();

    if (postError || !post) return json({ error: "Post not found" }, 404);
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

    let status = "IN_PROGRESS";
    let attempts = 0;
    while (status === "IN_PROGRESS" && attempts < 20) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(
        `https://graph.facebook.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`,
      );
      const s = await statusRes.json();
      status = s.status_code || "UNKNOWN";
      attempts++;
    }

    if (status !== "FINISHED") {
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Container not ready: ${status}` }, 502);
    }

    const publishRes = await fetch(
      `https://graph.facebook.com/v18.0/${post.account_id}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData?.id) {
      await supabase.from("posts").update({ status: "failed" }).eq("id", postId);
      return json({ error: `Publish failed: ${JSON.stringify(publishData)}` }, 502);
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);
    if (updateError) {
      return json({ error: "Publish succeeded but status update failed" }, 500);
    }

    return json({ success: true, instagram_post_id: publishData.id, postId });
  } catch (err) {
    console.error("instagram-publish crashed:", err);
    return json({ error: String(err) }, 500);
  }
});

