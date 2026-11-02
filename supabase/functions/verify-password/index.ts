// Retired. The shared APP_PASSWORD gate was replaced by real accounts, and
// nothing calls this endpoint. The file is kept as a tombstone so a deploy
// cannot leave an old version answering.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Endpoint removed" }), {
    status: 410,
    headers: {
      "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://flowpost-studio.vercel.app",
      "Content-Type": "application/json",
    },
  })
);
