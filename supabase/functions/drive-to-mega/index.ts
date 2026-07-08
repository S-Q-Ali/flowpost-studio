import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Storage as MegaStorage } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";
// Buffer import removed — using megajs built-in upload

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GD_CLIENT_ID = Deno.env.get("GD_CLIENT_ID");
const GD_CLIENT_SECRET = Deno.env.get("GD_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!GD_CLIENT_ID || !GD_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required secrets for drive-to-mega");
}

const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Upload using megajs built-in ──────────────────────────────────────────

async function uploadWithMega(
  target: any,
  fileName: string,
  fileSize: number,
  body: ReadableStream<Uint8Array>,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const uploadStream = target.upload({ name: fileName, size: fileSize }, (err: any, file: any) => {
      if (err) reject(new Error(err));
      else resolve();
    });
    uploadStream.on("progress", ({ bytesUploaded }: { bytesUploaded: number }) => {
      onProgress(Math.min(Math.round((bytesUploaded / fileSize) * 100), 99));
    });
    // Wrap Node.js Writable in a WHATWG WritableStream for pipeTo compatibility
    const writable = new WritableStream({
      write(chunk: Uint8Array) {
        return new Promise<void>((res, rej) => {
          const ok = uploadStream.write(chunk, (err?: Error) => {
            if (err) rej(err);
            else if (!ok) uploadStream.once("drain", res);
            else res();
          });
          if (!ok) uploadStream.once("drain", res);
        });
      },
      close() {
        return new Promise<void>((res) => uploadStream.end(res));
      },
    });
    body.pipeTo(writable).catch(reject);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validKeys = [Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_ANON_KEY"), Deno.env.get("FRONTEND_API_KEY")].filter(Boolean);
  if (!token || !validKeys.includes(token)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { driveFileId?: string; googleAccessToken?: string; driveAccountId?: string; megaAccountId?: string; fileName?: string; megaFolderPath?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { driveFileId, googleAccessToken: directToken, driveAccountId, megaAccountId, fileName, megaFolderPath } = body;
  if (!driveFileId || !megaAccountId || !fileName) {
    return json({ error: "Missing required fields" }, 400);
  }

  let googleAccessToken = directToken;
  if (!googleAccessToken && driveAccountId) {
    const { data: driveAccount, error: daError } = await supabaseAdmin
      .from("connected_accounts")
      .select("*")
      .eq("id", driveAccountId)
      .eq("platform", "google_drive")
      .eq("is_connected", true)
      .single();
    if (daError || !driveAccount) return json({ error: "Drive account not found" }, 404);

    const rawToken = await decrypt(driveAccount.access_token as string);
    if (driveAccount.refresh_token) {
      const rawRefresh = await decrypt(driveAccount.refresh_token as string);
      if (rawRefresh) {
        try {
          const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: Deno.env.get("GD_CLIENT_ID")!,
              client_secret: Deno.env.get("GD_CLIENT_SECRET")!,
              refresh_token: rawRefresh,
              grant_type: "refresh_token",
            }),
          });
          const refreshJson = await refreshRes.json();
          if (refreshRes.ok && refreshJson.access_token) {
            googleAccessToken = refreshJson.access_token;
            await supabaseAdmin
              .from("connected_accounts")
              .update({ access_token: await encrypt(refreshJson.access_token) })
              .eq("id", driveAccountId);
          }
        } catch { /* use existing token */ }
      }
    }
    if (!googleAccessToken) googleAccessToken = rawToken;
  }

  if (!googleAccessToken) return json({ error: "Could not resolve Drive access token" }, 400);

  try {
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`;
    const headRes = await fetch(driveUrl, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!headRes.ok) {
      return json({ error: "Drive file not accessible" }, 400);
    }
    const contentLength = parseInt(headRes.headers.get("Content-Length") || "0", 10);
    if (!contentLength) return json({ error: "Could not determine file size" }, 400);

    const { data: account, error: fetchError } = await supabaseAdmin
      .from("connected_accounts")
      .select("*")
      .eq("id", megaAccountId)
      .eq("platform", "mega")
      .eq("is_connected", true)
      .single();

    if (fetchError || !account) return json({ error: "Mega account not found" }, 404);

    const email = await decrypt(account.refresh_token as string);
    const password = await decrypt(account.access_token as string);
    if (!email || !password) return json({ error: "Missing Mega credentials" }, 400);

    const storage = await new MegaStorage({ email, password }).ready;

    let target = storage.root;
    if (megaFolderPath) {
      const parts = megaFolderPath.split("/");
      for (const part of parts) {
        if (!part) continue;
        let folder: any;
        for (const child of target.children ?? []) {
          if (child.directory && child.name === part) {
            folder = child;
            break;
          }
        }
        if (!folder) {
          folder = await target.mkdir(part);
        }
        target = folder;
      }
    }

    const driveRes = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!driveRes.ok) throw new Error("Failed to download from Drive");

    // Upload using megajs built-in (handles chunking, MAC, node creation)
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await uploadWithMega(
            target as any, fileName, contentLength, driveRes.body as ReadableStream<Uint8Array>,
            (pct) => {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "progress", percent: pct }) + "\n"));
            },
          );
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "done", success: true, fileName, size: contentLength }) + "\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "error", message: msg }) + "\n"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" },
    });
  } catch (err) {
    console.error("[drive-to-mega] error:", err?.constructor?.name, err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error("[drive-to-mega] stack:", err.stack);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});