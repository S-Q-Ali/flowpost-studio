export async function getGoogleAccessToken(): Promise<string> {
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY");
  const clientEmail = Deno.env.get("GOOGLE_CLIENT_EMAIL") ||
    "flowpost-studio@zinc-bucksaw-489020-n0.iam.gserviceaccount.com";

  if (!privateKey) {
    throw new Error("GOOGLE_PRIVATE_KEY not set");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  function base64UrlEncode(data: Uint8Array): string {
    return btoa(String.fromCharCode(...data))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const encoder = new TextEncoder();
  const headerStr = JSON.stringify(header);
  const claimStr = JSON.stringify(claim);
  const headerB64 = base64UrlEncode(encoder.encode(headerStr));
  const claimB64 = base64UrlEncode(encoder.encode(claimStr));
  const signatureInput = `${headerB64}.${claimB64}`;

  const keyData = privateKey.includes("\\n")
    ? privateKey.replace(/\\n/g, "\n")
    : privateKey;

  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = keyData.includes(pemHeader)
    ? keyData.slice(
        keyData.indexOf(pemHeader) + pemHeader.length,
        keyData.indexOf(pemFooter),
      ).replace(/\s/g, "")
    : keyData.replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    encoder.encode(signatureInput),
  );

  const jwt = `${signatureInput}.${base64UrlEncode(new Uint8Array(sig))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google token exchange failed:", tokenRes.status, errText);
    throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}
