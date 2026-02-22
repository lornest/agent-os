# Phase 7 — Observability & Security Hardening — Implementation Plan

> **Status:** Ready for implementation
> **Prerequisite:** Phases 0–6 complete. Build passes (10 packages), 361+ tests green across 9 packages.

---

## Current State Assessment

Before breaking Phase 7 into sub-tasks, here's what exists and what's missing:

| Area | Exists | Missing |
|------|--------|---------|
| TraceContext type | `AgentMessage.traceContext` field defined | Not populated anywhere, no OTel SDK |
| Risk classifier | CRITICAL/RED/YELLOW/GREEN + sanitizer | Obfuscation detection, allowlist mode |
| PolicyEngine | 3 layers (Global → Agent → Binding) | Session-level 4th layer |
| Sandbox security | `--cap-drop ALL`, `no-new-privileges`, conditional `--read-only` | Seccomp profile, ulimits, binding overrides wiring |
| Env var overrides | `applyEnvOverrides()` with `AGENTIC_OS_` prefix | Deny-list for auth credential paths |
| Metrics | None | Full OTel metrics |
| Tracing | None | Full OTel tracing with cross-agent propagation |
| Audit log | None | Append-only event store |

---

## Design Decisions (Simplifications)

Following the established pattern of previous phases (e.g., Phase 3 chose SQLite over Qdrant+Redis, Phase 4 chose Docker CLI over dockerode), we simplify Phase 7 where the original plan's complexity isn't justified yet:

1. **SQLite audit log instead of PostgreSQL** — The system already uses SQLite for memory (Phase 3). Adding PostgreSQL solely for the audit log introduces a new infrastructure dependency, an ORM/driver, migration tooling, and Docker Compose changes. SQLite with WAL mode, triggers preventing UPDATE/DELETE, and chained checksums delivers the same tamper-evidence guarantees. If PostgreSQL is needed later (Phase 8 production stack), the `AuditStore` interface makes it a drop-in swap.

2. **OTel SDK with console/OTLP exporters, no Collector sidecar yet** — The code-level instrumentation (spans, metrics, trace propagation) is the hard part. Export configuration is a deployment concern. Ship with `ConsoleSpanExporter` for dev and `OTLPTraceExporter`/`OTLPMetricExporter` for when a Collector endpoint is configured. The Collector + Jaeger + Prometheus + Grafana Docker Compose stack is Phase 8 scope.

3. **Defer full RBAC/JWT/scopes system** — The plan mentions agent identity with `roles[]`, `scopes[]`, session JWT, and `requiredScopes` on tools. This is a significant auth subsystem. For Phase 7, we focus on what's immediately useful: session-level policy (the 4th policy layer), delegation scope narrowing (intersection of parent + child scopes already follows from the PolicyEngine pattern), and secrets deny-list. Full JWT-based RBAC is Phase 8 scope.

4. **No secrets proxy yet** — The plan mentions a `secrets_proxy` for injecting auth headers server-side into sandboxed tools. This requires an HTTP proxy layer that doesn't exist. For Phase 7, we implement the deny-list in `applyEnvOverrides()` and ensure API keys never appear in sandbox environment variables. The proxy pattern is Phase 8 scope.

---

## Implementation Sub-Phases

Phase 7 is split into 5 sub-phases, each independently testable and committable. Total: ~8 new source files, ~6 new test files, modifications to ~12 existing files.

---

### Sub-Phase 7A — OpenTelemetry Instrumentation (Traces + Metrics)

**New package:** None. Add an `observability` module to `packages/core/` since tracing types/utilities are cross-cutting.

**New files:**

1. **`packages/core/src/observability.ts`** — Core tracing and metrics utilities:
   - `initTelemetry(config: ObservabilityConfig): void` — initializes the OTel NodeSDK with:
     - `ConsoleSpanExporter` when `config.observability.exporter === 'console'`
     - `OTLPTraceExporter` + `OTLPMetricExporter` when `exporter === 'otlp'` (reads endpoint from config)
     - No-op when `exporter === 'none'` (default for tests)
   - `getTracer(name: string): Tracer` — returns an OTel Tracer instance
   - `getMeter(name: string): Meter` — returns an OTel Meter instance
   - `injectTraceContext(msg: AgentMessage): AgentMessage` — populates `msg.traceContext` from the active OTel span context
   - `extractTraceContext(msg: AgentMessage): Context` — creates an OTel Context from `msg.traceContext` for child span creation
   - `shutdownTelemetry(): Promise<void>` — graceful flush + shutdown

2. **`packages/core/src/metrics.ts`** — Define all metric instruments as lazy singletons:
   - `llmLatencyHistogram` — `agent.llm.latency` histogram (buckets: 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s)
   - `llmTokensCounter` — `agent.llm.tokens` counter with attributes `{model, type: 'input'|'output'}`
   - `toolDurationHistogram` — `agent.tool.duration` histogram with attribute `{tool_name}`
   - `toolErrorsCounter` — `agent.tool.errors` counter with attributes `{tool_name, error_type}`
   - `gatewayThroughputCounter` — `gateway.message.throughput` counter with attribute `{subject}`
   - `gatewayDlqGauge` — `gateway.dlq.depth` gauge

**Modified files:**

3. **`packages/agent-runtime/src/agent-loop.ts`** — Add spans:
   - Wrap the full agent loop in `agent.invoke` span
   - Wrap each LLM call in `agent.llm_call` span with attributes: `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reason`
   - Wrap each tool execution in `agent.tool_execute` span with `gen_ai.tool.name` and `duration_ms`
   - Record `llmLatencyHistogram` and `llmTokensCounter` after each LLM call
   - Record `toolDurationHistogram` after each tool execution

4. **`packages/gateway/src/gateway-server.ts`** — Add spans:
   - Wrap message routing in `gateway.route` span
   - Record `gatewayThroughputCounter` on each message publish
   - Inject trace context into outgoing `AgentMessage` via `injectTraceContext()`
   - Extract trace context from incoming messages via `extractTraceContext()` to create child spans

5. **`packages/memory/src/memory-store.ts`** — Add `memory.search` span with `memory.store_type` and `result_count` attributes

6. **`packages/orchestrator/src/tools/agent-spawn-tool.ts`** and **`agent-send-tool.ts`** — Propagate trace context through cross-agent calls by injecting into the delegated message and extracting on the receiving side

7. **`packages/core/src/config.ts`** — Add `ObservabilityConfig`:
   ```typescript
   interface ObservabilityConfig {
     enabled: boolean;
     exporter: 'none' | 'console' | 'otlp';
     otlpEndpoint?: string;  // e.g. 'http://localhost:4318'
     serviceName?: string;    // default: 'agentic-os'
   }
   ```
   Add `observability?: ObservabilityConfig` to `AgenticOsConfig`.

8. **`packages/core/src/config-validator.ts`** — Add `'observability'` to `VALID_TOP_LEVEL_KEYS`.

9. **`config/default.json5`** — Add `observability` section with defaults (`enabled: false`, `exporter: 'none'`).

10. **`packages/app/src/bootstrap.ts`** — Call `initTelemetry(config.observability)` at startup, `shutdownTelemetry()` on graceful shutdown.

**New dependencies:**
- `@opentelemetry/api` — Core OTel API (types + context propagation)
- `@opentelemetry/sdk-node` — Node SDK for auto-instrumentation setup
- `@opentelemetry/sdk-trace-node` — Trace SDK
- `@opentelemetry/sdk-metrics` — Metrics SDK
- `@opentelemetry/exporter-trace-otlp-http` — OTLP trace exporter
- `@opentelemetry/exporter-metrics-otlp-http` — OTLP metrics exporter
- `@opentelemetry/semantic-conventions` — Standard attribute names

**Tests (`packages/core/tests/observability.test.ts`):**
- `initTelemetry()` with `exporter: 'none'` does not throw
- `getTracer()` returns a valid Tracer
- `getMeter()` returns a valid Meter
- `injectTraceContext()` populates `msg.traceContext` when a span is active
- `extractTraceContext()` creates a valid Context from trace context fields
- Round-trip: inject → extract → child span has correct parent

**Tests (`packages/core/tests/metrics.test.ts`):**
- All metric instruments are created without error
- Histogram records don't throw
- Counter increments don't throw

---

### Sub-Phase 7B — Append-Only Audit Log

**New package:** `packages/audit/` (`@agentic-os/audit`)

**New files:**

1. **`packages/audit/src/audit-types.ts`** — Types:
   ```typescript
   interface AuditEvent {
     eventId: string;            // UUIDv7
     eventType: string;          // e.g. "agent.tool.executed"
     sequenceNumber: number;     // Monotonic per source
     timestamp: string;          // ISO 8601
     traceId?: string;
     spanId?: string;
     actor: { type: 'agent' | 'user' | 'system'; id: string };
     data: Record<string, unknown>;
     checksum: string;           // SHA-256(prev_checksum + JSON(this_event))
   }

   type AuditEventType =
     | 'agent.llm.called'
     | 'agent.tool.executed'
     | 'agent.tool.blocked'
     | 'agent.state.changed'
     | 'security.command.blocked'
     | 'security.access.denied'
     | 'config.changed';
   ```

2. **`packages/audit/src/audit-store.ts`** — SQLite-backed append-only store:
   - Constructor: `{ dbPath, config }`
   - `open()` — creates table with triggers preventing UPDATE and DELETE:
     ```sql
     CREATE TABLE audit_events (
       event_id TEXT PRIMARY KEY,
       event_type TEXT NOT NULL,
       sequence_number INTEGER NOT NULL,
       timestamp TEXT NOT NULL,
       trace_id TEXT,
       span_id TEXT,
       actor_type TEXT NOT NULL,
       actor_id TEXT NOT NULL,
       data TEXT NOT NULL,       -- JSON
       checksum TEXT NOT NULL,
       UNIQUE(sequence_number)
     );
     CREATE INDEX idx_audit_type ON audit_events(event_type);
     CREATE INDEX idx_audit_timestamp ON audit_events(timestamp);
     CREATE INDEX idx_audit_actor ON audit_events(actor_type, actor_id);
     CREATE INDEX idx_audit_trace ON audit_events(trace_id);

     -- Prevent modifications
     CREATE TRIGGER no_update_audit BEFORE UPDATE ON audit_events
     BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;

     CREATE TRIGGER no_delete_audit BEFORE DELETE ON audit_events
     BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
     ```
   - `append(event: Omit<AuditEvent, 'sequenceNumber' | 'checksum'>): AuditEvent` — assigns monotonic sequence number, computes chained checksum (`SHA-256(prev_checksum + JSON(event))`), inserts.
   - `query(options: AuditQueryOptions): AuditEvent[]` — filter by type, actor, time range, trace ID. Supports limit/offset pagination.
   - `verifyChain(fromSeq?, toSeq?): { valid: boolean; brokenAt?: number }` — recomputes checksums and verifies chain integrity.
   - `getLatestChecksum(): string | null`
   - `count(): number`
   - `close(): void`

3. **`packages/audit/src/audit-emitter.ts`** — Helper that wraps `AuditStore` with convenience methods:
   - `emitToolExecuted(agentId, toolName, args, result, traceId?, spanId?)`
   - `emitToolBlocked(agentId, toolName, reason, traceId?, spanId?)`
   - `emitLlmCalled(agentId, model, tokenUsage, traceId?, spanId?)`
   - `emitStateChanged(agentId, fromState, toState)`
   - `emitCommandBlocked(agentId, command, reason)`
   - `emitAccessDenied(actorType, actorId, resource, reason)`
   - `emitConfigChanged(changedKeys[])`

   Each method builds the `AuditEvent` and calls `store.append()`.

4. **`packages/audit/src/index.ts`** — Barrel export.

**Modified files:**

5. **`packages/agent-runtime/src/agent-loop.ts`** — After each tool execution, call `auditEmitter.emitToolExecuted()`. On tool block, call `emitToolBlocked()`. On LLM call completion, call `emitLlmCalled()`.

6. **`packages/agent-runtime/src/agent-manager.ts`** — On state transitions, call `emitStateChanged()`.

7. **`packages/tools/src/builtin/bash-handler.ts`** — When a command is blocked (CRITICAL or sanitization failure), call `emitCommandBlocked()`.

8. **`packages/app/src/bootstrap.ts`** — Initialize `AuditStore` and `AuditEmitter`. Inject emitter into agent-runtime and tools via constructor/options pattern. Add audit store to graceful shutdown.

9. **`packages/core/src/config.ts`** — Add optional `audit?: AuditConfig`:
   ```typescript
   interface AuditConfig {
     enabled: boolean;
     dbPath?: string;        // default: '~/.agentic-os/audit.db'
     retentionDays?: number; // default: 90
   }
   ```

10. **`config/default.json5`** — Add `audit` section.

11. **`knip.json`** — Add `packages/audit` workspace entry.

**Dependencies:** `better-sqlite3` (already in the monorepo via memory package). No new dependencies.

**Tests (`packages/audit/tests/`):**
- `audit-store.test.ts`:
  - Append event returns valid event with sequence number and checksum
  - Sequence numbers are monotonically increasing
  - Checksum chain verification passes for valid chain
  - Checksum chain verification detects tampering (manual DB update bypassing trigger)
  - UPDATE trigger rejects modifications
  - DELETE trigger rejects deletions
  - Query by event type filters correctly
  - Query by actor filters correctly
  - Query by time range filters correctly
  - Query by trace ID filters correctly
  - Pagination (limit/offset) works
  - Empty store returns valid on verify
- `audit-emitter.test.ts`:
  - Each `emit*` method creates correct event type
  - Trace context is propagated when provided
  - Actor is set correctly per method
  - Data payload contains expected fields

---

### Sub-Phase 7C — Security Hardening: Shell & Policy

This sub-phase addresses the risk classifier enhancements, session-level policy, and env var deny-list.

**Modified files:**

1. **`packages/tools/src/builtin/risk-classifier.ts`** — Enhancements:
   - **Obfuscation detection**: Add `detectObfuscation(command): string | null` that checks for:
     - Base64-encoded payloads: `echo ... | base64 -d | sh` or `$(echo ... | base64 -d)`
     - Hex-escaped characters: `$'\x72\x6d'` (bash ANSI-C quoting)
     - Octal escapes: `$'\162\155'`
     - Variable-based obfuscation: `${cmd}` where cmd could be anything
   - **Allowlist mode**: Add `classifyCommandAllowlist(command, allowedCommands: string[]): RiskAssessment` that returns CRITICAL for any command not in the allowlist. The base command (first word) must appear in `allowedCommands`.
   - Update `sanitizeArguments()` to also block:
     - `eval` command
     - `source` / `.` (dot-source) when followed by remote URLs
     - Process substitution: `<()` and `>()`

2. **`packages/tools/src/builtin/bash-handler.ts`** — Wire allowlist mode:
   - If `options.allowedCommands` is set, use `classifyCommandAllowlist()` instead of `classifyCommandRisk()`.
   - Options interface gains `allowedCommands?: string[]`.

3. **`packages/tools/src/policy-engine.ts`** — Add session-level policy (4th layer):
   - `PolicyContext` gains:
     ```typescript
     sessionType?: 'dm' | 'group' | 'spawn' | 'cron';
     sessionTools?: { allow?: string[]; deny?: string[] };
     ```
   - `resolveEffectivePolicy()` now resolves: Global → Agent → Binding → Session.
   - Session allow intersects (narrows), session deny stacks (additive) — same pattern as binding.
   - Default session-type constraints (applied before explicit `sessionTools`):
     - `spawn`: inherits parent agent's narrowed scope (no additional expansion)
     - `cron`: deny `group:orchestration` by default (prevent cron jobs from spawning agents)
     - `dm` and `group`: no additional defaults

4. **`packages/core/src/config-env-overlay.ts`** — Add deny-list:
   - Define `ENV_OVERRIDE_DENY_PATTERNS`: array of path patterns that cannot be overridden via env vars:
     - `auth.profiles.*.apiKey`
     - `auth.profiles.*.apiKeyEnv`
     - `models.providers.*.authProfileId`
   - `applyEnvOverrides()` checks each override path against deny patterns before applying. Logs a warning for blocked overrides.
   - Pattern matching: glob-style with `*` matching a single segment.

5. **`packages/core/src/tools.ts`** — Update `PolicyContext` type with session fields.

**Tests:**
- `packages/tools/tests/risk-classifier.test.ts` — Add:
  - Obfuscation detection: base64 pipe to sh, hex escapes, octal escapes
  - `eval` blocked
  - Process substitution blocked
  - Allowlist mode: allowed command passes, unlisted command blocked, chained with unlisted blocked
- `packages/tools/tests/bash-handler.test.ts` — Add:
  - Allowlist mode blocks unlisted commands
  - Allowlist mode allows listed commands
- `packages/tools/tests/policy-engine.test.ts` — Add:
  - Session-level deny stacks with binding/agent deny
  - Session-level allow narrows binding allow
  - `spawn` session type inherits parent scope
  - `cron` session type denies orchestration tools by default
  - Session tools combined with binding overrides
- `packages/core/tests/config-env-overlay.test.ts` — Add:
  - Auth path override is blocked
  - Warning is logged for blocked override
  - Non-auth paths still work

---

### Sub-Phase 7D — Sandbox Hardening

**Modified files:**

1. **`packages/tools/src/sandbox/docker-cli.ts`** — Additional security flags:
   - Add `--security-opt seccomp=<profile-path>` using a custom seccomp profile
   - Add `--ulimit nofile=1024:1024` (limit open files)
   - Add `--ulimit nproc=256:256` (limit processes, complements `--pids-limit`)
   - The command executed inside the container gets wrapped: `timeout {seconds} sh -c '{command}'` for hard timeout enforcement

2. **`packages/tools/src/sandbox/seccomp-profile.ts`** — New file:
   - Exports `SECCOMP_PROFILE` as a JSON object extending Docker's default profile
   - Additionally blocks: `ptrace`, `process_vm_readv`, `process_vm_writev`, `personality`, `userfaultfd`, `perf_event_open`
   - `writeSeccompProfile(dir: string): string` — writes the profile to a temp file, returns the path (needed for `--security-opt seccomp=<path>`)

3. **`packages/tools/src/sandbox/sandbox-manager.ts`** — Wire binding-level overrides:
   - `getOrCreate()` gains optional `overrides?: SandboxOverrides` parameter
   - Overrides can customize: `memoryLimit`, `cpuLimit`, `networkMode`, `readOnlyRoot`, `timeout`
   - Stricter values from overrides take precedence (e.g., lower memory limit, shorter timeout)

4. **`packages/app/src/agent-wiring.ts`** — Pass binding sandbox overrides to sandbox manager:
   - In `onBeforeDispatch`, extract `binding.overrides.sandbox` and pass to sandbox operations

5. **`docker/Dockerfile.sandbox`** — Harden:
   - Add `HEALTHCHECK NONE` (no health check needed for exec-style containers)
   - Ensure `/workspace` is the only writable mount point

**Tests:**
- `packages/tools/tests/docker-cli.test.ts` — Add:
  - Seccomp profile flag is included
  - ulimit flags are included
  - Command wrapping with `timeout`
- `packages/tools/tests/sandbox-manager.test.ts` — Add:
  - Binding overrides customize container creation
  - Stricter override values take precedence
- `packages/tools/tests/seccomp-profile.test.ts` — New:
  - Profile contains blocked syscalls
  - `writeSeccompProfile()` creates a valid JSON file
  - Profile extends default (doesn't replace it)

---

### Sub-Phase 7E — Integration Wiring & Verification

This final sub-phase wires everything together and runs the full verification suite.

**Modified files:**

1. **`packages/app/src/bootstrap.ts`** — Full integration:
   - Initialize `AuditStore` early (before agents)
   - Create `AuditEmitter` and pass to agent wiring
   - Initialize OTel telemetry from config
   - Ensure graceful shutdown order: agents → audit store → telemetry → gateway

2. **`packages/app/src/agent-wiring.ts`** — Accept and wire:
   - `AuditEmitter` into agent manager and tool handlers
   - Seccomp profile path to sandbox manager
   - Session-level policy context in dispatch path

3. **`packages/core/src/index.ts`** — Export new types:
   - `ObservabilityConfig`, `AuditConfig`
   - Updated `PolicyContext` with session fields
   - Observability utility functions

4. **`config/default.json5`** — Final config additions:
   - `observability` section
   - `audit` section
   - Ensure all new config sections have sensible defaults

**Verification checklist (manual + CI):**
- `turbo run build` — all packages compile (including new `audit` package)
- `turbo run check-types` — no TypeScript errors
- `turbo run test` — all tests pass (existing + ~60 new tests)
- `npx knip` — no unused exports or dependencies
- Trace: send a message → verify spans are emitted to console exporter
- Audit: execute tool calls → verify events in SQLite with valid checksums
- Security: attempt obfuscated command → verify blocked + audit event
- Session policy: create spawn session → verify narrowed tools
- Env deny-list: attempt `AGENTIC_OS_AUTH__PROFILES__0__APIKEY=evil` → verify blocked

---

## Dependency Graph (Build Order)

```
Sub-Phase 7A (OTel)
    ↓
Sub-Phase 7B (Audit) ← can start in parallel with 7A (no OTel dependency for core audit)
    ↓
Sub-Phase 7C (Security) ← independent of 7A/7B
    ↓
Sub-Phase 7D (Sandbox) ← independent of 7A/7B/7C
    ↓
Sub-Phase 7E (Integration) ← depends on all above
```

Sub-phases 7A, 7B, 7C, and 7D are largely independent and can be developed in any order. Sub-phase 7E wires them together.

Recommended implementation order: **7C → 7D → 7B → 7A → 7E** — start with security hardening (pure logic, no new deps), then sandbox (small changes), then audit (new package but familiar pattern), then OTel (most new dependencies), then integration.

---

## New Dependencies Summary

| Package | Added To | Purpose |
|---------|----------|---------|
| `@opentelemetry/api` | `packages/core` | OTel core API |
| `@opentelemetry/sdk-node` | `packages/core` | Node SDK setup |
| `@opentelemetry/sdk-trace-node` | `packages/core` | Trace provider |
| `@opentelemetry/sdk-metrics` | `packages/core` | Metrics provider |
| `@opentelemetry/exporter-trace-otlp-http` | `packages/core` | OTLP trace export |
| `@opentelemetry/exporter-metrics-otlp-http` | `packages/core` | OTLP metrics export |
| `@opentelemetry/semantic-conventions` | `packages/core` | Standard attributes |
| `better-sqlite3` | `packages/audit` | Already in monorepo (memory) |

---

## Deferred to Phase 8

- **OTel Collector sidecar** + Jaeger + Prometheus + Grafana Docker Compose stack
- **LLM cost tracking metric** (`agent.llm.cost`) — requires per-model pricing data
- **Full RBAC** with JWT, `roles[]`, `scopes[]`, `requiredScopes` on tools, delegation chains
- **Secrets proxy** for sandbox credential injection
- **PostgreSQL audit store** option (swap in via `AuditStore` interface)
- **DM/group session policy enforcement** in channel manager
