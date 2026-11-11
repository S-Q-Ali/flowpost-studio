import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

/**
 * Notice shown on retired web app and web sign-in routes now that
 * FlowPost Studio runs exclusively as the Windows desktop application.
 */
export default function WebAppShutdownPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-background text-foreground">
      <Logo size="lg" />
      <section className="w-full max-w-md rounded-lg border bg-card p-8 text-center text-card-foreground">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">
          FlowPost Web App Has Shut Down
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The browser dashboard and web sign-in are no longer available. Use the
          FlowPost Windows desktop app to manage uploads, workflows, and
          connected accounts.
        </p>
        <Button asChild className="mt-6 w-full">
          <a href="/#desktop">Download FlowPost Desktop</a>
        </Button>
        <nav
          aria-label="Legal links"
          className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground"
        >
          <Link to="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </nav>
      </section>
    </main>
  );
}
