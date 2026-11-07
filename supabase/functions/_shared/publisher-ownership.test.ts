import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A publisher posts with the token stored in `connected_accounts`, and it runs
 * with the service role, so no row-level policy stands between it and another
 * user's credentials. The row it publishes carries the owner in `user_id`, so
 * every lookup that reads a secret has to bind that owner — otherwise a post
 * naming someone else's `account_id` is published with their token.
 *
 * The rule is checked in the source of each publisher rather than through one
 * shared query helper because the 22 files that read this table do it for
 * different reasons: the auth functions upsert by their own state row and the
 * admin paths must cross owners on purpose. What is not negotiable is that a
 * credential read names its owner, and a new publisher has to pass this too.
 */
const PUBLISHERS = [
  "instagram-upload",
  "facebook-upload",
  "youtube-upload",
  "linkedin-upload",
  "tiktok-upload",
  "post-story",
];

/**
 * The chained calls after one `from("connected_accounts")`, up to the
 * statement's semicolon: that window is the query the function runs.
 */
function accountQueries(source: string): string[] {
  const marker = 'from("connected_accounts")';
  const queries: string[] = [];
  for (let at = source.indexOf(marker); at !== -1; at = source.indexOf(marker, at + marker.length)) {
    const rest = source.slice(at + marker.length);
    const end = rest.indexOf(";");
    queries.push(end === -1 ? rest : rest.slice(0, end));
  }
  return queries;
}

/**
 * A query that touches a credential, whether it reads one out or writes one
 * back. `select("*")` counts because the row it returns carries the token.
 */
function readsCredentials(query: string): boolean {
  return (
    query.includes("access_token") ||
    query.includes("refresh_token") ||
    query.includes('select("*")')
  );
}

function credentialReadsMissingOwner(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return accountQueries(source)
    .filter(readsCredentials)
    .filter((query) => !query.includes('eq("user_id"'))
    .map((query) => query.replace(/\s+/g, " ").trim().slice(0, 120));
}

describe("publisher account lookups", () => {
  it("cover every publish function", () => {
    expect(PUBLISHERS).toHaveLength(6);
  });

  for (const functionName of PUBLISHERS) {
    it(`${functionName} binds the post's owner when it reads a token`, () => {
      const offenders = credentialReadsMissingOwner(
        join(import.meta.dirname, "..", functionName, "index.ts"),
      );
      expect(offenders).toEqual([]);
    });
  }
});
