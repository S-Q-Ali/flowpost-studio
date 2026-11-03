/**
 * The id of the admin user, or null when the install has none.
 *
 * A missing admin is a configuration fault: minting a session for a made-up
 * owner would hand out a token that belongs to nobody.
 */
export async function findAdminUserId(supabase: any): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("is_admin", true)
    .maybeSingle();
  if (error) {
    console.error("admin-user: could not read the admin row", error);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}
