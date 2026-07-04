import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0F0F0F" }}>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-zinc-300">
        <header className="flex items-center gap-3">
          <Link to="/dashboard" aria-label="FlowPost Studio">
            <Logo size="md" />
          </Link>
        </header>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">Last updated: June 7, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Information We Collect</h2>
          <p>We collect the minimum data needed to operate the Service:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Google Sheets data</strong> — only the spreadsheets you explicitly connect
              via URL. We read columns like <code>video_url</code>, <code>title</code>,{" "}
              <code>caption</code>, and <code>status</code> to drive posting.
            </li>
            <li>
              <strong>OAuth tokens</strong> — access and refresh tokens for the social media
              accounts you connect (Facebook, Instagram, YouTube, TikTok). We store these
              encrypted-at-rest in our database to call each platform's API on your behalf.
            </li>
            <li>
              <strong>Post metadata</strong> — captions, hashtags, scheduled times, publish
              status, and the post ID returned by each platform. We store this to show you a
              queue and prevent duplicate posts.
            </li>
            <li>
              <strong>Media files</strong> — videos and images you upload are stored on Cloudflare
              R2 (object storage) so each platform can fetch them via a public URL.
            </li>
            <li>
              <strong>Account profile</strong> — your display name and avatar URL returned by
              TikTok/YouTube/Facebook OAuth, used to identify your account in the UI.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. How We Use Your Information</h2>
          <p>We use the data we collect only to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Read your Google Sheets to find rows marked "ready to post".</li>
            <li>
              Upload your media files to R2 and generate short-lived public URLs for each
              platform to download.
            </li>
            <li>Call each platform's API to publish content on your behalf.</li>
            <li>
              Update your Google Sheet with status changes (e.g. marking rows as "posted") if
              configured.
            </li>
            <li>Display your connected accounts, scheduled posts, and post status in the UI.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. How We Store Your Data</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Database</strong>: Supabase (Postgres) with row-level security. Tokens are
              stored in a service-role-protected table.
            </li>
            <li>
              <strong>Media files</strong>: Cloudflare R2 object storage. Public-read is enabled
              so platforms can fetch the URLs, but the URLs are unguessable object keys.
            </li>
            <li>
              <strong>Hosting</strong>: Vercel (frontend) and Supabase (backend edge functions).
            </li>
            <li>
              <strong>Encryption</strong>: Data is encrypted in transit (HTTPS) and at rest
              (provider-managed).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Third-Party Services</h2>
          <p>
            We share data only with the third-party services you explicitly authorize, and only
            the minimum needed to publish:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Google</strong> — Sheets and Drive (read your data, optional write of post
              status).
            </li>
            <li>
              <strong>Meta (Facebook &amp; Instagram)</strong> — pages and accounts you connect.
            </li>
            <li>
              <strong>YouTube / Google</strong> — channels you connect.
            </li>
            <li>
              <strong>TikTok</strong> — accounts you connect via TikTok Login.
            </li>
            <li>
              <strong>Cloudflare R2</strong> — public URLs are fetched by the platforms above
              when delivering your media.
            </li>
          </ul>
          <p>
            We do not sell, rent, or share your data with advertisers, analytics providers, or
            any other third parties.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. Cookies and Tracking</h2>
          <p>
            FlowPost Studio does not use third-party analytics, advertising cookies, or tracking
            pixels. We may use minimal first-party cookies or localStorage to keep you signed in
            to the dashboard.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Post metadata and media files are retained until you delete them or disconnect the
              account.
            </li>
            <li>
              OAuth tokens are retained as long as the account is connected. You can disconnect
              at any time, which sets <code>is_connected = false</code> and revokes the token
              from our database.
            </li>
            <li>
              The <code>tiktok_oauth_states</code> table holds one-time CSRF state values for 10
              minutes only, then is deleted automatically.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Your Rights</h2>
          <p>You can at any time:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Disconnect any social media account from the Accounts page.</li>
            <li>Request a copy of all data we hold about you.</li>
            <li>Request deletion of your account and all associated data.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Children's Privacy</h2>
          <p>
            The Service is not directed to children under 13. We do not knowingly collect
            personal information from children.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The "Last updated" date at the
            top reflects the most recent revision. Continued use of the Service after a change
            indicates acceptance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">10. Contact</h2>
          <p>
            Questions or data requests? Contact:{" "}
            <a className="text-primary hover:underline" href="mailto:syedqasim963@gmail.com">
              syedqasim963@gmail.com
            </a>
          </p>
          <p>
            See also:{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
