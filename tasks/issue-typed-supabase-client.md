# Replace the remaining 134 `any` uses with real types

_Draft for the owner to file on GitHub — this session cannot reach the account, so nothing was pushed._

**Title:** Replace the remaining 134 `any` uses with real types

**Body:**

`npm run lint` currently reports 134 `@typescript-eslint/no-explicit-any` findings. The rule is
set to `warn` in `eslint.config.js` so the CI lint job can block on real errors today; this issue
is the reason it is not yet an `error`. There is no code in the tree that these casts are hiding
behind — each one is a type the compiler could check if it were written down.

The client is already typed (`createClient<Database>` in `src/integrations/supabase/client.ts`,
`types.ts` regenerated from the live project), so the 134 split as **76 in `src/`** and **58 in
`supabase/functions/`**, and they fall into four separate groups:

| Group | Count | What it is | Example |
|---|---|---|---|
| Deno functions | 58 | `supabase/functions/**` never had generated types; the service-role client results and `metadata` JSON columns are typed `any` | `_shared/secrets.ts`, `process-workflow/index.ts` (8 each) |
| Page local row shapes narrower than the schema | 61 across `UploadPage` (21), `WorkflowsPage` (18), `AccountsPage` (15), `WorkflowItemsPage` (7) | `WorkflowRow`, `ConnectedAccount` etc. are hand-written and omit columns the generated `Database` has, so the code casts back to `any` to reach them | `(wf as any).data_source` — `data_source` **is** in the generated types |
| `catch (e: any)` | 20 repo-wide | The rest of the tree already uses `err instanceof Error ? err.message : String(err)` | `AccountsPage.tsx:330` |
| JSON payloads from edge functions | the remainder | Drive file lists, `insertedPosts.map((p: any) => p.id)` — the shape crossing `invokeFunction` | `useState<any[]>([])` for Drive files |

**How to do it**

1. Delete the page-local row types that duplicate `Database` and import the generated row types
   (`Database["public"]["Tables"]["workflows"]["Row"]`). This is the group that shrinks the most.
2. Type the JSON payloads that cross the edge-function boundary. `_shared/` already has patterns
   for this (`url-guard.ts`, `post-access.ts`) — reuse them rather than inventing a new layer.
3. Replace every `catch (e: any)` with `catch (e)` plus the narrowing the web code already uses.
4. Give `metadata` a named shape where it is read (subscriber counts, Drive folder entries) so the
   optional chaining stops being `any`-typed.
5. When the count reaches zero, flip the rule back to `"error"` in `eslint.config.js`.

Do it one group at a time, one file per change; the type gate (`npx tsc -b`) finds the fallout.

**Acceptance criteria**

- [ ] `npm run lint` reports no `no-explicit-any` warnings
- [ ] `@typescript-eslint/no-explicit-any` restored to `"error"`
- [ ] `npx tsc -b`, `npm test`, `npm run build` clean

**Related:** issue #71 (closed by the ratchet that made this visible), issue #68 — the `licenses`
table is in the migrations but missing from the generated types, so it cannot be typed until the
migration is applied and `types.ts` regenerated.
