# Bomti Token-Efficient Execution Policy

## Purpose

This policy reduces total Codex token use while preserving the approved Bomti implementation plan and its verification gates. It is an operational overlay only. It does not amend product decisions, schemas, security boundaries, acceptance criteria, evidence contracts, or the immutable planning lock.

## Default allocation

- Use `gpt-5.6-terra` with `medium` reasoning for routine repository discovery, documentation, bounded implementation, test execution, and ordinary fixes.
- Use `low` reasoning for deterministic searches, file inventory, formatting, copy changes, and mechanical checks when the selected surface supports it.
- Prefer one direct agent for a task that can be completed safely in one context.
- Keep responses concise. Store full logs outside the conversation and return only the outcome, failing assertion, relevant excerpt, and file reference.

## When Sol is justified

Use `gpt-5.6-sol` only when at least one condition applies:

- architecture or product-contract ambiguity cannot be resolved from the approved plan;
- authentication, authorization, RLS, privacy, deletion, reconciliation, budget, or concurrency logic is being designed or reviewed;
- Judge orchestration, score provenance, provider partial acceptance, or refund behavior crosses multiple modules;
- a reproducible defect remains unexplained after two materially different diagnostic attempts;
- the approved plan explicitly requires an independent high-accuracy or security review;
- F1-F4 final verification or release-readiness judgment is running.

Use `high` reasoning for these cases. Use `xhigh`, `max`, or `ultra` only when the task explicitly requires it or a prior high-reasoning pass reports unresolved material risk.

## Codex-only execution

- Do not use LazyCodex, LazyCodex-specific worker/reviewer/gate roles, or LazyCodex/OMO orchestration commands and modes, including `omo:*`, `$start-work`, `ultrawork`, `ulw-loop`, `ulw-research`, and `review-work`.
- Use the primary Codex agent directly for discovery, implementation, verification, review, and handoff. Do not translate routine work into a LazyCodex team or review pipeline.
- If independent parallel work is genuinely necessary, use ordinary Codex subagents only, assign bounded non-overlapping ownership, and avoid duplicate exploration. Never select a LazyCodex-labelled role.
- Execute the smallest ready Todo from the approved plan and run its targeted checks and evidence contract. Do not repeat full-plan review after each Todo; reserve broad review for the end of a meaningful wave or an explicit plan gate.
- Keep full logs in artifact files and summarize only failures, causes, and relevant paths in the main thread.

## Context discipline

- Start with `rg`, targeted file ranges, named tests, and the exact paths referenced by the active Todo. Do not reread the whole repository when the approved plan already identifies the surface.
- Keep `AGENTS.md` concise and load task-specific documents only when they are relevant.
- After a Todo or large debugging phase, compact the thread. At a wave boundary, prefer a new task that reads `Handoff.md`, this policy, and the current evidence ledger.
- Never paste complete build, test, migration, or provider logs into the main thread when a bounded excerpt or artifact path is sufficient.
- Avoid repeated status polling. Wait once for the expected duration and read the terminal or artifact only when it can change the next decision.

## Verification economy

- Token reduction must not weaken the approved happy/failure scenarios, SHA-bound evidence, privacy checks, or final F1-F4 sequence.
- Run the cheapest relevant check while iterating, then run the Todo's complete required checks once its inputs stabilize.
- Do not rerun an unchanged green check. Any code or configuration change that affects its inputs invalidates that receipt.
- Prefer deterministic local fixtures. Live providers, deployment, external imports, push, and PR mutation remain separately authorized operations.

## Escalation record

When escalating from Terra to Sol or from one agent to multiple agents, record one short reason in the task update. When the condition no longer applies, return to Terra/Medium for subsequent routine work.
