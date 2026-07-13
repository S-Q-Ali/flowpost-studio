export async function updateSheetStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  postId: string,
  status: "posted" | "failed",
  googleAccessToken?: string,
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/update-sheet-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ postId, status, googleAccessToken }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("update-sheet-status returned", res.status, body);
    }
  } catch (sheetErr) {
    console.error("Failed to update sheet status", sheetErr);
  }
}
