import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0F0F0F" }}>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-zinc-300">
        <header className="flex items-center gap-3">
          <Link to="/dashboard" aria-label="FlowPost Studio">
            <Logo size="md" />
          </Link>
        </header>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-sm text-zinc-500">Last updated: June 7, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. Acceptance of Terms</h2>
          <p>
            By accessing or using FlowPost Studio ("the Service"), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. Service Description</h2>
          <p>
            FlowPost Studio is a workflow automation tool that posts videos and images to social
            media platforms (Facebook, Instagram, YouTube, TikTok) on your behalf, based on rules
            you configure. The Service reads data from Google Sheets you authorize, uploads media
            to Cloudflare R2 for delivery, and dispatches posts through each platform's official
            API.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. Account Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              You are responsible for the security of your account, including any passwords,
              sessions, and authorized social media connections.
            </li>
            <li>
              You must own or have explicit rights to all content (videos, images, captions,
              hashtags) you post through the Service.
            </li>
            <li>
              You agree to comply with the Terms of Service of every social platform you connect
              (Facebook, Instagram, YouTube, TikTok). The Service is not responsible for content
              removed, accounts suspended, or limits applied by those platforms.
            </li>
            <li>
              You will not use the Service to post spam, illegal content, copyrighted material you
              do not own, or content that violates any applicable law.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">4. Third-Party Services</h2>
          <p>
            The Service integrates with: Google Sheets API, Google Drive, Cloudflare R2, Meta
            Graph API (Facebook &amp; Instagram), YouTube Data API, and TikTok Content Posting API.
            Your use of these services is subject to their respective terms. We are not
            responsible for changes, outages, or policy changes made by these providers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. No Warranty</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind,
            express or implied, including but not limited to warranties of merchantability,
            fitness for a particular purpose, or non-infringement. We do not guarantee that posts
            will succeed, that platforms will remain available, or that the Service will be
            uninterrupted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, FlowPost Studio and its operators shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages
            arising from your use of the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">7. Termination</h2>
          <p>
            You may stop using the Service at any time by disconnecting your social media accounts
            in the Accounts page. We reserve the right to suspend or terminate access for users
            who violate these Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">8. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service after
            changes constitutes acceptance of the new Terms. The "Last updated" date at the top
            reflects the most recent revision.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">9. Contact</h2>
          <p>
            Questions about these Terms? Contact:{" "}
            <a className="text-primary hover:underline" href="mailto:syedqasim963@gmail.com">
              syedqasim963@gmail.com
            </a>
          </p>
          <p>
            See also:{" "}
            <Link to="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
