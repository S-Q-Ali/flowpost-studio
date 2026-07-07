import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { File as MegaFile, Storage as MegaStorage } from "npm:megajs";
import { decrypt } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for get-file");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const encrypted = url.searchParams.get("token");
  if (!encrypted) {
    return new Response("Missing token", { status: 400, headers: corsHeaders });
  }

  let tokenPayload: { driveUrl?: string; driveToken?: string; megaUrl?: string; megaFileName?: string; megaAccountId?: string; exp?: number };
  try {
    const decrypted = await decrypt(encrypted);
    tokenPayload = JSON.parse(decrypted);
  } catch {
    return new Response("Invalid token", { status: 403, headers: corsHeaders });
  }

  if (!tokenPayload.driveUrl && !tokenPayload.megaUrl && !tokenPayload.megaFileName) {
    return new Response("Invalid token payload", { status: 403, headers: corsHeaders });
  }

  if (tokenPayload.exp && Date.now() > tokenPayload.exp) {
    return new Response("Token expired", { status: 410, headers: corsHeaders });
  }

  try {
    if (tokenPayload.megaFileName && tokenPayload.megaAccountId) {
      const { data: account } = await supabase
        .from("connected_accounts")
        .select("*")
        .eq("id", tokenPayload.megaAccountId)
        .eq("platform", "mega")
        .eq("is_connected", true)
        .single();

      if (!account) {
        return new Response("Mega account not found", { status: 404, headers: corsHeaders });
      }

      const email = await decrypt(account.refresh_token as string);
      const password = await decrypt(account.access_token as string);
      if (!email || !password) {
        return new Response("Missing Mega credentials", { status: 400, headers: corsHeaders });
      }

      const storage = await new MegaStorage({ email, password }).ready;
      const child = (storage.root.children ?? []).find(
        (c: any) => !c.directory && c.name === tokenPayload.megaFileName,
      );

      if (!child) {
        storage.api.logout().catch(() => {});
        return new Response("File not found in Mega", { status: 404, headers: corsHeaders });
      }

      const data = await child.downloadBuffer();
      storage.api.logout().catch(() => {});

      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": data.byteLength.toString(),
          "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
        },
      });
    }

    if (tokenPayload.megaUrl) {
      const megaFile = MegaFile.fromURL(tokenPayload.megaUrl);
      const data = await megaFile.downloadBuffer();
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": data.byteLength.toString(),
          "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
        },
      });
    }

    const driveRes = await fetch(tokenPayload.driveUrl!, {
      headers: { Authorization: `Bearer ${tokenPayload.driveToken!}` },
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      console.error(`[get-file] Drive fetch failed: ${driveRes.status} - ${errText}`);
      return new Response("Failed to fetch file from Drive", {
        status: 502,
        headers: corsHeaders,
      });
    }

    const contentType = driveRes.headers.get("Content-Type") || "application/octet-stream";
    const contentLength = driveRes.headers.get("Content-Length");

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://yourdomain.com",
    };
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    return new Response(driveRes.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[get-file] Error streaming file", err);
    return new Response("Error streaming file", { status: 500, headers: corsHeaders });
  }
});