import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Cloud,
  Package,
  Sparkles,
  Calendar,
  Rocket,
  ShieldCheck,
  BarChart3,
  Moon,
  Sun,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/* ────────────────────────── helpers ────────────────────────── */

function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll(".reveal, .reveal-scale");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return rootRef;
}

function BetaBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-500 align-middle">
      Beta
    </span>
  );
}

function PillButton({
  href,
  variant = "primary",
  children,
  className = "",
}: {
  href: string;
  variant?: "primary" | "ghost";
  children: ReactNode;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-base font-medium transition-transform duration-200 hover:scale-[1.03]";
  const styles =
    variant === "primary"
      ? "gradient-primary text-primary-foreground shadow-glow"
      : "border-[1.5px] border-primary text-primary hover:bg-primary/10";
  return (
    <a href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </a>
  );
}

function PlatformChip({ platform, label, beta }: { platform: string; label: string; beta?: boolean }) {
  return (
    <span
      className="flex items-center whitespace-nowrap rounded-2xl border border-border bg-card px-8 py-4 text-lg font-semibold"
      style={{ color: `hsl(var(--${platform}))` }}
    >
      {label}
      {beta && <BetaBadge />}
    </span>
  );
}

/* ────────────────────────── Nav + Hero ────────────────────────── */

function LandingNav() {
  const { theme, setTheme } = useTheme();
  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl [backdrop-filter:saturate(180%)_blur(20px)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="gradient-primary flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight">FlowPost</span>
        </div>
        <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#platforms" className="transition-colors hover:text-foreground">Platforms</a>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </a>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-foreground"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <a
            href="#cta"
            className="gradient-primary rounded-full px-5 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform duration-200 hover:scale-[1.03]"
          >
            Get Started
          </a>
        </div>
      </div>
    </nav>
  );
}

function HeroPipelineCard() {
  const stages: { icon: LucideIcon; label: string; time: string; state: "done" | "active" | "pending" }[] = [
    { icon: Cloud, label: "Drive File", time: "9:00 AM", state: "done" },
    { icon: Sparkles, label: "AI Caption", time: "9:01 AM", state: "done" },
    { icon: Calendar, label: "Scheduled", time: "6:00 PM", state: "active" },
    { icon: Rocket, label: "Posted", time: "pending", state: "pending" },
  ];
  return (
    <div className="reveal-scale visible animate-float-y mx-auto mt-20 max-w-3xl">
      <div className="rounded-3xl border border-border bg-popover p-6 text-left shadow-glow md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live Pipeline</span>
          <span className="rounded-full bg-[hsl(142_71%_45%_/_0.15)] px-3 py-1 text-xs font-medium text-[hsl(var(--status-published))]">
            ● Running
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {stages.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-2 md:gap-3">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <div
                className={`flex-1 rounded-xl border p-3 text-center ${
                  s.state === "active" ? "border-primary bg-primary/10" : "border-border bg-card"
                } ${s.state === "pending" ? "opacity-60" : ""}`}
              >
                <s.icon className={`mx-auto h-5 w-5 ${s.state === "active" ? "text-primary" : "text-foreground"}`} />
                <p className="mt-1 text-[11px] font-medium md:text-xs">{s.label}</p>
                <p
                  className={`text-[10px] ${
                    s.state === "done"
                      ? "text-[hsl(var(--status-published))]"
                      : s.state === "active"
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {s.state === "done" ? `✓ ${s.time}` : s.state === "active" ? `● ${s.time}` : s.time}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="px-6 pb-24 pt-40 text-center">
      <p className="reveal visible mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        Introducing FlowPost Pipeline
      </p>
      <h1 className="headline-xl mx-auto max-w-4xl">
        Content that <span className="text-gradient">posts itself.</span>
      </h1>
      <p className="body-lg mx-auto mt-6 max-w-2xl text-muted-foreground">
        From a file in your Drive to a post on every platform — automatically. You create. The pipeline does the rest.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <PillButton href="#cta">
          Start your pipeline <ArrowRight className="h-4 w-4" />
        </PillButton>
        <PillButton href="#how" variant="ghost">
          See how it works
        </PillButton>
      </div>
      <HeroPipelineCard />
    </header>
  );
}

/* ────────────────────────── How it works ────────────────────────── */

function StepHeading({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="reveal">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">{step}</p>
      <h3 className="headline-md mb-4 text-3xl">{title}</h3>
      <p className="body-lg text-muted-foreground">{body}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal mb-20 text-center">
          <h2 className="headline-lg">
            Four steps. <span className="text-gradient">Zero effort.</span>
          </h2>
          <p className="body-lg mx-auto mt-4 max-w-xl text-muted-foreground">
            One pipeline connects your storage to your social platforms. Set it up once — it runs forever.
          </p>
        </div>

        {/* Step 1 — storage */}
        <div className="mb-28 grid items-center gap-12 md:grid-cols-2">
          <StepHeading
            step="Step 1"
            title="Connect your storage."
            body="Point the pipeline at any Google Drive or Mega folder. New files appear — the pipeline notices, instantly."
          />
          <div className="reveal-scale reveal-delay-1 rounded-3xl border border-border bg-card p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
            <div className="mx-auto w-full max-w-xs">
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-popover p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                  <Cloud className="h-5 w-5 text-foreground" />
                </span>
                <div>
                  <p className="text-sm font-semibold">/content/weekly</p>
                  <p className="text-xs text-muted-foreground">Google Drive · synced</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-popover p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                  <Package className="h-5 w-5 text-foreground" />
                </span>
                <div>
                  <p className="text-sm font-semibold">/reels-archive</p>
                  <p className="text-xs text-muted-foreground">Mega · synced</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2 — AI captions */}
        <div className="mb-28 grid items-center gap-12 md:grid-cols-2">
          <div className="reveal-scale order-2 rounded-3xl border border-border bg-card p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow md:order-1">
            <div className="mx-auto w-full max-w-xs">
              <div className="rounded-xl border border-border bg-popover p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  ✨ AI Caption — FB + IG
                </p>
                <p className="text-sm leading-relaxed">
                  "AI is changing content creation forever 🚀 Here is what every creator needs to know…"
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["#AItools", "#creator", "#2026"].map((tag) => (
                    <span key={tag} className="rounded-full bg-accent px-2 py-1 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2">
            <StepHeading
              step="Step 2"
              title="AI writes your captions."
              body="Your master prompt. Your tone. Platform-perfect captions with hashtags for Facebook, Instagram & YouTube (stable) — plus TikTok & LinkedIn in beta — generated in seconds."
            />
          </div>
        </div>
        {/* Step 3 — scheduling */}
        <div className="mb-28 grid items-center gap-12 md:grid-cols-2">
          <StepHeading
            step="Step 3"
            title="Schedule on autopilot."
            body="Smart intervals, time-zone aware, with a live content calendar. The engine posts every 5 minutes — you never touch a publish button again."
          />
          <div className="reveal-scale reveal-delay-1 rounded-3xl border border-border bg-card p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
            <div className="mx-auto w-full max-w-xs space-y-2.5">
              {[
                { when: "Tomorrow · 6:00 PM", platform: "instagram", short: "IG" },
                { when: "Fri · 9:00 AM", platform: "youtube", short: "YT" },
                { when: "Sat · 12:30 PM", platform: "facebook", short: "FB" },
              ].map((item) => (
                <div key={item.when} className="flex items-center justify-between rounded-xl border border-border bg-popover p-3">
                  <span className="text-xs font-medium">📅 {item.when}</span>
                  <span
                    className="rounded-full px-2 py-1 text-[10px] text-white"
                    style={{ backgroundColor: `hsl(var(--${item.platform}))` }}
                  >
                    {item.short}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step 4 — tracking */}
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div
            className="reveal-scale order-2 rounded-3xl border p-8 shadow-card transition-all duration-300 hover:-translate-y-1 md:order-1"
            style={{ backgroundColor: "hsl(330 40% 10%)", borderColor: "hsl(330 20% 22%)" }}
          >
            <div className="mx-auto w-full max-w-xs space-y-2.5">
              {[
                { file: "tips-reel.mp4 → Instagram", meta: "Posted 2h ago · 1.2k views" },
                { file: "vlog-ep12.mp4 → YouTube", meta: "Posted 5h ago · 340 views" },
              ].map((post) => (
                <div
                  key={post.file}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ backgroundColor: "hsl(330 25% 15%)" }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs text-white"
                    style={{ backgroundColor: "hsl(var(--status-published))" }}
                  >
                    ✓
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[hsl(330_35%_88%)]">{post.file}</p>
                    <p className="text-xs text-[hsl(330_15%_60%)]">{post.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="order-1 md:order-2">
            <StepHeading
              step="Step 4"
              title="Track every post, live."
              body="A live timeline shows every fetch, caption, schedule and publish. If something fails, you know in seconds — not days."
            />
          </div>
        </div>
{/* ANCHOR-STEPS34 */}
      </div>
    </section>
  );
}

/* ────────────────────────── Features + Platforms ────────────────────────── */

function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal mb-16 text-center">
          <h2 className="headline-lg">
            Everything. <span className="text-gradient">One pipeline.</span>
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="reveal rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow md:col-span-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <h3 className="headline-md mb-2 mt-4">AI captions that sound like you</h3>
            <p className="text-muted-foreground">
              A master prompt defines your voice once — every platform gets a caption tuned to its audience, with smart hashtags.
            </p>
          </div>
          <div className="reveal reveal-delay-1 rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
            <Cloud className="h-8 w-8 text-primary" />
            <h3 className="headline-md mb-2 mt-4">Drive + Mega built in</h3>
            <p className="text-muted-foreground">Files flow straight from your cloud storage. No downloads, no uploads, no middleman.</p>
          </div>
          <div className="reveal rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <h3 className="headline-md mb-2 mt-4">Smart retry & failure alerts</h3>
            <p className="text-muted-foreground">Transient errors retry automatically. Real failures alert you instantly.</p>
          </div>
          <div className="reveal reveal-delay-1 rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow md:col-span-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h3 className="headline-md mb-2 mt-4">Insights on autopilot</h3>
            <p className="text-muted-foreground">
              Queued, processing, scheduled, published — a live funnel shows exactly where every piece of content is in the pipeline, right on your dashboard.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Platforms() {
  const chips = [
    { platform: "facebook", label: "f · Facebook" },
    { platform: "instagram", label: "◉ · Instagram" },
    { platform: "youtube", label: "▶ · YouTube" },
    { platform: "tiktok", label: "♪ · TikTok", beta: true },
    { platform: "linkedin", label: "in · LinkedIn", beta: true },
  ];
  return (
    <section id="platforms" className="overflow-hidden py-20">
      <p className="reveal mb-10 text-center text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Publishes everywhere you are
      </p>
      <div className="relative">
        <div className="marquee-track flex w-max gap-6">
          {[...chips, ...chips].map((chip, i) => (
            <PlatformChip key={`${chip.platform}-${i}`} platform={chip.platform} label={chip.label} beta={chip.beta} />
          ))}
        </div>
      </div>
      <p className="reveal mx-auto mt-8 max-w-2xl px-6 text-center text-xs text-muted-foreground">
        <BetaBadge /> TikTok &amp; LinkedIn support is in beta — early access, actively improving. Facebook, Instagram
        &amp; YouTube are fully stable.
      </p>
    </section>
  );
}

/* ────────────────────────── Stats + CTA + Footer ────────────────────────── */

function Stats() {
  const stats = [
    { value: "5", label: "Platforms · 3 stable + 2 in beta" },
    { value: "24/7", label: "Pipeline never sleeps" },
    { value: "0", label: "Publish buttons pressed" },
  ];
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-4xl grid-cols-3 gap-8 text-center">
        {stats.map((stat, i) => (
          <div key={stat.value} className={`reveal ${i === 1 ? "reveal-delay-1" : i === 2 ? "reveal-delay-2" : ""}`}>
            <p className="headline-xl text-gradient">{stat.value}</p>
            <p className="mt-2 text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="px-6 py-28 text-center">
      <div className="reveal-scale mx-auto max-w-3xl">
        <h2 className="headline-xl">
          Your content. <span className="text-gradient">On autopilot.</span>
        </h2>
        <p className="body-lg mt-6 text-muted-foreground">
          Set up your first pipeline in under two minutes. Your future self — the one who stopped copy-pasting captions
          — says thanks.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PillButton href="/dashboard" className="!px-10 !py-4 text-lg">
            Start your pipeline <ArrowRight className="h-5 w-5" />
          </PillButton>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Free to try · No credit card required</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span className="gradient-primary flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold text-primary-foreground">
            F
          </span>
          <span>FlowPost Studio</span>
        </div>
        <div className="flex gap-6">
          <a href="/terms" className="transition-colors hover:text-foreground">Terms</a>
          <a href="/privacy" className="transition-colors hover:text-foreground">Privacy</a>
          <a href="/dashboard" className="transition-colors hover:text-foreground">Dashboard</a>
        </div>
        <p>© {new Date().getFullYear()} FlowPost Studio</p>
      </div>
    </footer>
  );
}

/* ────────────────────────── Page ────────────────────────── */

const PipelineLandingPage = () => {
  const rootRef = useScrollReveal();

  useEffect(() => {
    document.title = "FlowPost Pipeline — Content that posts itself. | Social Media Automation";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        "content",
        "One pipeline connects your Google Drive or Mega storage to every social platform. AI captions, autopilot scheduling, live tracking — Facebook, Instagram, YouTube & more. TikTok & LinkedIn in beta."
      );
    }
  }, []);

  return (
    <div ref={rootRef} className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <style>{`
        .headline-xl { font-size: clamp(2.75rem, 7vw, 5.5rem); font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
        .headline-lg { font-size: clamp(2rem, 4.5vw, 3.5rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
        .headline-md { font-size: clamp(1.4rem, 2.5vw, 2rem); font-weight: 600; letter-spacing: -0.01em; }
        .body-lg { font-size: clamp(1.1rem, 2vw, 1.4rem); line-height: 1.5; }
      `}</style>
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Platforms />
        <Stats />
        <Cta />
      </main>
      <Footer />
    </div>
  );
};

export default PipelineLandingPage;




