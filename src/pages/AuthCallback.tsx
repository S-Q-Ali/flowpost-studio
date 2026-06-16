import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, isVerifying } = useAuth();

  useEffect(() => {
    if (!isVerifying && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, isVerifying, navigate]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-[#5BB5C4]" />
          <p className="text-zinc-400">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0F0F0F" }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">Sign in failed. Please try again.</p>
          <a href="/" className="text-[#5BB5C4] hover:underline">Go back to login</a>
        </div>
      </div>
    );
  }

  return null;
}
