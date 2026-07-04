export async function updateSheetStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  postId: string,
  status: "posted" | "failed",
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/update-sheet-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ postId, status }),
    });
  } catch (sheetErr) {
    console.error("Failed to update sheet status", sheetErr);
  }
}
