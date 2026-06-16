import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleSession = async (session: any) => {
      if (!session) return;

      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!existingUser) {
        await supabase.from("users").insert({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email,
          avatar_url: session.user.user_metadata?.avatar_url,
          is_admin: false,
        });
      }

      if (!cancelled) navigate("/dashboard");
    };

    // Listen for SIGNED_IN event (fires when Supabase recovers session from URL hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        handleSession(session);
      }
    });

    // Also try getSession() as immediate fallback
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) handleSession(session);
    });

    // Timeout fallback after 10s
    timeoutId = setTimeout(() => {
      if (!cancelled) setError("Sign in timed out. Please try again.");
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/" className="text-[#5BB5C4] hover:underline">Go back to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0F0F0F" }}>
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={32} className="animate-spin text-[#5BB5C4]" />
        <p className="text-zinc-400">Completing sign in...</p>
      </div>
    </div>
  );
}
