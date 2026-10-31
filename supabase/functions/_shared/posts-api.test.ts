import { describe, it, expect } from "vitest";
import {
  POST_COLUMNS,
  accountIdList,
  editPatch,
  idOf,
  insertRow,
  listQuery,
  rangeQuery,
  retryInstant,
} from "./posts-api";

describe("insertRow", () => {
  it("writes the row under the session user, not the one the client sent", () => {
    const result = insertRow("user-1", {
      id: "5c1f0a3e-7f5b-4a0e-9a4e-2f7c1d8b0a11",
      user_id: "user-2",
      platform: "instagram",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: "5c1f0a3e-7f5b-4a0e-9a4e-2f7c1d8b0a11",
        platform: "instagram",
        user_id: "user-1",
      },
    });
  });

  it("drops a field the table does not take", () => {
    const result = insertRow("user-1", {
      id: "post-1",
      published_at: "2026-10-29T09:00:00Z",
      created_at: "2026-10-29T08:00:00Z",
    });

    expect(result).toEqual({ ok: true, value: { id: "post-1", user_id: "user-1" } });
  });

  it("keeps the fields the desktop writes", () => {
    const result = insertRow("user-1", {
      id: "post-1",
      video_id: "video-1",
      platform: "instagram",
      account_id: "ig-1",
      post_type: "feed",
      caption: "Hello",
      hashtags: "#hi",
      scheduled_at: "2026-10-29T12:00:00Z",
      status: "processing",
      captions_enabled: true,
      contains_altered_content: false,
      metadata: { title: "Hi" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scheduled_at).toBe("2026-10-29T12:00:00Z");
      expect(result.value.metadata).toEqual({ title: "Hi" });
      expect(result.value.status).toBe("processing");
    }
  });

  it("refuses a row without an id", () => {
    expect(insertRow("user-1", { platform: "instagram" })).toEqual({
      ok: false,
      status: 400,
      error: "A row needs its id",
    });
  });

  it("refuses a body that is not an object", () => {
    expect(insertRow("user-1", "nope")).toEqual({
      ok: false,
      status: 400,
      error: "A row is required",
    });
    expect(insertRow("user-1", null)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("editPatch", () => {
  it("keeps only the fields an edit may change", () => {
    const result = editPatch({
      caption: "New",
      hashtags: "#new",
      contains_altered_content: true,
      scheduled_at: "2026-10-30T09:00:00Z",
      status: "published",
      user_id: "user-2",
      id: "other",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        caption: "New",
        hashtags: "#new",
        contains_altered_content: true,
        scheduled_at: "2026-10-30T09:00:00Z",
      },
    });
  });

  it("refuses a patch that changes nothing it is allowed to change", () => {
    expect(editPatch({ status: "published" })).toEqual({
      ok: false,
      status: 400,
      error: "A patch needs a field",
    });
  });
});

describe("idOf", () => {
  it("reads the id", () => {
    expect(idOf({ id: "post-1" })).toEqual({ ok: true, value: "post-1" });
  });

  it("refuses a missing or blank id", () => {
    expect(idOf({})).toMatchObject({ ok: false, status: 400 });
    expect(idOf({ id: "   " })).toMatchObject({ ok: false, status: 400 });
    expect(idOf({ id: 7 })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("listQuery", () => {
  it("defaults to the first page", () => {
    expect(listQuery({})).toEqual({
      ok: true,
      value: { offset: 0, limit: 200 },
    });
  });

  it("keeps a known status and platform", () => {
    expect(listQuery({ status: "scheduled", platform: "instagram" })).toEqual({
      ok: true,
      value: { offset: 0, limit: 200, status: "scheduled", platform: "instagram" },
    });
  });

  it("refuses a status the table does not hold", () => {
    expect(listQuery({ status: "cancelled" })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a limit above the page bound", () => {
    expect(listQuery({ limit: 501 })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ limit: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ limit: 1.5 })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a negative offset", () => {
    expect(listQuery({ offset: -1 })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a platform that is not a name", () => {
    expect(listQuery({ platform: "" })).toMatchObject({ ok: false, status: 400 });
    expect(listQuery({ platform: 3 })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("rangeQuery", () => {
  it("keeps two instants in order", () => {
    expect(
      rangeQuery({ from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" }),
    ).toEqual({
      ok: true,
      value: { from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" },
    });
  });

  it("refuses a missing, malformed or empty range", () => {
    expect(rangeQuery({})).toMatchObject({ ok: false, status: 400 });
    expect(rangeQuery({ from: "soon", to: "later" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      rangeQuery({ from: "2026-11-01T00:00:00Z", to: "2026-10-01T00:00:00Z" }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe("accountIdList", () => {
  it("keeps the names once, without blanks", () => {
    expect(accountIdList({ ids: ["ig-1", "ig-1", "", 7, "yt-1"] })).toEqual({
      ok: true,
      value: ["ig-1", "yt-1"],
    });
  });

  it("refuses a body that names no account", () => {
    expect(accountIdList({})).toMatchObject({ ok: false, status: 400 });
    expect(accountIdList({ ids: [] })).toMatchObject({ ok: false, status: 400 });
    expect(accountIdList({ ids: "ig-1" })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses more accounts than one page holds", () => {
    const ids = Array.from({ length: 101 }, (_, index) => `account-${index}`);
    expect(accountIdList({ ids })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("retryInstant", () => {
  it("reads an instant", () => {
    expect(retryInstant({ scheduledAt: "2026-10-29T12:00:00Z" })).toEqual({
      ok: true,
      value: "2026-10-29T12:00:00Z",
    });
  });

  it("refuses a missing or malformed instant", () => {
    expect(retryInstant({})).toMatchObject({ ok: false, status: 400 });
    expect(retryInstant({ scheduledAt: "tomorrow" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("POST_COLUMNS", () => {
  it("never names a token field", () => {
    expect(POST_COLUMNS).not.toMatch(/token/i);
  });
});
