---
slug: bomti-product-goal-and-scaffolding
status: reviewed-and-ready
intent: clear
review_required: true
pending-action: start implementation in a new session by reading Handoff.md
approach: Plan a complete web implementation around one-answer public evaluation and a separate two-answer internal benchmark, replacing the repository's disconnected mocks with explicit product, model, privacy, persistence, design-system, deployment, and evidence-backed requirement-validation boundaries.
---

# Draft: bomti-product-goal-and-scaffolding

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
1. product-thesis | one primary user, painful job, and measurable outcome are explicit | active | README.md:3-16; docs/product-plan.md:3-16
2. evaluation-loop | one-answer public judging and two-answer internal calibration have separate, unambiguous contracts | active | README.md:26-43; docs/product-plan.md:18-27
3. web-experience | the first usable web surface and navigation model are explicit | active | app/page.tsx:1-24; docs/architecture.md:7-16
4. persistence-contract | ownership, storage, privacy, and dataset contribution boundaries are explicit | active | prisma/schema.prisma:5-49; docs/product-plan.md:22-27
5. model-strategy | guest DeepSeek preview and authenticated Luna/Terra/Sol judging, cost constraints, and fail-closed behavior are explicit | active | .omo/plans/bomti-product-goal-and-scaffolding.md:55-145
6. implementation-plan | framework, modules, validation, tests, deployment, and observable web QA cover the complete agreed product without unrelated expansion | active | package.json:1-23; docs/roadmap.md:5-31

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
technology baseline | keep Next.js App Router, React, TypeScript, and Zod | already present and appropriate for the requested web scaffold | yes
planning boundary | this interview produces a decision-complete plan; product-code scaffolding starts only through `$start-work` after plan approval | required by the selected ulw-plan workflow | yes
repository safety | preserve the clean `main...origin/main` worktree and do not change existing product code during interview/planning | current repository has no user changes | yes

<!-- historical-non-active:start repository discovery before approved plan -->
## Historical repository findings (non-active)
1. The product statement currently mixes two audiences: job seekers who want useful outputs and developers who want preference data (`docs/product-plan.md:11-16`).
2. The desired evaluation loop is documented consistently, but no executable end-to-end path exists (`README.md:26-43`, `app/page.tsx:7-15`).
3. All three route handlers are mocks: task and preference echo arbitrary request bodies, while judge returns a fixed score (`app/api/tasks/route.ts:3-10`, `app/api/preferences/route.ts:3-10`, `app/api/judge/route.ts:3-22`).
4. The database schema declares entities but no relations, ownership, cascade rules, migrations, or installed Prisma dependency (`prisma/schema.prisma:1-49`, `package.json:11-22`).
5. The documented initial target spans multiple job-preparation jobs that could become separate products: interview reports, job-posting extraction, STAR conversion, and security report evaluation (`README.md:18-24`).
6. The seed target is twenty tasks, but only three exist (`docs/product-plan.md:38-44`, `data/seed-tasks.json:1-29`).
7. GitHub issues 1-7 mirror the old feature decomposition, but all remain open and do not distinguish completed skeleton work from missing product behavior.
8. The Bonobono PPT meme is associated with context-inappropriate character use, rainbow backgrounds, awkward typography, and excessive decoration; the negative judgment emerges from their fit to audience and purpose, not a single objective defect (https://designkeep.co.kr/53/; https://designinfo.tistory.com/entry/%EB%B3%B4%EB%85%B8%EB%B3%B4%EB%85%B8-PPT-%ED%85%9C%ED%94%8C%EB%A6%BF).
9. A taste-aware verdict cannot be calibrated from the artifact alone in every case; the same playful visual language may be appropriate for a casual school presentation and inappropriate for a public-sector application artifact.
10. The repository has no automated test command, scenario harness, requirement-to-artifact traceability, or durable QA evidence convention (`package.json:5-9`, `docs/roadmap.md:5-31`).
<!-- historical-non-active:end -->

## Decisions (with rationale)
intent = clear | the user explicitly requested an interview, so owner decisions must be surfaced instead of defaulted
classification = architecture | the outcome crosses product positioning, UX, data, AI providers, persistence, and deployment
review_required = true | the owner explicitly selected the dual high-accuracy review before implementation handoff
metis_gap_analysis = complete | 33 contradictions, ambiguities, missing constraints, execution risks, and topology gaps were resolved in the generated plan without requiring additional product decisions
primary_user = job seeker | the owner identified job seekers as the first user, not AI developers
product_role = independent judge and benchmark | Bomti evaluates artifacts produced by external MCP or LLM tools instead of primarily generating those artifacts
public_evaluation_flow = evaluate one cover-letter response at a time from its question, answer, target role, and job/company context | the owner chose a focused public workflow that produces one Bomti index and evidence set without requiring users to manufacture a comparison candidate
internal_benchmark_flow = compare two responses to the same contextualized question and record which is more Bomti plus the rationale | paired judgments remain an internal calibration mechanism and are not exposed as a second public product mode in the first implementation
name_thesis = classify whether an artifact is "Bomti" | the brand name is the verdict concept the product should make legible and memorable
dataset_role = secondary evidence asset | benchmark records support calibration and improvement, while the user-facing value is artifact trustworthiness
label_semantics = "Bomti" is a negative, tacky/cheesy verdict | the owner defined the term as 촌스럽다/구리다 and cited the Bonobono PPT meme as the canonical example
evaluation_nature = contextual taste judgment | objective checks can explain defects, but human preference must calibrate the final taste-sensitive verdict
judge_dimensions = correctness plus contextual fit, visual/textual polish, credibility, and practical usability | a pure factual rubric would miss the brand-defining failure mode
first_artifact_modality = text-centered job-search artifacts | the owner chose text outputs as the coherent starting point; visual presentation judgment is deferred until the text benchmark is trustworthy
first_artifact_type = cover-letter question response | the owner approved a narrow first benchmark where contextual fit, cliché, exaggeration, credibility, and practical usefulness can be judged together
evaluation_input_contract = cover-letter question, answer, target role, and job/company context are required; resume and personal-experience evidence are optional | contextual judgment needs purpose and audience, while sensitive personal data should not block first use
verdict_output = a continuous 0-100 Bomti index as the primary result, one of four playful degree descriptors, plain-language score explanation, dimension scores, sentence-level evidence, improvement direction, and short examples | the artifact is not reduced to pass/fail; descriptors communicate degree while the number and evidence remain primary
full_rewrite = deferred | generating a finished replacement would blur the first product's independent Judge AI identity
human_calibration = founder-curated comparison pairs with written rationales and ratings from two or three people, followed by optional user agreement feedback | a stable initial taste standard should precede crowd feedback that could otherwise make the benchmark inconsistent
initial_benchmark_target = 20-30 paired cover-letter examples | paired good-versus-Bomti examples make subjective distinctions easier to explain and align with the repository's existing preference-comparison direction
product_success_definition = observe both agreement with curated human judgments and usefulness to job seekers without imposing a fixed launch pass/fail threshold during initial calibration | these metrics evaluate the Bomti judge itself, not an individual artifact; initial benchmark evidence should establish realistic baselines before numeric gates are chosen
score_semantics = higher Bomti index means more contextually tacky, generic, exaggerated, or credibility-damaging characteristics; accompany the number with the sequence "밤티 거의 없음 → 살짝 밤티 → 꽤 밤티 → 밤티 그 자체" | the descriptors reuse natural degree modifiers and keep one semantic axis; they are explanatory ranges rather than pass/fail labels
score_visualization = show the Bomti index as a prominent number plus a horizontal 0-100 bar with a position marker and the active degree descriptor | the owner requested a bar to make relative intensity immediately legible; the component must expose its numeric value and label to assistive technology and must never rely on color alone
identity_policy = two-tier access with anonymous preview and authenticated full evaluation | anonymous access preserves immediate product discovery, while login provides a defensible boundary for higher-cost cross-verified judging, saved results, and per-user limits
guest_experience = one lightweight preview per browser/IP per day using OpenCode DeepSeek, limited input length, up to three findings, and no saved history | the guest path demonstrates value without presenting a single free-model judgment as the canonical Bomti benchmark
authenticated_experience = three full evaluations per account during the judging period, with detailed evidence and automatically saved, user-deletable history | a small finite allowance gives judges and job seekers enough product experience while bounding sponsor-funded inference cost
authenticated_history = automatically save every authenticated evaluation as account-linked, pseudonymized input plus verdict and evidence; users can delete individual records | the owner chose automatic history for revisit value while retaining direct user control over stored evaluations
history_retention = retain authenticated evaluation history until the user deletes an individual record or deletes the account; do not apply time-based expiration | the owner prioritized durable revisit value over automatic expiry
account_deletion = delete the account, quotas, and every account-linked evaluation record; do not attempt to relink independently anonymized benchmark records to a former account | benchmark eligibility requires irreversible account unlinking, so deletion must remove all linkable data without preserving a hidden re-identification map
authentication_method = Google OAuth only for the first web implementation; a successfully authenticated Google identity receives the three-evaluation allowance | the owner chose the lowest-friction provider for the job-seeker audience and avoided email-delivery infrastructure and multi-provider account-linking complexity
authenticated_model_route = Luna discovers candidate issues and Terra independently scores them; Sol is called only when their material judgments disagree | conditional escalation preserves the multi-model Judge AI story while minimizing expensive calls
score_computation = hybrid judgment combining dimension-level evidence with a holistic contextual assessment; invoke Sol only when the dimension-derived score, holistic score, or core rationales materially disagree | the owner chose reproducibility and explainability without reducing subjective taste to a rigid weighted formula
guest_model_route = OpenCode DeepSeek V4 Flash Free while available; quota exhaustion or provider failure ends free preview availability instead of silently falling back to a paid model | the free endpoint is explicitly time-limited and therefore cannot be a production availability dependency
provider_boundary = OpenCode and OpenAI-compatible judge providers sit behind one server-side adapter and never expose API keys to the browser | model availability can change without rewriting the evaluation contract or client UI
deployment_stack = deploy the Next.js web application on Vercel and use Supabase for managed Postgres, Google authentication, and account-linked evaluation persistence | the owner chose the fewest-service mostly-free stack; migrate the unimplemented SQLite-shaped Prisma draft to an explicit production Postgres contract rather than preserving it by accident
free_tier_operational_risk = Supabase Free projects may pause after one week of inactivity, and Vercel Hobby is restricted to personal non-commercial use | the judging runbook must wake and verify the database before evaluation, while any post-competition commercial launch must revisit hosting terms and capacity (https://supabase.com/pricing; https://vercel.com/docs/plans/hobby)
design_system_strategy = establish a Bomti-specific DESIGN.md and reusable primitive layer before building public product screens | the owner chose a coherent new visual system instead of extending the current skeletal page; the plan must include design research, token and state definition, a primitive showcase, responsive/accessibility constraints, and visual QA before screen assembly
visual_personality = restrained, clear product UI with the Bomti index bar and concise inline evidence as the only strong signature elements | the owner rejected over-art-directed paper textures, handwriting, sentimental brand prose, and an elaborate editor-desk metaphor as AI-generated design affectation
anti_ai_visual_constraints = no generic purple-blue gradient, glass-card grid, sparkle iconography, forced asymmetry, fake paper texture, decorative handwriting, or invented emotional slogans | distinctiveness must come from the evaluation interaction, Korean copy quality, score visualization, and evidence annotation rather than fashionable AI-site decoration
billing_ownership = Bomti-owned server credentials fund authenticated OpenAI evaluation; logging into Bomti does not transfer or consume a user's ChatGPT/Codex subscription | product authentication and OpenAI billing identity are separate systems
cost_controls = account, IP, and browser-based rate limits plus a global daily guest cap, per-account paid quota, Sol escalation cap, provider monthly budget, and disabled automatic paid fallback | layered limits constrain duplicate accounts, scripted abuse, and surprise billing
privacy_consent = one concise pre-evaluation required notice and consent that names the active model provider, explains pseudonymization and account-history storage, and discloses that only separately anonymized, account-unlinked, low-risk copies enter the benchmark by default | DeepSeek's free endpoint may use collected data for model improvement, so a generic AI notice is insufficient
consent_interface = show an unchecked "모두 동의" control above individually visible, initially unchecked consent items; checking or clearing it synchronizes the listed items without hiding their purpose, provider, retention, or withdrawal details | the owner explicitly requested an all-agree convenience control while the interface must preserve informed choice and avoid preselection or visual concealment
privacy_pipeline = detect and pseudonymize direct identifiers before judging or persistence; keep raw text ephemeral and store only pseudonymized input, verdict, and feedback | unauthenticated use does not guarantee that free-form experience text contains no identifying details
admin_visibility = administrators may inspect only pseudonymized submissions and verdicts | stored examples remain useful for benchmark calibration without exposing the transient raw input
benchmark_contribution = include an evaluation by default only after creating a separately anonymized, account-unlinked copy that passes a conservative re-identification-risk check | the owner rejected a separate benchmark opt-in flow in favor of automatic inclusion limited to records that can be made non-identifying
benchmark_exclusion = automatically exclude any record when direct identifiers, distinctive organizations or projects, exact dates, rare experience combinations, or other narrative details leave anonymization uncertain | uncertain cases must fail closed and remain only in the user's account-linked history, never in the benchmark corpus
admin_review_tooling = no administrator web interface in the first implementation; export pseudonymized evaluation records and feedback as CSV or JSON for offline review | the owner chose the smallest operational surface that still supports benchmark inspection and calibration
test_strategy = tests-after focused on behavioral boundaries plus agent-executed browser QA | requirements may still evolve, so implementation precedes automated coverage; tests must protect pseudonymization, quota enforcement, score contracts, provider routing, and failure behavior instead of freezing incidental UI details
requirement_traceability = assign a stable product requirement ID to every approved behavior and map every implementation todo, acceptance criterion, QA scenario, and evidence artifact back to one or more IDs | code completion alone cannot prove product-plan fidelity; no approved requirement may be orphaned and no implementation item may lack a stated product reason
feature_completion_gate = a feature is complete only when its automated boundary checks, happy-path browser scenario, failure-path scenario, and redacted observable evidence all pass | worker claims, grep matches, and source inspection are not completion evidence; expected surfaces include browser captures, API responses, provider-call traces, and database assertions
evidence_storage = store reproducible, non-sensitive implementation evidence under a dedicated `.omo/evidence/bomti/` hierarchy organized by requirement and scenario | evidence must be reviewable across implementation turns while excluding API keys, raw personal data, OAuth tokens, and unredacted model inputs
judge_validation = evaluate the judge observationally during initial calibration using human pairwise agreement, evaluator disagreement, user understanding/usefulness, and high-variance failure categories without a fixed launch pass threshold | these measures validate the judge system rather than converting individual Bomti indexes into pass/fail outcomes
final_verification_contract = after all implementation tasks, require independent plan-compliance, code/security, real-browser QA, and scope-fidelity reviews to approve the exact completed artifact | final verification must catch missing requirements, privacy or cost regressions, unusable flows, and excluded features that slipped into scope
free_model_data_risk = DeepSeek free-preview requests are eligible for model-improvement use and the endpoint is available only for a limited time | OpenCode Zen documents both conditions, so guest UX must disclose them and must not accept unredacted personal or confidential data (https://dev.opencode.ai/docs/zen/)

## Scope IN
Product-goal interview; explicit target user and job; evaluation-loop contract; web information architecture; data/privacy/model decisions; implementation-scaffold plan; requirement traceability; evidence ledger; test and QA strategy.

## Scope OUT (Must NOT have)
No product-code edits before plan approval and `$start-work`; no deployment, external account creation, billing, crawling, or irreversible data decisions during planning.

## Open questions
None. The interview has resolved the product, evaluation, data, model, infrastructure, testing, and visual-direction forks required for a decision-complete implementation plan.

## Approval gate
status: approved-and-written
approach: Write one decision-complete implementation plan for the public single-answer evaluation web app, internal paired benchmark/export path, two-tier model routing, Google authentication, Supabase persistence, privacy controls, Bomti scoring UI, tests-after coverage, deployment, requirement traceability, per-feature evidence gates, and final independent verification.
next-action: Start implementation only in a new session after reading Handoff.md, verifying the approved plan hash and dual approval receipt, and completing the planning-lock bootstrap; product-code implementation has not started.

## High-accuracy review state

```json
{
  "transition": "approved",
  "phase": "review_complete",
  "review_required": true,
  "plan_path": ".omo/plans/bomti-product-goal-and-scaffolding.md",
  "plan_sha256": "db8e5cf15c77e766b7f45a8a695a99012bab62dba2c278c803e9092860a0a75f",
  "review_round_id": "512a0b7c-0eb8-4f2d-af90-cc08736a5878",
  "round_status": "approved",
  "pending-action": "start implementation in a new session by reading Handoff.md",
  "prior_rounds": [
    {
      "review_round_id": "8ccba49c-408f-4d9c-bec2-2686fedc3e96",
      "plan_sha256": "09253d4d4015b24233c4029e447ac26de664e7e256d5691bdc53fa0fc226ada8",
      "result": "changes_requested; execution, fixture, evidence, and visual-QA gaps incorporated"
    },
    {
      "review_round_id": "767a4bf1-1a02-4b3e-8f45-5f4ff4685989",
      "plan_sha256": "61ce057cb39e16022e30f6224eddc210c9090f6285c761fd528874acf544d76a",
      "result": "changes_requested; provider, quota, deletion, benchmark, auth, SHA, stale-scope, and deployability gaps incorporated"
    },
    {
      "review_round_id": "4fd64895-8ccd-4cd1-b6f8-768f0b0e6e08",
      "plan_sha256": "a0a4bed639119aade043d2f761628daec20acc866ab424591e6071ec8f4e3e40",
      "result": "changes_requested; external planning lock, isolated lanes, literal schemas, deletion saga, unlinkable benchmark, and link-free operations gaps incorporated"
    },
    {
      "review_round_id": "771c1486-369b-4a51-8643-93e789b9a51f",
      "plan_sha256": "75356a7ab0ce0b482d16345213ba0b4cec785cb4e6e61386aa3a8aab6ac292f5",
      "result": "changes_requested; planning bootstrap, literal merge/persistence, full PII scanning, metric formulas, dynamic ports, and pinned frontend workflow incorporated"
    },
    {
      "review_round_id": "3fafe14a-209b-455d-a9c1-97834b6c2935",
      "plan_sha256": "042e6eabe79e305478c09973e24f06e0b8312fb3acabaefb07ff5ad7f7289adc",
      "result": "changes_requested; literal benchmark enums and provenance paths, unresolved provider correlation, deletion ciphertext scrubbing, denominator/missing formulas, guest in-flight HTTP contract, evidence receipt isolation, and handoff bootstrap ownership incorporated"
    }
  ],
  "review": {
    "momus": {
      "status": "approved",
      "workspace_root": "/Users/ryuryu/Documents/bomti",
      "runtime_home": null,
      "target": ".omo/plans/bomti-product-goal-and-scaffolding.md",
      "round_id": "512a0b7c-0eb8-4f2d-af90-cc08736a5878",
      "plan_sha256": "db8e5cf15c77e766b7f45a8a695a99012bab62dba2c278c803e9092860a0a75f",
      "launch_id": "/root/high_accuracy_plan_review_round6",
      "session": "/root/high_accuracy_plan_review_round6",
      "result": "OKAY"
    },
    "independent": {
      "status": "approved",
      "workspace_root": "/private/tmp/bomti-plan-review-round6.jQwLyd",
      "runtime_home": "/private/tmp/bomti-codex-home-round6.YWSaNR",
      "target": ".omo/plans/bomti-product-goal-and-scaffolding.md",
      "round_id": "512a0b7c-0eb8-4f2d-af90-cc08736a5878",
      "plan_sha256": "db8e5cf15c77e766b7f45a8a695a99012bab62dba2c278c803e9092860a0a75f",
      "launch_id": "process:56825",
      "snapshot_git_sha": "e2ad1956596e6fe87437a33456c46a006780d4ad",
      "session": "process:56825/thread:019f7b7f-3099-7293-807d-5b0bbc31447d",
      "result": "OKAY"
    }
  }
}
```
