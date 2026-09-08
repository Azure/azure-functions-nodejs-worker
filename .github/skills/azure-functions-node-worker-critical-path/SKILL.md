---
name: azure-functions-node-worker-critical-path
description: 'Mandatory human-intervention gate for critical Azure Functions Node.js worker code. Use automatically or as /azure-functions-node-worker-critical-path for changes to Host-worker RPC/protobuf, gRPC startup, message routing, capabilities, app/module loading, programming-model registration, invocation conversion, specialization/environment/process state, hooks, termination, error sanitization, dependencies, bundling, packaging, pipelines, compatibility behavior, or tests that protect those paths. Classify risk, block AI-only approval, require the proper human review, and produce a review packet with validation evidence.'
argument-hint: '[diff, file, proposed change, or PR]'
user-invocable: true
disable-model-invocation: false
---

# Azure Functions Node.js Worker Critical Path

This skill is a review gate, not a general code review. Its purpose is to identify changes for which automated reasoning and tests are insufficient and a qualified human must make or approve the decision.

Apply `azure-functions-node-worker` for domain validation. Apply `azure-functions-node-worker-security` whenever the change affects a trust boundary, executable code selection, credentials, process isolation, availability controls, or dependencies.

Read [critical-paths.md](./references/critical-paths.md) to classify affected files and semantic triggers.

## Non-Negotiable Rule

Human approval cannot be supplied by Copilot, inferred from passing tests, or replaced by this skill. For a triggered change:

- do not label it approved, safe to merge, or fully complete without recorded human approval
- do not commit, merge, publish, or release it on the human's behalf
- do not weaken, bypass, or reinterpret the gate because the patch is small or generated
- identify the reviewing owner from `.github/CODEOWNERS`; this repository currently assigns `@azure/azure-functions-nodejs`

Automated tools may prepare a local draft, tests, threat analysis, and review packet unless the change requires design approval before implementation.

## Required Workflow

### 1. Classify Before Editing

Inspect the requested behavior and relevant diff. Classify by semantics as well as path:

- `Gate A - human decision before implementation`: changes the wire contract, compatibility policy, trusted peer/endpoint, executable-code boundary, process isolation, environment/working-directory policy, termination guarantee, or shipped dependency/release behavior
- `Gate B - human review before acceptance`: modifies an implementation on a critical path without intentionally changing the established contract
- `Not gated`: does not affect a critical behavior and does not weaken tests or validation protecting one

If uncertain between two levels, use the stricter gate and state exactly what fact would lower it.

### 2. Announce the Gate

For Gate A, pause implementation until a human confirms the intended contract and tradeoff. Ask only the concrete decision needed, such as:

- What Host versions and message shapes must remain compatible?
- Is this path allowed to load outside the function app root?
- Which process state must survive specialization or failed reload?
- What shutdown deadline and failure behavior does the Host expect?
- Is the dependency/protocol change approved for the shipped worker?

For Gate B, a local uncommitted draft may proceed when requested, but mark it `HUMAN REVIEW REQUIRED` from the start and preserve that status through the final report.

Analysis-only requests do not require approval to investigate; they still require a human to accept any resulting critical-path recommendation.

### 3. Trace Blast Radius

Describe the affected end-to-end flow:

`Host -> gRPC/protobuf -> event handler -> WorkerContext/AppContext -> programming model or module loader -> invocation/side effect -> response/log -> Host`

Account for:

- supported Host and Node.js versions
- worker indexing and legacy Host indexing
- CommonJS and ESM loading
- warm invocations and concurrent asynchronous work
- specialization, retries, partial failures, and shutdown
- generated RPC artifacts and other repositories sharing the contract
- user/system error and log behavior
- bundle, package, and deployment artifacts

### 4. Demand Discriminating Evidence

Require a focused regression test that would fail without the change and observes the critical boundary. Then require the checks selected by the domain and security skills.

Passing unit tests do not prove wire compatibility, security, race freedom, or production packaging. Require additional evidence where applicable:

- generated `.proto` diff matched to Host schema and compatibility plan
- `npm run host-sanity` or cross-repository e2e evidence
- focused concurrency or partial-failure test
- synthetic secret-leak regression
- `npm run webpack` and shipped-artifact inspection
- dependency advisory, provenance, runtime-reachability, and lockfile analysis

If a required environment is unavailable, mark the evidence missing. Do not silently downgrade the gate.

### 5. Produce the Human Review Packet

Use this exact structure:

```text
HUMAN REVIEW REQUIRED

Gate: A - before implementation | B - before acceptance
Owner: @azure/azure-functions-nodejs (or more specific confirmed owner)
Decision needed: <one concrete decision>

Critical paths:
- <file/symbol and why it is critical>

Behavioral contract:
- Before: <current Host/worker/Node behavior>
- After: <proposed behavior>
- Must remain invariant: <compatibility and security properties>

Blast radius:
- <Host versions, Node versions, indexing modes, process/app state, artifacts>

Security analysis:
- <finding, no finding, or pending analysis with assumptions>

Validation evidence:
- PASS/FAIL/NOT RUN: <exact check and what it proves>

Residual risks or open decisions:
- <specific unresolved item>

Human decision: PENDING
```

Keep `Human decision: PENDING` until a human explicitly records approval. If approval is provided, record who approved, what decision they approved, and any conditions; do not generalize that approval to later changes.

## Automatic Gate Triggers

Always trigger at least Gate B for changes that affect:

- startup argument parsing, gRPC endpoint/credentials, stream setup, routing, status/error response construction, or capabilities
- protobuf source, generated RPC artifacts, message fields/types, or Host-worker compatibility
- app-root, package entry point, glob, script path, export selection, require/import behavior, or core-module interception
- worker/function indexing choice, registration locks, programming-model selection, invocation conversion, or binding semantics
- `WorkerContext`, `AppContext`, specialization, `process.env`, working directory, module/global state, or in-flight invocation behavior
- app/invocation/log hook ordering, mutation, error propagation, or cleanup
- process listeners, event-loop blocking controls, retries/timeouts, stream close, or process exit
- error classification, sanitization, log category, or any Host-bound diagnostic that may contain credentials
- runtime dependency versions, install scripts, generated code tooling, webpack, worker config, NuGet package contents, or release pipelines
- removal or weakening of tests and assertions that protect any item above

Trigger Gate A when the intended contract or trust assumption changes, not merely because an implementation file is touched. See [critical-paths.md](./references/critical-paths.md) for examples.

## Enforcement Boundary

This skill makes Copilot detect and honor the human-review requirement, but a repository skill cannot technically prevent a GitHub merge. Enforce the policy in GitHub with CODEOWNERS-backed branch protection or rulesets requiring approving reviews from code owners, required status checks, stale-approval dismissal, and conversation resolution.