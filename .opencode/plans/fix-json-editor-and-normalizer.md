# Fix: JSON Editor Frozen + Edge Function Normalizer

## Problem 1: Frozen JSON textarea
`CaptionPromptEditor.tsx` uses a derived `jsonString` that only updates when `JSON.parse` succeeds. While typing/pasting invalid JSON (most keystrokes), `onChange` never fires → parent `value` never updates → textarea appears frozen.

### Fix
Replace derived `jsonString` with a local `jsonBuffer` state:

1. Add `const [jsonBuffer, setJsonBuffer] = useState("{}")` and `const [jsonError, setJsonError] = useState(false)`
2. `handleTabChange`: when switching **to** `"json"` tab → init buffer from `JSON.stringify(value, null, 2) || "{}"`; when switching **to** `"template"` tab → try `JSON.parse(jsonBuffer)`, call `onChange` if valid
3. Textarea uses `jsonBuffer` as `value`, `setJsonBuffer` on every change → **always accepts input**
4. Show red "Invalid JSON" / green "Valid JSON" indicator below textarea
5. Remove unused `useEffect` import

## Problem 2: Arrays/Objects render as `[object Object]` in prompt
Edge function interpolates `masterPrompt.strict_rules`, `masterPrompt.output_format`, etc. directly in template literals. If these are arrays or objects (as in the user's JSON), they render unhelpfully.

### Fix
Add a `promptValue(v)` helper before `generateCaptions`:

```typescript
function promptValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => String(x)).join("\n");
  if (v !== null && typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v ?? "");
}
```

Change `masterPrompt` type from `Record<string, string>` to `Record<string, unknown>` and wrap every field access with `promptValue(...)`.

### Result
| Stored JSON | Renders in prompt |
|-------------|------------------|
| `"string value"` | `string value` |
| `["rule1","rule2"]` | `rule1\nrule2` |
| `{"caption":"text"}` | `{\n  "caption": "text"\n}` |

## Files to modify
- `src/components/CaptionPromptEditor.tsx` — jsonBuffer state, live validation indicator
- `supabase/functions/generate-ai-captions/index.ts` — promptValue normalizer, type change

## Verification
- `npm run build` (or `node node_modules/vite/bin/vite.js build`) should succeed
- Tab switch template→json→template should preserve prompt
- Pasting the user's JSON should work immediately
