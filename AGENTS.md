# FlowPost Studio — Agent Operating Rules

## Project Overview

FlowPost Studio is a multi-platform social media scheduling dashboard (React 18 + TypeScript + Vite + Tailwind + Supabase). It publishes videos/images to YouTube Shorts, Instagram Reels & Stories, Facebook Pages, TikTok, and LinkedIn with scheduled posting, AI caption generation, content calendar, and workflow automation.

## Core Rules

- If a task matches a skill, invoke it with the `skill` tool before acting.
- Skills are located in `.opencode/skills/<skill-name>/SKILL.md`.
- Follow the skill workflow strictly; do not partially apply it.
- Never skip required steps such as spec, plan, or test when a skill demands them.
- Supplementary checklists live in `.opencode/references/` (e.g. `security-checklist.md`, `performance-checklist.md`).
- Specialist review personas live in `.opencode/agents/`.

## Intent → Skill Mapping

Map the user's intent to the matching skill automatically:

- Audit / security review → `security-and-hardening`
- Code review / merge quality → `code-review-and-quality`
- Performance work → `performance-optimization`
- UI / design-system work → `frontend-ui-engineering`
- Bug / failure / unexpected behavior → `debugging-and-error-recovery`
- Any code change → `git-workflow-and-versioning`
- Implementing logic / changing behavior → `test-driven-development`
- Architecture decisions / API changes → `documentation-and-adrs`
- Deploy / launch readiness → `shipping-and-launch`
- Not sure which skill applies → `using-agent-skills`

## Execution Model

For every request:

1. Determine if any skill applies (even a small chance).
2. Load the skill with `skill({ name: "<skill-name>" })`.
3. Follow the skill workflow exactly.
4. Only proceed to implementation once required steps are complete.

## Environment Notes

- Stack: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui, Supabase backend + Edge Functions (Deno), Vercel hosting.
- Auth: Supabase Google OAuth for users + custom token sessions for the admin user (`public.users`, `sessions` tables).
- Signups are closed — only pre-existing `public.users` records can authenticate.
- NEVER expose `SUPABASE_SERVICE_ROLE_KEY`, GCP service account keys (e.g. `zinc-bucksaw-489020-n0-*.json`), or other secrets in code or commits.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
