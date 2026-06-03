# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

This repository is **pre-implementation**. As of 2026-05-27 the working tree contains only `.bkit/` framework state — there is no source code, build system, package manifest, README, or CI config yet.

Before adding architecture or command sections to this file, the first real artifact must land (e.g. a chosen stack, a `package.json` / `pyproject.toml` / equivalent, or a documented design doc). Until then, do not invent commands or architecture — read the working tree and update this file from what actually exists.

## Tooling Already in Use

- **bkit Vibecoding Kit v2.0.x** is active. State lives under `.bkit/`:
  - `.bkit/state/pdca-status.json` — PDCA workflow state (level, current phase, active features). Last recorded level is `Dynamic`; session memory recorded `Starter`. Treat the level as **not yet finalized** — confirm with the user before choosing a `/starter` vs `/dynamic` vs `/enterprise` workflow.
  - `.bkit/state/memory.json`, `.bkit/state/session-history.json` — session bookkeeping.
  - `.bkit/audit/*.jsonl` — append-only audit log of bkit actions.
- bkit slash commands (`/pdca …`, `/development-pipeline`, phase skills `/phase-1-schema` … `/phase-9-deployment`) are the intended way to drive work here. Use `/pdca status` to inspect current PDCA state before starting a new feature.

## Conventions Inherited From Global Config

The user's global `~/.claude/CLAUDE.md` applies and overrides any conflicting defaults. Key points relevant to this repo:

- **Language**: All gstack and bkit skill output (questions, options, section titles, generated docs) must be in **Korean**. Code identifiers, file paths, and shell commands stay in their original form.
- **GitHub work**: Before any GitHub operation (repo create, PR, Actions), verify `gh --version`. Do not fall back to web-UI flows.
- **Commit style** (Udacity guide, Korean-adapted, applies to every commit in this repo):
  - Format: `type: Subject` (≤50 chars, imperative, no trailing period), blank line, optional body (≤72 chars/line, explains *what* and *why*, not *how*), blank line, optional footer (`Resolves: #N`).
  - Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`. Never mix types in one commit.
  - Commit per logical unit as soon as it is complete — do not batch a day's work into one commit. `docs`/`style`/`chore` may be batched together but must never be mixed with `feat`/`fix`/`refactor`.
  - If a branch-prefix scheme (e.g. `[FE]`, `[BE]`) is later adopted, the prefix goes **before** the type: `[FE] feat: …`.

## When Updating This File

Once real code lands, replace this notice with concrete sections covering, at minimum:

1. Build / run / test / lint commands actually defined in the project (and how to run a single test).
2. The big-picture architecture that requires reading multiple files to understand — module boundaries, data flow, where state lives, external service dependencies.
3. Any project-specific conventions that diverge from the global rules above.

Do not pad this file with generic advice or speculative structure.
