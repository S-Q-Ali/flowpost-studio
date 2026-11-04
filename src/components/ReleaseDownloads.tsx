import { useState } from "react";
import { Check, Copy, Download, FileArchive, ShieldCheck } from "lucide-react";

import {
  RELEASE_ASSETS,
  desktopDownloadUrl,
  formatBytes,
  type ReleaseFile,
  type ReleaseStatus,
} from "../lib/desktop-download";

function Checksum({ file }: { file: ReleaseFile }) {
  const [copied, setCopied] = useState(false);
  if (!file.sha256) return null;

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(file.sha256)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
      className="group inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      title={`SHA-256 of ${file.name}`}
    >
      <span className="truncate font-mono">{file.sha256.slice(0, 16)}…</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--status-published))]" aria-label="Copied" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
    </button>
  );
}

function FileRow({ file, primary }: { file: ReleaseFile; primary: boolean }) {
  const Icon = primary ? Download : FileArchive;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatBytes(file.sizeBytes)} ·{" "}
          {primary ? "installs for your user, adds the start-menu entry" : "extract and run, no install"}
        </p>
        <Checksum file={file} />
      </div>
      <a
        href={file.url}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-transform duration-200 hover:scale-[1.03] ${
          primary
            ? "gradient-primary text-primary-foreground shadow-glow"
            : "border-[1.5px] border-primary text-primary hover:bg-primary/10"
        }`}
        aria-label={`Download ${file.name}`}
      >
        <Icon className="h-4 w-4" aria-hidden />
        Get {primary ? "the installer" : "the zip"}
      </a>
    </div>
  );
}

/** The Windows downloads, read live from the newest GitHub release. */
export function ReleaseDownloads({ status }: { status: ReleaseStatus | null }) {
  return (
    <section
      id="download"
      className="reveal scroll-mt-24 rounded-3xl border border-border bg-popover/40 p-6 md:p-8"
      aria-labelledby="download-heading"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="download-heading" className="text-xl font-semibold tracking-tight">
            Windows download
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {status?.state === "ready"
              ? `Version ${status.version}, published ${formatDate(status.publishedAt)}.`
              : "The newest build straight from the release."}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Checksummed with SHA-256
        </p>
      </div>

      {status === null ? (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading the release">
          {[0, 1].map((key) => (
            <div key={key} className="h-[76px] animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : status.state === "ready" ? (
        <div className="space-y-3">
          <FileRow file={status.files.installer} primary />
          <FileRow file={status.files.portable} primary={false} />
          <p className="text-xs text-muted-foreground">
            Verify after the download:{" "}
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[11px]">
              certutil -hashfile {RELEASE_ASSETS.installer} SHA256
            </code>
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="status">
          <p className="font-medium text-foreground">
            {status.state === "no-release"
              ? "No Windows build is published yet."
              : "The release list could not be reached."}
          </p>
          <p className="mt-1 text-muted-foreground">
            {status.state === "no-release"
              ? "The first tagged build appears here automatically."
              : "GitHub is not answering right now; try the releases page directly."}
          </p>
          <a
            href={desktopDownloadUrl(null)}
            className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            Open releases <Download className="h-4 w-4" aria-hidden />
          </a>
        </div>
      )}
    </section>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "recently"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
