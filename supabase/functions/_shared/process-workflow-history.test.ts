import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as history from "./workflow-runs";

const source = readFileSync(join(import.meta.dirname, "../process-workflow/index.ts"), "utf8");
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
const workflow = (id = "wf-1", extra = {}) => ({
  id, user_id: id, name: id, sheet_id: id, media_type: "video",
  platforms: ["instagram"], instagram_account_ids: ["ig-1", "ig-2"], ...extra,
});
const sheet = [
  ["video_url", "status"],
  ["https://drive.google.com/file/d/synthetic-file", "ready to post"],
];

afterEach(() => vi.restoreAllMocks());

function fixture(options: {
  workflows?: ReturnType<typeof workflow>[];
  rows?: string[][];
  sourceThrows?: boolean;
  failedOpen?: boolean;
  failedPosts?: boolean;
  failAfterInsert?: boolean;
  fatalAfterInsert?: boolean;
  missingDrive?: string;
  maintenanceThrows?: boolean;
} = {}) {
  const runs: Record<string, unknown>[] = [];
  const posts: Record<string, unknown>[] = [];
  const locks = new Set<string>();
  const workflows = options.workflows ?? [workflow()];
  let openAttempt = 0;
  let videoCount = 0;
  const supabase = {
    from(table: string) {
      let action = "select";
      let payload: any;
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query,
        single: () => query,
        maybeSingle: () => query,
        order: () => query,
        abortSignal: () => query,
        lt: () => query,
        in: () => query,
        match(values: Record<string, unknown>) { Object.assign(filters, values); return query; },
        eq(column: string, value: unknown) { filters[column] = value; return query; },
        insert(value: unknown) { action = "insert"; payload = value; return query; },
        update(value: unknown) { action = "update"; payload = value; return query; },
        delete() { action = "delete"; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve().then(() => {
            if (table === "workflow_locks") {
              if (action === "insert") locks.add(payload.lock_key);
              if (action === "delete") locks.delete(String(filters.lock_key));
            }
            if (table === "workflow_runs") {
              if (action === "insert") {
                openAttempt++;
                if (options.failedOpen && openAttempt === 1) return { data: null, error: { message: "history unavailable" } };
                const run = { id: `run-${openAttempt}`, ...payload };
                runs.push(run);
                return { data: run, error: null };
              }
              if (filters.id) Object.assign(runs.find((run) => run.id === filters.id)!, payload);
              else if (options.maintenanceThrows) throw new Error("history maintenance unavailable");
            }
            if (table === "workflows" && action === "select") return { data: workflows, error: null };
            if (table === "workflows" && action === "update" && options.fatalAfterInsert) throw new Error("stats transport failed");
            if (table === "videos" && action === "insert") return { data: { id: `video-${++videoCount}` }, error: null };
            if (table === "posts" && action === "insert") {
              if (options.failedPosts) return { data: null, error: { message: "insert refused" } };
              const batch = (Array.isArray(payload) ? payload : [payload]).map((post: Record<string, unknown>, index: number) => ({ id: `post-${posts.length + index + 1}`, ...post }));
              posts.push(...batch);
              return { data: Array.isArray(payload) ? batch : batch[0], error: null };
            }
            if (table === "posts" && action === "update" && options.failAfterInsert) throw new Error("metadata transport failed");
            if (table === "connected_accounts") return { data: { access_token: "synthetic-token" }, error: null };
            return { data: null, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("sheets.googleapis.com")) {
      if (options.sourceThrows) throw new Error("source read failed");
      return Response.json({ values: options.rows ?? sheet });
    }
    return Response.json({ success: true });
  });
  let handler!: (request: Request) => Promise<Response>;
  const dependencies: Record<string, unknown> = {
    "npm:@supabase/supabase-js@2.49.0": { createClient: () => supabase },
    "../_shared/crypto.ts": { decrypt: async () => "synthetic-token" },
    "../_shared/get-file-token.ts": { fileProxyUrl: async () => "https://example.invalid/media" },
    "../_shared/google-drive.ts": {
      driveMediaUrl: () => "https://example.invalid/media",
      getDriveToken: async (userId: string) => userId === options.missingDrive ? null : "synthetic-token",
    },
    "../_shared/auth.ts": { createSessionLookup: () => ({}), createRequestAuthorizer: () => async () => ({ allowed: true, kind: "cron" }) },
    "../_shared/workflow-schedule.ts": { skipReason: () => null },
    "../_shared/workflow-runs.ts": history,
    "npm:@aws-sdk/client-s3": {},
    "npm:@aws-sdk/s3-request-presigner": {},
  };
  runInNewContext(compiled, {
    exports: {},
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    Deno: {
      env: { get: (name: string) => ({ SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key", CRON_API_KEY: "synthetic-cron-key" })[name] },
      serve: (fn: typeof handler) => { handler = fn; },
    },
    fetch, Response, Request, AbortSignal, Error,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn: () => void, ms: number) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; },
  });
  return {
    runs, posts, locks,
    invoke: () => handler(new Request("https://example.invalid/process-workflow", { method: "POST", body: "{}" })),
  };
}

describe("workflow history through the real handler", () => {
  it("records a rejected source read as failed and releases its lock", async () => {
    const app = fixture({ sourceThrows: true });
    expect((await app.invoke()).status).toBe(500);
    expect(app.runs[0]).toMatchObject({ status: "failed", message: "source read failed", posts_created: 0 });
    expect(app.locks.size).toBe(0);
  });

  it("does not carry a failed-open workflow's counters into the next workflow", async () => {
    const app = fixture({ workflows: [workflow("a"), workflow("b")], failedOpen: true, missingDrive: "b" });
    await app.invoke();
    expect(app.runs).toHaveLength(1);
    expect(app.runs[0]).toMatchObject({ workflow_id: "b", status: "failed", rows_seen: 0, posts_created: 0 });
  });

  it("counts each target post, not the one source row", async () => {
    const app = fixture();
    await app.invoke();
    expect(app.posts).toHaveLength(2);
    expect(app.runs[0]).toMatchObject({ rows_seen: 1, posts_created: 2 });
  });

  it("counts carousel posts, not carousel images", async () => {
    const app = fixture({
      workflows: [workflow("wf-1", { media_type: "carousel", instagram_account_ids: ["ig-1"] })],
      rows: [["image_url_1", "image_url_2", "status"], ["https://drive.google.com/file/d/a", "https://drive.google.com/file/d/b", "ready to post"]],
    });
    await app.invoke();
    expect(app.posts).toHaveLength(1);
    expect(app.runs[0]).toMatchObject({ rows_seen: 1, posts_created: 1 });
  });

  it("includes the additional inserted Instagram story rows", async () => {
    const app = fixture({ workflows: [workflow("wf-1", { post_as_story: true })] });
    await app.invoke();
    expect(app.posts).toHaveLength(4);
    expect(app.runs[0]).toMatchObject({ posts_created: 4 });
  });

  it("keeps inserted counts when later row work throws", async () => {
    const app = fixture({ failAfterInsert: true });
    await app.invoke();
    expect(app.runs[0]).toMatchObject({ rows_seen: 1, posts_created: 2 });
  });

  it("records a fatal error without losing already inserted counts", async () => {
    const app = fixture({ fatalAfterInsert: true });
    expect((await app.invoke()).status).toBe(500);
    expect(app.runs[0]).toMatchObject({ status: "failed", rows_seen: 1, posts_created: 2, message: "stats transport failed" });
  });

  it("never counts rejected inserts", async () => {
    const app = fixture({ failedPosts: true });
    await app.invoke();
    expect(app.posts).toHaveLength(0);
    expect(app.runs[0]).toMatchObject({ posts_created: 0 });
  });

  it("does not let a failed history sweep prevent workflow processing", async () => {
    const app = fixture({ maintenanceThrows: true });
    await expect(app.invoke()).resolves.toHaveProperty("status", 200);
    expect(app.posts).toHaveLength(2);
  });
});
