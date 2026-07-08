import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Storage as MegaStorage } from "npm:megajs";
import { encrypt, decrypt } from "../_shared/crypto.ts";
import { Buffer } from "node:buffer";

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

// ── Web Crypto upload helpers ──────────────────────────────────────────────

function getMegaChunkSize(pos: number, fileSize: number): number {
  if (pos >= fileSize) return 0;
  const initial = 131072;
  const increment = 131072;
  const maxChunk = 1048576;
  let boundary = 0;
  let size = initial;
  while (true) {
    const chunk = Math.min(size, maxChunk);
    const next = boundary + chunk;
    if (pos < next) return Math.min(next - pos, fileSize - pos);
    boundary = next;
    size += increment;
  }
}

function e64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function mergeKeyMac(key: Uint8Array, mac: Uint8Array): Uint8Array {
  const merged = new Uint8Array(32);
  merged.set(key, 0);
  merged.set(mac.slice(0, 8), 24);
  for (let i = 0; i < 16; i++) merged[i] ^= merged[16 + i];
  return merged;
}

async function readExact(reader: ReadableStreamDefaultReader<Uint8Array>, size: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let total = 0;
  while (total < size) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; }
  return result;
}

async function uploadWithWebCrypto(
  storage: any,
  target: any,
  fileName: string,
  fileSize: number,
  body: ReadableStream<Uint8Array>,
  onProgress: (pct: number) => void,
): Promise<void> {
  // 1. Generate file key (24 bytes: 16 AES + 8 nonce)
  const fileKey = crypto.getRandomValues(new Uint8Array(24));
  const aesKey = fileKey.slice(0, 16);
  const nonce = fileKey.slice(16, 24);

  // 2. Import Web Crypto keys
  const ctrKey = await crypto.subtle.importKey("raw", aesKey, { name: "AES-CTR" }, false, ["encrypt"]);
  const cbcKey = await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["encrypt"]);

  // 3. Get upload URL from Mega API
  const uploadUrl: string = await new Promise((resolve, reject) => {
    storage.api.request({ a: "u", ssl: true, s: fileSize, ms: 0, r: 0, e: 0, v: 2 }, (err: any, resp: any) => {
      if (err) reject(new Error(err));
      else resolve(resp.p);
    });
  });

  // 4. Upload chunks
  let position = 0;
  let completionHash: Uint8Array | null = null;
  const reader = body.getReader();
  const zeroIv = new Uint8Array(16);
  let mac = new Uint8Array(16);
  mac.set(nonce, 0);
  mac.set(nonce, 8);

  onProgress(0);

  while (position < fileSize) {
    const chunkSize = getMegaChunkSize(position, fileSize);
    const plaintext = await readExact(reader, chunkSize);

    // 4a. AES-128-CTR encrypt
    const counter = new Uint8Array(16);
    counter.set(nonce, 0);
    const blockIndex = Math.floor(position / 16);
    const dv = new DataView(counter.buffer);
    dv.setUint32(8, Math.floor(blockIndex / 0x100000000), false);
    dv.setUint32(12, blockIndex >>> 0, false);

    const ciphertext = await crypto.subtle.encrypt({ name: "AES-CTR", counter, length: 128 }, ctrKey, plaintext);
    const ctBytes = new Uint8Array(ciphertext);

    // 4b. CBC-MAC update: AES-CBC with current mac as IV, take last block
    const macOut = await crypto.subtle.encrypt({ name: "AES-CBC", iv: mac }, cbcKey, ctBytes);
    mac = new Uint8Array(macOut.slice(-16));

    // 4c. POST chunk to Mega
    const resp = await fetch(`${uploadUrl}/${position}`, { method: "POST", body: ctBytes });
    if (!resp.ok) throw new Error(`Chunk upload failed at byte ${position}: ${resp.status}`);
    const raw = await resp.arrayBuffer();
    if (raw.byteLength > 0) completionHash = new Uint8Array(raw);

    position += ctBytes.length;
    onProgress(Math.min(Math.round((position / fileSize) * 100), 99));
  }

  // 5. Finalize MAC (condense)
  const condensed = await crypto.subtle.encrypt({ name: "AES-CBC", iv: zeroIv }, cbcKey, mac);
  const finalMac = new Uint8Array(condensed.slice(0, 16));

  // 6. Merge key and MAC
  const mergedKey = mergeKeyMac(aesKey, finalMac);

  // 7. Encrypt file attributes (JSON + zero-IV AES-CBC)
  const attrBytes = new TextEncoder().encode(JSON.stringify({ n: fileName }));
  const attrPad = new Uint8Array(Math.ceil(attrBytes.length / 16) * 16);
  attrPad.set(attrBytes);
  const attrEnc = await crypto.subtle.encrypt({ name: "AES-CBC", iv: zeroIv }, cbcKey, attrPad);

  // 8. Encrypt merged key with user's master key (ECB)
  const keyBuf = Buffer.from(new Uint8Array(mergedKey));
  storage.aes.encryptECB(keyBuf);

  // 9. Create file node via Mega API
  if (!completionHash) throw new Error("No completion hash from Mega upload");
  await new Promise<void>((resolve, reject) => {
    storage.api.request({
      a: "p",
      t: (target as any).nodeId || target,
      n: [{
        h: e64(completionHash),
        t: 0,
        a: e64(new Uint8Array(attrEnc)),
        k: e64(new Uint8Array(keyBuf)),
      }],
    }, (err: any) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  onProgress(100);
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

    // Stream upload with Web Crypto encryption (hardware AES, no CPU limit)
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await uploadWithWebCrypto(
            storage as any, target as any, fileName, contentLength, driveRes.body as ReadableStream<Uint8Array>,
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