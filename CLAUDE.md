# CLAUDE.md — ZSMS SaaS Frontend

This file is project memory. Read it fully at the start of every session and follow it.

## ⚠️ HARD RULES (never violate)

1. **NEVER push to git.** Do not run `git push` under any circumstance. The human (Matthew) does all pushes manually, himself, after his own review.
2. **NEVER commit without explicit approval.** You may stage changes and PROPOSE a commit, but do not run `git commit` until Matthew says "commit" in that session.
3. **Always work locally and show diffs.** Every file change must be visible to Matthew as a diff before it is considered done. Never make large sweeps of changes without surfacing them for review.
4. **Ask before any destructive or irreversible action** — deleting files, `rm`, force operations, changing git history, `npm install` of unexpected packages, or anything that touches more than the task at hand.
5. **One concern at a time.** Build in small, reviewable increments. Matthew tests each increment locally in the browser before moving on.
6. **Never run the app against production APIs or production data.** Local dev only. Do not point anything at live backend/database.
7. When unsure, STOP and ask. A paused question is always better than an unwanted change.

## Who / What

- **Matthew Taiwo** — Founder, Product Owner, Senior Architect at Zippro Systems (Lagos). Directs the work; is the sole gate for git.
- **Muntajir** (Chirag Technology, India) — backend developer. Owns the SaaS backend (`zsms_saas_nodejs_backend`). You do NOT touch backend repos.
- This repo: **`zsms_saas_frontend`** — the Next.js frontend for the ZSMS SaaS tenant application.

## The two products (critical context)

ZSMS has TWO separate products:
1. **School Manager** (already in production) — the admin/billing/control plane. Separate repos, separate DB. NOT this repo.
2. **SaaS Tenant App** (THIS project) — the school-facing app each school uses (students, exams, attendance, etc.), served per-school at `<slug>.zsmsapp.com`. This frontend + Muntajir's `zsms_saas_nodejs_backend`.

## Architecture (decided — see ADR-001)

- **Separate PostgreSQL per service.** SaaS has its own DB, owns school schemas. School Manager holds commercial/control data. They never share a DB or credentials.
- **Multi-tenant, schema-per-tenant** (backend concern). This frontend is **tenant-aware**: middleware reads the school slug from the subdomain (`<slug>.zsmsapp.com`) to know which school is being served.
- **Backend:** Node.js modular monolith, Knex.js. API at `https://api.zsmsapp.com/api/v1`. Push-based S2S between School Manager and SaaS (not this frontend's concern directly).
- **Frontend↔backend contract:** the backend must expose a resolve-tenant-by-slug capability; confirm endpoints with Matthew/Muntajir before assuming them.

## Tech stack (match these)

- **Next.js 14, App Router** (same family as School Manager).
- **TypeScript**, strict.
- **Tailwind CSS** + a design-token system (colors/spacing from Figma → Tailwind config). All colors go through semantic tokens — NO hardcoded hex in components (needed for dark mode).
- **i18n from day one:** English + French, per-user preference with a school default. Every user-facing string must be i18n-keyed (use `next-intl` or the agreed lib). NEVER hardcode display strings.
- **Dark mode from day one:** via semantic CSS variables / Tailwind dark tokens. Wired into the foundation, not retrofitted.
- **Fully responsive** from day one (mobile designs exist in Figma). Desktop-first optimization is fine, but layouts must work on mobile.
- **State/data:** follow School Manager conventions where sensible (react-query for server state).

## Design source

- Figma file: `ZSMS-UI-Redesign` (key `PT4c4Gzk9clwJja7REgYTg`). Pages: Overview (auth + dashboard), Academics, Students, and more.
- Design language (from the Sign In screen, already validated): split-panel auth (dark illustrated hero left, white/dark form right); purple accent `#852b99`; brand tint `#F4EBFF`; Inter font.
- When building a screen, work from the actual Figma design (via the Figma MCP or specs Matthew provides from the chat), not from imagination.

## Phasing (build in this order — see the discovery doc)

- **Phase 0 (current): Foundation** — scaffold, tenant-aware subdomain middleware, app shell (sidebar/topbar/layout), design-token system, i18n (EN/FR) + dark mode wiring, and auth screens (Sign In, Forgot Password, Reset Password).
- Phase 1: Onboarding wizard + Overview dashboard.
- Phase 2: Students (list, admissions, enrollment, profile).
- Phase 3: Exams + Results + Report Cards.
- Phase 4+: remaining modules.

## Working style

- Matthew is PM/architect, tests via the browser locally on Windows/WSL. He is not hands-on writing code but reviews everything.
- The Claude **chat** (separate from you) acts as architect/design-reader/reviewer: it produces specs from Figma and reviews your output. Matthew relays between you and the chat.
- Build → Matthew tests locally → chat reviews → refine → Matthew approves → Matthew commits/pushes. You never skip ahead of this loop.
- Branch workflow (when we do commit): feature branches, PRs, no direct-to-main. But again — YOU never push; Matthew does.

## Conventions carried from School Manager

- Clean component structure, `'use client'` where needed, permission guards on protected pages, react-query hooks for data, toast notifications for feedback.
- Prefer correct architecture over smallest-change hacks.
- Keep the dependency set lean and pinned; flag any new dependency before adding it.


