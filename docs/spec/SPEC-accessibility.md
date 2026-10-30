# SPEC — Accessibility (Phase 6.3)

**Status:** proposed, awaiting approval
**Scope:** Flutter Windows desktop client (`desktop-flutter/`)
**Standard:** WCAG 2.1 AA where it applies to a native desktop app.

---

## Objective

Every admin who can see can also reach every action by keyboard, understand every
state without relying on colour, and use the app at 200% text size without a
clipped layout. The audit below is measured, not assumed.

---

## What the audit found

### Contrast (measured against the real tokens)

| Pair | Ratio | Needs | Where |
|---|---|---|---|
| `onPrimary` #F9EFF5 on `primary` #E86AA8 | 2.65 | 4.5 | every filled button label |
| `primary` as text on background / card | 2.82 / 2.44 | 4.5 | calendar + queue "Scheduled", publish phase |
| `destructive` #DE5C5C as text on background / card | 3.43 / 2.98 | 4.5 | failed status, error lines |
| white on `destructive` fill | 3.43 | 4.5 | destructive filled button |
| `green.shade700` status text on card | 3.38 | 4.5 | "Published" |
| `outline` #E3D1DA as a text-field border | 1.38 | 3.0 | every text field |

### Keyboard and focus

- `_PostChip` (month and week calendar grids) is a bare `GestureDetector`: not
  reachable with Tab, not activatable with Enter or Space, and it has no button
  role for a screen reader.
- `IconButton`s already carry tooltips; rows use `InkWell` and are reachable.

### Semantics

- A calendar day cell reads as a bare number ("29 14:30 Launch"); the day itself
  is not announced, nor how many posts it holds.
- In the grid the post status is shown by colour only; the chip's label has no
  status word.
- Text fields already carry `labelText`; dialogs are Material `AlertDialog`s and
  keep their focus and Escape behaviour.

### 200% text

Not covered by any test. The toolbars and action rows are the likely breaks.

---

## Decisions

1. **`onPrimary` becomes the deep plum `#3D152B` (5.27:1).** The pink fill and
   the brand stay; only the label on top changes.
2. **A new token `primaryText` `#A83C74` (≥4.84:1 on every surface we paint)
   carries primary-coloured text and icons.** `primary` stays a fill colour and
   is never used for small text again.
3. **`error` becomes `#B3261E` (≥5.36:1), `onError` white (≥6:1).** It replaces
   `destructive` everywhere including the destructive filled button.
4. **The published status uses `green.shade900` (≥6.46:1 on a card).**
5. **`outline` becomes `#8A6E7C` (≥3.7:1) so text-field borders meet 3:1.**
   `outlineVariant` stays as-is for the decorative calendar and list rules.
6. **The calendar chip becomes an `InkWell` with a semantic label**
   "<time>, <title>, <status>", so Tab reaches it, Enter and Space open it, and a
   screen reader hears the status that the colour is showing.
7. **A day cell announces its date and count** ("Thursday 29, 2 posts") as a
   container label; the chips inside keep their own labels and taps.
8. **Keyboard focus is visible on light surfaces** through `ThemeData.focusColor`
   (foreground at 12%); Material's own focus overlay is kept on top.
9. **Every page is tested at `textScaler: 2.0` in a 1024×640 window** — the same
   minimum the window manager enforces. A clipped layout is fixed with `Wrap`
   or `Flexible`, never by clamping the text scale.
10. **Contrast is pinned by a unit test.** It computes the ratios from the theme
    tokens and the status colours, so a future palette change fails the build
    instead of someone's eyes.

---

## Out of scope

- Screen-reader narration beyond labels and roles (no live regions added to
  existing status text).
- High-contrast Windows themes and OS accent colours.
- Localisation and right-to-left layouts.
- Global keyboard shortcuts (Ctrl+1..6 for the rail): not required by AA and not
  asked for.

---

## Tests

- `test/core/theme/contrast_test.dart` — every pair in the decisions above
  against the tokens the theme actually returns, plus the shared status colour.
- `test/features/scheduling/calendar_accessibility_test.dart` — Tab reaches a
  chip, Enter and Space open the post, the chip's and the cell's semantic
  labels say what the colour means.
- One "grows with large text at the minimum window size" test per page
  (Home/shell, Upload, Compose, Accounts, Queue, Calendar, Settings) at 2.0 in
  a 1024×640 window, asserting no overflow and that the page's main control is
  still there.
