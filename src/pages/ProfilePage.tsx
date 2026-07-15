import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BadgeCheck, Loader2, Save, KeyRound, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string | null;
}

export default function ProfilePage() {
  const { userId, isAdmin } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const [secFavTeacher, setSecFavTeacher] = useState("");
  const [secBestNightDate, setSecBestNightDate] = useState("");
  const [secSaving, setSecSaving] = useState(false);
  const [secConfigured, setSecConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("users")
      .select("id, name, email, avatar_url, is_admin, created_at")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setProfile(data);
          setName(data.name || "");
          setAvatarUrl(data.avatar_url || "");
        }
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    supabase.functions
      .invoke<{ questionsConfigured?: boolean }>("verify-security-questions", { method: "GET" })
      .then(({ data }) => setSecConfigured(data?.questionsConfigured ?? false))
      .catch(() => setSecConfigured(false));
  }, []);

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ name: name.trim() || null, avatar_url: avatarUrl.trim() || null })
      .eq("id", userId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated");
      setProfile((p) => p ? { ...p, name: name.trim() || null, avatar_url: avatarUrl.trim() || null } : p);
    }
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setChangingPassword(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile?.email || "",
      password: currentPassword,
    });
    if (signInError) {
      toast.error("Current password is incorrect");
      setChangingPassword(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  const handleSaveSecurityQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secFavTeacher.trim() || !secBestNightDate) {
      toast.error("Please answer both security questions");
      return;
    }
    setSecSaving(true);
    const { error } = await supabase.functions.invoke("verify-security-questions", {
      body: { setQuestions: true, favTeacher: secFavTeacher.trim(), bestNightDate: secBestNightDate },
    });
    if (error) {
      toast.error(error.message || "Failed to save security questions");
    } else {
      toast.success("Security questions saved");
      setSecConfigured(true);
      setSecFavTeacher("");
      setSecBestNightDate("");
    }
    setSecSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (profile?.name || profile?.email || "U")
    .split(/[ @.]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings and security</p>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList>
          <TabsTrigger value="personal" className="gap-2">
            <BadgeCheck size={16} />
            Personal Info
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <ShieldQuestion size={16} />
            Security
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <KeyRound size={16} />
            Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Personal Information</CardTitle>
              <CardDescription>Update your profile details and avatar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-border">
                  <AvatarImage src={avatarUrl || undefined} alt={name || "User"} />
                  <AvatarFallback className="text-lg font-medium bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">{profile?.name || "User"}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950 px-1.5 py-0.5 rounded mt-1">
                      <BadgeCheck size={12} />
                      Admin
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-name">Display Name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-avatar">Avatar URL</Label>
                <Input
                  id="profile-avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">Paste a URL to an image (e.g. Gravatar)</p>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email || ""} disabled className="h-10 bg-muted/50" />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              {profile?.created_at && (
                <div className="text-xs text-muted-foreground">
                  Member since {new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </div>
              )}

              <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-pw">Current Password</Label>
                  <Input
                    id="current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pw">New Password</Label>
                  <Input
                    id="new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min 6 characters)"
                    className="h-10"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">Confirm New Password</Label>
                  <Input
                    id="confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-10"
                    required
                  />
                </div>
                <Button type="submit" disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword} className="gap-2">
                  {changingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Security Questions</CardTitle>
              <CardDescription>
                {secConfigured
                  ? "Your security questions are configured. You can re-set them below."
                  : "Set up security questions for additional account protection."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSecurityQuestions} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sec-teacher">What is your favorite teacher's name?</Label>
                  <Input
                    id="sec-teacher"
                    value={secFavTeacher}
                    onChange={(e) => setSecFavTeacher(e.target.value)}
                    placeholder="Enter teacher's name"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sec-date">What is the date of your best night ever?</Label>
                  <Input
                    id="sec-date"
                    type="date"
                    value={secBestNightDate}
                    onChange={(e) => setSecBestNightDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <Button type="submit" disabled={secSaving} className="gap-2">
                  {secSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {secConfigured ? "Update Security Questions" : "Save Security Questions"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-6">
          <Card className="bg-card border-border shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Preferences</CardTitle>
              <CardDescription>Customize your FlowPost experience</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground py-8 text-center">
                More preferences coming soon — default publish platforms, default scheduling time, notification settings, and more.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
