# ADR 0003: A local SQLite database for the cache and the drafts

**Status:** Proposed (2026-10-29)
**Module:** `offline`
**Deciders:** project owner

## Context

The offline slice needs two local stores:

1. **A cache of reads** — the admin's `posts`, the `connected_accounts` display fields, the `videos` rows the posts point at, and the profile — so the app opens and shows something when the machine has no connection.
2. **A store of the compose drafts** — the caption, the title and the time the admin has typed but not yet published. The server does not have these, and there is nowhere else they exist.

The plan's acceptance criteria for the cache are explicit about what it must be (`tasks/plan.md`, Task 5.3): *"Posts, accounts, and profile reads are cached; cache is refreshed after writes; stale data is marked; schema version and migration path exist; corrupt DB is handled without data loss."* A schema version, a migration path and corruption recovery are the parts that decide this question — they are the reason the cache is a database and not a file of JSON.

Constraints:

- Windows 10/11 x64, self-contained installer, no system dependency the admin has to install.
- The server stays the source of truth. There is no new backend service.
- The transport layer is `dart:io`'s `HttpClient` only — the app has deliberately added no HTTP package.
- One admin, one machine, one account. The dataset is bounded (a few hundred posts).
- The app already persists something locally: the connected-account list as `accounts.json`, written through a temp file and a rename (`desktop-flutter/lib/features/accounts/data/accounts_repository.dart:38-45`). There is no database in the tree, and no SQLite, drift or sqflite dependency (`desktop-flutter/pubspec.yaml:19-61`).

The question this ADR answers: **which SQLite engine, and is SQLite the right tool at all.**

## Decision

### 1. `package:sqlite3` 3.8.0, directly — not sqflite, not drift

`package:sqlite3` 3.x binds SQLite over `dart:ffi` and obtains the library through **Dart build hooks (native assets)**: the package's own dependencies are `hooks`, `code_assets` and `native_toolchain_c`, and its published platform list is Android, iOS, Linux, macOS, Windows and Web. The SQLite amalgamation is compiled from source at build time and bundled into the app.

**No installer change is needed, and no system SQLite is needed.** The spike on 2026-10-29 settled where the compiled library lands: the build hook writes `build/native_assets/windows/sqlite3.dll`, and the Flutter build copies it next to the executable. So a `sqlite3.dll` of 1.7 MB **does** sit beside `flowpost.exe` — the usual objection to SQLite on Windows is true in shape. It does not matter in practice: the installer already copies the whole `Release` folder (`installer/flowpost.iss`), so the DLL ships without a line changing, and the app carries its own SQLite rather than depending on one the machine may or may not have. This is the same shape as every Flutter Windows plugin DLL the app already ships.

- **Version floor:** the package needs Dart `>= 3.10.0 < 4.0.0`; the project is on Dart 3.13.7 / Flutter 3.47.8. Build hooks need Dart ≥ 3.10.0 or Flutter ≥ 3.38.0, and both the Dart VM and the Flutter tool run the package's hook.
- **No new build requirement:** the hook compiles through `native_toolchain_c`, which uses the system C compiler. A Flutter Windows build already needs the Visual Studio C++ toolchain, so nothing new is asked of the build machine.
- **The fallback exists:** the hook accepts `source: system`, so a build that cannot compile the amalgamation can load a system SQLite instead. It is not the default.
- **`drift` is not used.** It is a second abstraction over the same engine plus a code generator (`drift_dev` and `build_runner`) and a second build step, for a dataset that a handful of hand-written statements cover.
- **`sqflite` is not used.** It has no Windows target — its supported platforms are iOS, Android and macOS, and its Windows path is `sqflite_common_ffi`, which is `package:sqlite3` under another name with a plugin layer the app does not need.

### 2. The engine sits behind one small interface

```dart
/// The local store the cache and the drafts use.
abstract class LocalStore {
  Future<void> open();
  Future<void> close();
  Future<int> version();
  Future<void> migrate(int toVersion);
}
```

The screen never writes SQL, the SQL never comes from user input (every value is a bound parameter), and the tests run against a temporary file through the same interface.

### 3. Two databases, not one

`cache.db` holds the rebuildable reads; `drafts.db` holds the compose drafts. They are separate files so that a cache that is wiped, rebuilt or corrupted never reaches a draft — the no-data-loss rule then costs nothing to keep. The cache and the drafts are also different shapes (a snapshot with a version and a timestamp, versus a single mutable row per media), and one file for both would mean one transaction spanning two unrelated lifetimes.

### 4. The schema version lives in the database

The version is a row in a `meta` table, not a file name. Migrations are numbered, run in order, each in its own transaction, and are covered by a test that opens a database at the previous version and migrates it. A database whose version is **higher** than the app's is not touched at all: the app runs without a cache and says so. A downgrade must never destroy data.

### 5. A database that will not open is renamed, never deleted

`cache.db` becomes `cache.corrupt-20261029-1432.db` and the app carries on without it. A broken drafts database is opened read-only first, so a draft that can still be read can be copied out; if it cannot be read at all, the app asks before it starts fresh, and the old file is renamed rather than removed. Nothing on disk is deleted without the admin clicking.

### 6. The cache holds no token

The `connected_accounts` rows are stored without `access_token`, `refresh_token`, `token_expiry` or `metadata`; the client asks the server for the four display fields by name, so the tokens are never fetched and can never be written down. The profile is stored without the session token. The rule is the same one the local account store already follows (`desktop-flutter/lib/features/accounts/domain/connected_account.dart:34-39`).

### 7. The cache is a bounded snapshot

The newest 500 posts and 500 videos. The server keeps the rest, and the calendar only ever asks for one month.

## Alternatives rejected

| Option | Why not |
|---|---|
| `sqflite` | No Windows target (iOS, Android, macOS). Its Windows path is `sqflite_common_ffi`, which is `package:sqlite3` with a plugin layer on top |
| `sqflite_common_ffi` | The same engine under another name, plus a plugin the app does not need |
| `drift` | A code generator, a second build step and a second abstraction over the same engine; the dataset does not need its query builder or its type-safe row classes |
| A JSON file per table, like `accounts.json` | Fine for one small list. A versioned schema, an ordered migration path, row-level upserts and corruption recovery over JSON means writing a database by hand — and then the file format becomes the schema |
| One database for the cache and the drafts | A cache rebuild or a wipe takes the drafts with it; the two have different shapes and different lifetimes |
| The system SQLite on Windows (`winsqlite3.dll`) | It is the WinRT variant, not the SQLite the FFI bindings expect; depending on an OS component that can change is the kind of hidden dependency an installer should not carry |
| Caching in memory only | A draft has to survive a restart, and a cache that dies with the process is not a cache |
| The web app's `src/lib/offline-db.ts` (IndexedDB) | Dead code in the web app — `offlineDB` is never imported (`src/lib/offline-db.ts:84`) — and IndexedDB does not exist in a desktop client |

## Consequences

- **One new dependency**, `sqlite3` (3.8.0), plus its own chain (`ffi`, `hooks`, `code_assets`, `native_toolchain_c`). No database *framework* is added, so the Dart-side surface stays small.
- **The build compiles SQLite from source.** The first build on a machine is slower, and the build needs the C compiler the Flutter Windows build already needs.
- **The app gains a native asset.** `sqlite3.dll`, 1.7 MB, measured by the spike. The installer grows by that much and needs no change.
- **The SQL surface is small and hand-written.** Five tables, a handful of statements, every value a bound parameter.
- **The tests need a temporary file.** The store's tests open a real database in a temp directory; the seam is the interface, not an in-memory fake.
- **The cache is not encrypted.** It holds the admin's own captions, titles and file URLs on the admin's own machine, in the app's own support folder — the same posture as the existing `accounts.json`. Recorded in `SPEC-offline.md` so it is a decision and not an accident.
- **A downgrade is safe.** An older app ignores a newer database instead of corrupting it.

## Verification

- **Spike, before 5.3.** Add `sqlite3` to `desktop-flutter/pubspec.yaml`, open a database in a temp directory, create a table, write a row, read it back, close it, reopen it — under `flutter test` and under `flutter build windows`. The risk this closes: the build hook has to run in the test runner on Windows, and that is the one thing the sources do not settle.
- **The spike must also show** that the compiled asset is inside the built app and that no `sqlite3.dll` sits next to the executable.

### Spike result (2026-10-29) — done, and it corrected the ADR

| Check | Result |
|---|---|
| `flutter test` opens a database in a temp dir, writes a row, reads it back, closes and reopens | **Pass.** The hook runs in the test runner on Windows; the row was still there after the reopen |
| `flutter build windows --release` | **Pass** (exit 0) |
| Where the compiled library lands | `build/native_assets/windows/sqlite3.dll`, copied to `build/windows/x64/runner/Release/sqlite3.dll` (1.7 MB) and recorded in `native_assets.json` under `package:sqlite3/src/ffi/libsqlite3.g.dart` |
| No `sqlite3.dll` next to the executable | **Fail, and the ADR was wrong about this.** The DLL is next to `flowpost.exe`. The conclusion survives anyway: `installer/flowpost.iss` copies the whole `Release` folder, so the DLL ships with no change to the installer, and the app needs no system SQLite |
| The package pulls in anything else | `sqlite3` 3.8.0 and its own chain only; `flutter pub add sqlite3` added one direct dependency |

The spike test is kept at `desktop-flutter/test/features/offline/local_database_test.dart`.
- **Then**, the schema, the migrations and the corruption rules are covered by the tests named in `SPEC-offline.md`.

## Open questions

- Whether the cache also keeps the `videos` rows (the media the posts point at) — proposed yes, with only the fields the queue card shows.
- Whether more than one draft per media is wanted — proposed one.
- Whether the cache is wiped on sign-out while the drafts are kept — proposed yes (a sign-out is often a shared-machine handover, and a draft is the admin's own words).

## Sources

- [`package:sqlite3` on pub.dev](https://pub.dev/packages/sqlite3) — the version, the platform list, and the Dart-hooks bundling.
- [`package:sqflite` on pub.dev](https://pub.dev/packages/sqflite) — the supported platforms and the Windows path.
- [Dart build hooks](https://dart.dev/tools/hooks) — how a package provides a native asset.
- [`package:sqlite3` hook options](https://pub.dev/documentation/sqlite3/latest/topics/hook-topic.html) — the `source: system` fallback.
