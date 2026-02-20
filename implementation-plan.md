# Agentic Operating System — Phased Implementation Plan

> **Stack:** TypeScript · Node.js ≥ 22 · pnpm · Turborepo · pi-mono · NATS JetStream · Redis · SQLite (FTS5 + sqlite-vec) · Docker
> **Guiding principle:** Every phase delivers a working, testable system. Each phase extends — never rewrites — the previous one.

---

## Phase 0 — Project Scaffold & Core Contracts (Week 1–2) ✅ COMPLETE

### Goal
Establish the monorepo, define every shared type and interface that downstream phases will code against, and verify the toolchain.

### What we build

**Monorepo structure** using pnpm workspaces + Turborepo:

```
agentic-os/
├── packages/
│   ├── core/               # Shared types, interfaces, utilities
│   ├── gateway/            # Central messaging gateway
│   ├── agent-runtime/      # Agent loop & lifecycle
│   ├── memory/             # Episodic memory subsystem (SQLite + FTS5 + sqlite-vec)
│   ├── tools/              # Tool registry, sandboxing, MCP
│   ├── plugins/            # Plugin loader & skill system
│   ├── orchestrator/       # Multi-agent routing
│   └── typescript-config/  # Shared tsconfig.json presets
├── config/
│   └── default.json5       # Master configuration schema
├── scripts/                # Dev tooling, Docker helpers
├── docker/                 # Dockerfiles, compose files
├── pnpm-workspace.yaml     # Workspace package globs
├── turbo.json              # Turborepo task pipeline
├── package.json            # Root: turbo devDep, workspace scripts
└── pnpm-lock.yaml          # Single lockfile for all packages
```

**Why pnpm + Turborepo over npm workspaces.** pnpm's content-addressable store hard-links every dependency file exactly once on disk, delivering ~4× faster installs and ~75% less disk usage than npm. Its non-flat `node_modules/` structure prevents phantom dependencies — if a package doesn't declare a dependency in its own `package.json`, the import fails immediately rather than silently succeeding via hoisting. Turborepo layers on top as a build orchestrator (not a package manager): it reads the pnpm lockfile to understand the dependency graph, topologically sorts tasks, runs independent tasks in parallel, and caches outputs by content hash. Cached rebuilds complete in milliseconds instead of seconds.

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "packages/*"
```

**`turbo.json` — task pipeline:**
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**/*.ts", "tests/**/*.ts"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `^` prefix in `dependsOn` means "run this task in my dependency packages first" — so `packages/gateway` (which depends on `packages/core`) will always see `core` built before its own build starts. Independent tasks like `lint` across packages run in parallel across all CPU cores.

**Internal package references** use the pnpm workspace protocol. Every `package.json` that depends on `@agentic-os/core` declares:
```json
{ "dependencies": { "@agentic-os/core": "workspace:*" } }
```
pnpm links the local package during development and substitutes the real published version on `pnpm publish`.

**`packages/core` — the type authority.** Every other package imports from here; nothing imports the other direction. Define:

```typescript
// Message envelope (CloudEvents v1.0 + agent extensions)
interface AgentMessage {
  id: string;                    // UUIDv7
  specversion: "1.0";
  type: string;                  // e.g. "task.request", "tool.invoke"
  source: string;                // "agent://{id}" | "gateway://{nodeId}"
  target: string;                // "agent://{id}" | "topic://{name}"
  time: string;                  // RFC 3339
  datacontenttype: string;
  data: unknown;
  correlationId?: string;
  causationId?: string;
  replyTo?: string;
  idempotencyKey?: string;
  sequenceNumber?: number;
  ttl?: number;
  traceContext?: { traceId: string; spanId: string; traceFlags: number };
  metadata?: Record<string, string>;
}

// Agent lifecycle
enum AgentStatus {
  REGISTERED, INITIALIZING, READY, RUNNING, SUSPENDED, TERMINATED, ERROR
}

// Agent Control Block
interface AgentControlBlock {
  agentId: string;
  status: AgentStatus;
  priority: number;
  currentTaskId?: string;
  loopIteration: number;
  tokenUsage: { input: number; output: number; total: number };
  snapshotRef?: string;
  createdAt: string;
  lastActiveAt: string;
}

// Plugin contract
interface PluginManifest {
  name: string;
  version: string;
  description: string;
  dependencies?: Record<string, string>;
  capabilities?: ("tools" | "hooks" | "commands" | "skills")[];
}

interface Plugin {
  manifest: PluginManifest;
  onLoad(ctx: PluginContext): Promise<void>;
  onUnload(): Promise<void>;
}

interface PluginContext {
  registerTool(def: ToolDefinition): void;
  registerHook(event: LifecycleEvent, handler: HookHandler): Disposable;
  registerCommand(name: string, handler: CommandHandler): Disposable;
  getService<T>(name: string): T;
  logger: Logger;
  config: Record<string, unknown>;
}

// Tool definition (MCP-compatible)
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  annotations?: {
    readOnly?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
    riskLevel: "green" | "yellow" | "red" | "critical";
  };
}

// LLM provider contract (provider-agnostic — implementations in Phase 2)
interface LLMProvider {
  id: string;
  streamCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions
  ): AsyncIterable<StreamChunk>;
  countTokens(messages: Message[]): Promise<number>;
  supportsPromptCaching: boolean;
}

// Lifecycle hook events
type LifecycleEvent =
  | "input" | "before_agent_start" | "agent_start"
  | "turn_start" | "context_assemble"
  | "tool_call" | "tool_execution_start" | "tool_execution_end" | "tool_result"
  | "turn_end" | "agent_end"
  | "memory_flush" | "session_compact";
```

**Master configuration schema** (`config/default.json5`) — JSON5 format following OpenClaw's model. Define sections for `gateway`, `agents`, `bindings`, `models`, `auth`, `session`, `tools`, `sandbox`, and `plugins`. Use JSON Schema for validation, with strict-mode rejecting unknown keys.

**Toolchain:** TypeScript 5.x with strict mode, Vitest for testing, ESLint + Prettier, `tsup` for builds. pnpm as package manager (enforce via `corepack enable && corepack prepare pnpm@latest --activate` and a root `"packageManager": "pnpm@10.x.x"` field). Turborepo as task orchestrator (`pnpm add -Dw turbo`). Every package exposes a clean `index.ts` barrel.

### How to verify
- `turbo run build` compiles the full workspace in dependency order with zero errors.
- `turbo run test` runs type-level tests confirming all interfaces are importable cross-package.
- `turbo run check-types` passes with no TypeScript errors across all packages.
- Running `turbo run build` a second time with no changes completes in <1 second (cache hit).
- The config validator rejects malformed JSON5 and unknown keys.

---

## Phase 1 — Central Messaging Gateway (Week 3–5) ✅ COMPLETE

### Goal
Stand up the message bus so every subsequent component has a communication backbone from day one.

### What we build

**NATS JetStream server** via Docker Compose. Define three persistent streams:

| Stream | Subjects | Retention | Purpose |
|--------|----------|-----------|---------|
| `AGENT_TASKS` | `agent.*.inbox` | WorkQueue | Direct agent-to-agent commands |
| `AGENT_EVENTS` | `agent.events.>` | Interest | Pub/sub broadcasts |
| `SYSTEM` | `system.>` | Limits (7d) | Heartbeats, config reload, DLQ |

Configure `max_deliver: 3`, `ack_wait: 30s`, and a dead-letter republish rule that moves failed messages to `system.dlq.>` with failure metadata headers.

**Gateway server** (`packages/gateway`) — a Node.js process that:

1. **Connects to NATS** on startup, creates/verifies the three streams.
2. **Opens a WebSocket** on a configurable port (default `18789`). Incoming connections authenticate via a bearer token from the config.
3. **Implements a Lane Queue** — a per-session serial execution queue. Key sessions by `{agentId}:{channelId}:{userId}`. Only one message processes per lane at a time; others queue in order. This prevents race conditions in agent state.
4. **Routes messages** by inspecting `AgentMessage.target`:
   - `agent://{id}` → publish to `agent.{id}.inbox`
   - `topic://{name}` → publish to `agent.events.{name}`
5. **Exposes four messaging patterns** through helper functions:
   - `publish(msg)` — fire-and-forget onto a NATS subject.
   - `request(msg, timeoutMs)` — uses NATS native request/reply with `_INBOX` subjects. Returns the correlated response or throws on timeout.
   - `fanOut(msgs[], timeoutMs)` — publishes N messages with a shared `correlationId`, collects responses with a deadline, returns partial results on timeout.
   - `subscribe(subject, queueGroup?, handler)` — registers a push or pull consumer.
6. **Idempotency layer** — on message publish, set the `Nats-Msg-Id` header to `msg.idempotencyKey ?? msg.id` for JetStream server-side dedup (2-minute window). On message consume, check Redis `SETNX agentos:idem:{idempotencyKey} 1 EX 86400` before processing.
7. **Circuit breaker** per downstream target — tracks failure counts, transitions CLOSED → OPEN (after 5 failures in 60s) → HALF_OPEN (after 30s cooldown). When open, **pause the NATS consumer** (don't reject to DLQ) so messages accumulate in the stream and drain naturally on recovery.

**Redis** via Docker Compose for idempotency keys, session state caching, and presence tracking.

**Health & readiness endpoints** — HTTP `/health` and `/ready` that verify NATS and Redis connectivity.

### How to verify
- Integration test: two test clients connect via WebSocket, one publishes a `task.request` message targeting the other, and the second receives it within 100ms.
- Request/reply test: client A sends a request, client B responds, client A receives the correlated reply.
- Idempotency test: publish the same message ID twice; the handler fires exactly once.
- Circuit breaker test: simulate 5 consecutive consumer failures; verify the consumer pauses and resumes after cooldown.
- DLQ test: publish a message that NAKs 3 times; verify it appears on `system.dlq.>`.

---

## Phase 2 — Agent Runtime & Lifecycle (Week 6–9) ✅ COMPLETE

### Goal
Build the agent execution engine — the loop that calls the LLM, executes tools, and manages agent state transitions.

### What we build

**LLM abstraction layer** — define a provider-agnostic `LLMProvider` interface in `@agentic-os/core` that any backend must implement:

```typescript
interface LLMProvider {
  id: string;
  streamCompletion(
    messages: Message[],
    tools: ToolDefinition[],
    options: CompletionOptions
  ): AsyncIterable<StreamChunk>;
  countTokens(messages: Message[]): Promise<number>;
  supportsPromptCaching: boolean;
}
```

The default implementation, `PiMonoProvider`, wraps `@mariozechner/pi-ai` from pi-mono. Alternative providers (e.g., Vercel AI SDK, direct HTTP) can be swapped in by implementing the same interface — no other code changes required.

The `LLMService` class orchestrates providers:
- Reads provider credentials from the config's `auth` section.
- Accepts a `LLMProvider[]` and selects the active provider based on config and availability.
- Implements **auth profile rotation**: try profiles in order within a provider, then fall back across providers using the `models.fallbacks` array. Session-sticky profile selection (same profile for the lifetime of a session, reset on new session or compaction).
- Exposes `streamCompletion(messages, tools, options)` returning an async iterable of chunks (delegates to the active provider).
- Tracks token usage per call and cumulative per session.

**Agent loop** (`packages/agent-runtime`) — an async generator following pi-mono's pattern:

```typescript
interface AgentLoopOptions {
  maxTurns?: number;  // Default: 100. Hard ceiling to prevent runaway loops.
}

async function* agentLoop(
  llm: LLMService,
  context: ConversationContext,
  tools: ToolDefinition[],
  hooks: HookRegistry,
  options: AgentLoopOptions = {}
): AsyncGenerator<AgentEvent> {

  const maxTurns = options.maxTurns ?? 100;
  let turnCount = 0;

  await hooks.fire("before_agent_start", context);

  while (true) {
    if (++turnCount > maxTurns) {
      yield { type: "max_turns_reached", turns: turnCount - 1 };
      break;
    }

    await hooks.fire("turn_start", context);

    // Let plugins modify context before LLM call
    const assembled = await hooks.fire("context_assemble", context);

    const response = await llm.streamCompletion(
      assembled.messages, tools, assembled.options
    );

    yield { type: "assistant_message", content: response };

    if (!response.toolCalls?.length) break;  // Agent decided it's done

    for (const call of response.toolCalls) {
      const allowed = await hooks.fire("tool_call", call);
      if (allowed.blocked) {
        yield { type: "tool_blocked", name: call.name, reason: allowed.reason };
        continue;
      }

      await hooks.fire("tool_execution_start", call);
      const result = await executeToolCall(call, context);
      await hooks.fire("tool_execution_end", call, result);

      yield { type: "tool_result", name: call.name, result };
      context.messages.push(/* assistant msg + tool result */);
    }

    await hooks.fire("turn_end", context);
  }

  await hooks.fire("agent_end", context);
}
```

**Agent lifecycle state machine** — the `AgentManager` class tracks each agent's `AgentControlBlock` and enforces valid transitions:

```
REGISTERED ──init()──→ INITIALIZING ──loaded──→ READY
                           │                       │
                       error/timeout          dispatch()
                           ↓                       ↓
                         ERROR ←──fatal──── RUNNING
                           │                  │   │
                      cleanup()          suspend  done
                           ↓              ↓       ↓
                      TERMINATED ←──── SUSPENDED  TERMINATED
                                           │
                                      resume()──→ READY
```

On `init()`: load agent config, allocate workspace directory, load persona files (`SOUL.md`, `AGENTS.md`, `USER.md`), bind to an LLM provider, restore snapshot if one exists. On `dispatch()`: pop a message from the agent's lane queue, set status to RUNNING, invoke the agent loop. On `suspend()`: serialize the `AgentSnapshot` (messages, loop iteration, pending tool calls, workspace git hash) to disk as JSON, set status to SUSPENDED. On `resume()`: deserialize the snapshot, restore context, set status to READY.

**Session management** — each session is a JSONL file under `~/.agentic-os/sessions/{agentId}/{sessionId}.jsonl`. First line is the session header (ID, created timestamp, agent ID, channel). Subsequent lines are entries with `id`, `parentId` (for branching), `role`, `content`, and `timestamp`. Implement `createSession()`, `appendEntry()`, `getHistory()`, and `forkSession()`.

**Context compaction** — when total tokens exceed `contextWindow - reserveTokens` (default reserve: 20,000):
1. Fire `memory_flush` hook — triggers the memory subsystem (Phase 3) to persist durable state.
2. Summarize the conversation using a dedicated LLM call with a compaction prompt.
3. Replace the message history with: system prompt + compaction summary + last 3 exchanges.
4. Fire `session_compact` hook.
5. Full transcript remains in the JSONL file for later retrieval.

**Gateway integration** — each `AgentManager` instance subscribes to `agent.{agentId}.inbox` via the gateway. Incoming messages enter the lane queue and trigger `dispatch()`.

### How to verify
- Unit test: the agent loop with a mock LLM that returns a text response terminates after one turn.
- Unit test: the agent loop with a mock LLM that returns a tool call, then text, runs exactly two turns.
- Unit test: the agent loop with a mock LLM that always returns tool calls hits `maxTurns` and yields `max_turns_reached` instead of looping forever.
- Integration test: send a message via the gateway to a registered agent; receive a response routed back through the gateway.
- Lifecycle test: init → dispatch → suspend → resume → dispatch → terminate. Verify snapshot round-trips correctly.
- Compaction test: feed 100 messages into a session, trigger compaction, verify the context shrinks while the JSONL file retains everything.

---

## Phase 3 — Memory Subsystem (Week 10–13) ✅ COMPLETE

### Goal
Give agents persistent episodic memory across sessions using SQLite-only storage (no new infrastructure dependencies), with agent-initiated memory tools rather than auto-injection.

### Design decisions (simplified from original plan)

After comparing our original design against OpenClaw (SQLite-only, agent-initiated search, proven in production) and Claude Code (pure filesystem, no vector search), we simplified Phase 3:

- **SQLite-only** storage (sqlite-vec + FTS5) instead of Qdrant + Redis — zero new infrastructure.
- **Agent-initiated memory tools** (`memory_search`, `memory_get`) instead of auto-injecting context every turn via `context_assemble` hooks.
- **Deferred knowledge graph** (entities, relationships, bi-temporal edges) to a later phase.
- **Skipped Redis working memory** — `ConversationContext` + `SessionStore` from Phase 2 already cover working memory needs.

### What we built

**Package:** `packages/memory/` (`@agentic-os/memory`) — 13 source files, 83 tests across 9 test suites.

**SQLite schema** — one database per agent. WAL mode + `busy_timeout=5000` for concurrency:

```sql
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  token_count INTEGER NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'conversation',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK (importance >= 0.0 AND importance <= 1.0)
);
-- Indexes on agent_id, session_id, created_at, importance, source_type

-- FTS5 for BM25 keyword search (synced via INSERT/UPDATE/DELETE triggers)
CREATE VIRTUAL TABLE chunks_fts USING fts5(content, content='chunks', content_rowid='rowid');

-- sqlite-vec for vector similarity search (created only if extension loads)
CREATE VIRTUAL TABLE chunks_vec USING vec0(embedding float[{dimensions}]);

CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

**`EpisodicMemoryStore`** (`memory-store.ts`) — the core store class:
- Constructor: `{ agentId, dbPath, config, embeddingProvider }`
- `open()` — loads sqlite-vec (graceful fallback if unavailable), creates tables, enables WAL. Tracks `hasVectorSupport: boolean` flag.
- `close()` — closes db connection.
- `upsertChunks(chunks[])` — inserts into all three tables (chunks, FTS5, vec) within a transaction.
- `search(options: SearchOptions)` — hybrid search pipeline (BM25 + vector → fusion → temporal decay → MMR).
- `get(options: GetOptions)` — retrieve by ID, date, or session.
- `updateImportance(chunkIds[], importance)` — update scores (clamped to [0, 1]).
- `stats()` — chunk count, db size, vector support status.

**Hybrid search pipeline** (`hybrid-search.ts`) — pure math, no I/O:
1. Vector search + BM25 search fetch `maxResults × 4` candidates each.
2. Normalize scores to [0, 1] via min-max normalization.
3. Union merge with weighted fusion: `0.7 × vectorScore + 0.3 × bm25Score`.
4. Temporal decay: `score *= 2^(-(daysSinceCreation / halfLifeDays))` (default 30-day half-life).
5. MMR re-ranking for diversity (lambda=0.6, Jaccard similarity for content distance).
6. Return top-K results.
7. Falls back to BM25-only when embeddings unavailable.

**Memory tools** (`memory-tools.ts`) — two `ToolDefinition` objects + `ToolHandler` functions:
- **`memory_search`** — `{ query, max_results?, min_importance?, date_from?, date_to? }` — runs hybrid search, returns formatted results.
- **`memory_get`** — `{ id?, date?, session_id?, limit? }` — retrieves specific chunks or daily log content.
- Both are `readOnly`, `riskLevel: 'green'`. Handler type matches `ToolHandler = (args) => Promise<unknown>` from `agent-runtime/tool-executor.ts`.

**Memory flush handler** (`memory-flush-handler.ts`) — registered on the `memory_flush` lifecycle event. When `ContextCompactor.compact()` fires the hook:
1. Extracts conversation history from context.
2. Scores importance via `HeuristicImportanceScorer`.
3. Chunks the conversation text.
4. Embeds chunks (batch, with graceful failure).
5. Upserts into episodic store.
6. Returns context unchanged (pass-through).

**Chunker** (`chunker.ts`) — sentence-aligned text chunking:
- Splits text at sentence boundaries (`.!?` followed by whitespace).
- Accumulates to ~400 tokens per chunk with 80-token overlap.
- Token estimation: `Math.ceil(text.length / 4)` (matches existing `PiMonoProvider` heuristic).
- Handles oversized single sentences by emitting them as standalone chunks.

**Importance scorer** (`importance-scorer.ts`) — heuristic-based (LLM-based scorer can replace it):
- Boosts: decisions (+0.15), action items (+0.1), Q&A content (+0.05), code (+0.1).
- Penalizes very short content (-0.1).
- Clamps result to [0, 1].

**Embedding providers:**
- `NullEmbeddingProvider` (`embedding-provider.ts`) — returns empty arrays (BM25-only fallback). `dimensions = 0`.
- `OpenAIEmbeddingProvider` (`openai-embedding-provider.ts`) — direct `fetch()` to OpenAI API (no SDK dependency). Supports `text-embedding-3-large` at 1024 dims, batched at 64 texts per request.

**Daily log helpers** (`daily-log.ts`) — `readDailyLog()`, `listDailyLogs()`, `appendDailyLog()` for reading/writing `memory/YYYY-MM-DD.md` files.

### Integration with existing code

**No circular dependencies:** `@agentic-os/memory` depends on `@agentic-os/core` and `@agentic-os/agent-runtime`. Neither depends back on memory. Wiring happens at the application level via existing public APIs:
- `AgentManager.getHookRegistry()` → register `memory_flush` handler.
- `AgentManager.setTools()` → add memory tools + handlers.

**Files modified:**
- `packages/core/src/config.ts` — added `MemoryConfig` interface and optional `memory?` field to `AgenticOsConfig`.
- `packages/core/src/config-validator.ts` — added `'memory'` to `VALID_TOP_LEVEL_KEYS` (separate from `REQUIRED_SECTIONS`).
- `packages/core/src/index.ts` — exported `MemoryConfig` type.
- `config/default.json5` — added `memory` section with defaults (embedding, search weights, chunking, importance scoring, daily log).
- `knip.json` — added `packages/memory` workspace entry.
- `package.json` — added `better-sqlite3` to `pnpm.onlyBuiltDependencies`.

**Dependencies:** `better-sqlite3` (native SQLite bindings), `sqlite-vec` (vector extension, optional), `@types/better-sqlite3`. No OpenAI SDK.

### Configuration

Added to `config/default.json5`:
```json5
memory: {
  enabled: true,
  embedding: {
    provider: 'openai',           // 'openai' | 'none'
    dimensions: 1024,
    model: 'text-embedding-3-large',
    apiKeyEnv: 'OPENAI_API_KEY',
    batchSize: 64,
  },
  search: {
    vectorWeight: 0.7,
    bm25Weight: 0.3,
    decayHalfLifeDays: 30,
    mmrLambda: 0.6,
    defaultMaxResults: 10,
  },
  chunking: {
    targetTokens: 400,
    overlapTokens: 80,
    maxChunkTokens: 600,
  },
  importanceScoring: {
    enabled: true,
    defaultImportance: 0.5,
  },
  dailyLog: {
    enabled: true,
    directory: 'memory',
  },
},
```

The `memory` section is optional — when absent, all memory initialization is skipped.

### Deferred to future phases
- **Knowledge graph** (entities, relationships, bi-temporal edges) — deferred until semantic memory queries justify the complexity.
- **Redis working memory** — `ConversationContext` + `SessionStore` already cover this.
- **Auto-injection via `context_assemble` hook** — replaced with agent-initiated `memory_search` tool for simpler, more predictable behavior.
- **LLM-based importance scoring** — using heuristic scorer for now; LLM-based scorer can be swapped in via the `ImportanceScorer` interface.

### How to verify
- `turbo run build` — compiles all packages including memory.
- `turbo run check-types` — no TypeScript errors.
- `turbo run test` — all 83 memory tests pass across 9 test files:
  - Chunker: correct chunk sizes, sentence alignment, overlap, oversized sentence handling.
  - Hybrid search: normalization, fusion math, temporal decay curve, cosine similarity, MMR diversity.
  - Memory store: upsert/search/get round-trips with real SQLite, BM25 search, importance updates, metadata preservation, limit enforcement.
  - Memory tools: valid search returns results, missing query returns error, respects max_results, retrieval by ID/session/date.
  - Memory flush: conversation is chunked and stored, handles empty history, invalid context, importance scores applied.
  - Schema: table creation, index creation, FTS5 triggers sync, constraint enforcement, WAL/busy_timeout pragmas.
  - Embedding providers: NullEmbeddingProvider returns empty arrays, correct dimensions.
  - Importance scorer: default scores, decision/action/code boosts, short content penalty, clamping.
  - Daily log: read/write/list/append operations, non-existent file handling.
  - Graceful degradation: works without sqlite-vec (BM25-only).
- `npx knip` — no unused exports or dependencies.

---

## Phase 4 — Tool System & Sandboxing (Week 14–17) ✅ COMPLETE

### Goal
Build a secure, extensible tool execution layer with Docker sandboxing and MCP-based tool registration.

### Design decisions

- **`ToolHandler`/`ToolHandlerMap` moved to core** — these pure type aliases are imported by both `memory` and `tools`. Moving them to `core/src/tools.ts` avoids a `tools → agent-runtime` dependency. Re-exported from `agent-runtime` for backward compatibility.
- **Docker via CLI, not dockerode** — shells out to the `docker` CLI using Node's `child_process.execFile`. Matches the project's minimal-dependency philosophy. Scope limited to `create`/`start`/`exec`/`stop`/`rm`.
- **MCP via `@modelcontextprotocol/sdk`** — official SDK, only new external dependency.
- **No changes to agent-runtime** — the tool registry + policy engine produce `ToolDefinition[]` + `ToolHandlerMap` that plug directly into the existing `AgentManager.setTools()` API. Application-level wiring connects them.
- **Tool groups for policy config** — OpenClaw-inspired shorthand (`group:fs`, `group:runtime`, etc.) expanded during policy resolution. Cleaner config for multi-agent setups in Phase 6.

### What we built

**Package:** `packages/tools/` (`@agentic-os/tools`) — 22 source files, 108 tests across 11 test suites.

**Core type extensions** (`packages/core/src/tools.ts`) — added types shared across packages:

```typescript
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
type ToolHandlerMap = Map<string, ToolHandler>;
type ToolSource = 'builtin' | 'mcp' | 'plugin' | 'memory';

interface ToolRegistryEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
  source: ToolSource;
  mcpServer?: string;
}

interface PolicyContext {
  agentId: string;
  sessionId?: string;
  sandboxMode?: 'off' | 'non-main' | 'all';
}
```

`agent-runtime/src/tool-executor.ts` now imports `ToolHandler`/`ToolHandlerMap` from core instead of defining locally. `agent-runtime/src/index.ts` re-exports from core for backward compatibility — the `memory` package (which imports `ToolHandler` from `agent-runtime`) continues to work unchanged.

**Tool registry** (`registry.ts`) — central in-memory registry, single source of truth for all tool registrations:
- `register(definition, handler, source, mcpServer?)` — throws `ToolConflictError` on duplicate name.
- `unregister(name)`, `get(name)`, `has(name)`, `getAll()`, `getBySource(source)`.
- `buildHandlerMap(names?)` — returns `ToolHandlerMap` compatible with `executeToolCall()`.
- `getDefinitions(names?)` — returns `ToolDefinition[]` for LLM context.
- `clear()`, `size`.

**Error classes** (`errors.ts`) — `ToolConflictError`, `ToolNotFoundError`, `ToolValidationError`, `SandboxError`, `McpConnectionError`.

**Tool groups** (`tool-groups.ts`) — static group definitions for policy shorthand:

```typescript
const TOOL_GROUPS: Record<string, string[]> = {
  'group:runtime': ['bash'],
  'group:fs':      ['read_file', 'write_file', 'edit_file'],
  'group:fs_read': ['read_file'],
  'group:fs_write': ['write_file', 'edit_file'],
  'group:memory':  ['memory_search', 'memory_get'],
  'group:mcp':     ['use_mcp_tool'],
};
```

`expandGroups(entries)` expands `group:*` entries into constituent tool names. Unknown group names pass through as literals.

**Layered tool policy engine** (`policy-engine.ts`) — resolves effective permissions for any `(agent, tool, context)` tuple. The policy chain narrows permissions top-to-bottom; deny always wins:

```
Global Policy (config.tools.allow / deny)
  → Agent Policy (agents.list[].tools)
```

Each layer can only remove tools from the set, never add ones denied by a parent layer. Group expansion (`group:fs`, `group:runtime`, etc.) is applied before matching. The engine exposes three methods:
- `getEffectiveBuiltinTools(ctx: PolicyContext): ToolDefinition[]` — returns built-in + memory + `use_mcp_tool` meta-tool + pinned MCP tools, filtered by policy.
- `getEffectiveMcpCatalog(ctx: PolicyContext): { name, description }[]` — returns compact catalog of allowed MCP tools (excludes pinned).
- `isAllowed(toolName, ctx): boolean` — check a single tool.

**Built-in tools** (`builtin/`) — the foundational four:

*Risk classifier* (`risk-classifier.ts`):
- `classifyCommandRisk(command): RiskAssessment` — splits chained commands (`&&`, `||`, `;`, `|`), classifies each segment, highest risk wins:
  - CRITICAL (always block): `rm -rf /`, `dd if=`, fork bombs, `shutdown`, `reboot`, `mkfs`, `init 0`
  - RED (confirmation required): `rm`, `curl`, `wget`, `docker`, `sudo`, `pip install`, `npm publish`, `chmod`, `chown`
  - YELLOW (log + execute): `git`, `grep`, `find`, `npm`, `node`, `python`, `make`, `cargo`, `go`
  - GREEN (auto-approve): `ls`, `pwd`, `cat`, `echo`, `head`, `tail`, `wc`, `date`, `whoami`, `env`, `which`, `true`, `false`, `test`, `printf`
  - Unknown commands default to YELLOW.
- `sanitizeArguments(command): string | null` — blocks `$()`, backticks, `LD_PRELOAD=`, `LD_LIBRARY_PATH=`, `PATH=` at start, `--exec`/`-exec` on find/git, `--upload-pack`, `--post-checkout` on git. Returns null if safe.

*Bash tool* (`bash-tool.ts`, `bash-handler.ts`):
- `bashToolDefinition` — ToolDefinition with `riskLevel: 'red'`, accepts `command` (string, required) and `timeout` (number, optional).
- `createBashHandler(options): ToolHandler` — flow: classify risk → if CRITICAL, block → sanitize args → if blocked, error → if RED and not yoloMode, error → execute via sandbox or direct `child_process.execFile` → return `{ stdout, stderr, exitCode }`.

*File tools* (`file-tools.ts`):
- `readFileToolDefinition` (`riskLevel: 'green'`) — supports `path`, `offset`, `limit`.
- `writeFileToolDefinition` (`riskLevel: 'yellow'`) — creates parent directories, writes content.
- `editFileToolDefinition` (`riskLevel: 'yellow'`) — unique string replacement (0 matches = error, >1 matches = error).
- All paths resolved relative to `workspaceRoot`. Path traversal (`../` escape) blocked.

*Registration helper* (`register.ts`):
- `registerBuiltinTools(registry, options)` — creates all handlers via factory functions, registers all 4 built-in tools with `source: 'builtin'`.

**Docker sandboxing** (`sandbox/`) — container lifecycle management via Docker CLI:

*Exec utility* (`exec-util.ts`) — promise wrapper for `child_process.execFile` with timeout. Always resolves (never rejects) so callers can inspect stdout/stderr/exitCode.

*Docker CLI wrappers* (`docker-cli.ts`):
- `dockerCreate(options)` — builds `docker create` with full security hardening: `--memory`, `--cpus`, `--pids-limit`, `--network`, `--read-only` (if configured), `--tmpfs /tmp:rw,noexec,nosuid`, `--security-opt no-new-privileges`, `--cap-drop ALL`, `--user 1000:1000`, workspace bind mount.
- `dockerStart(id)`, `dockerExec(id, command, timeout)`, `dockerRemove(id)`, `dockerInfo()`.

*Sandbox manager* (`sandbox-manager.ts`) — higher-level manager:
- `getOrCreate(scopeKey, workspaceDir)` — reuses containers per scope key (named `agentic-sandbox-{scopeKey}`).
- `exec(containerId, command, timeout)`, `destroy(scopeKey)`, `destroyAll()`, `isDockerAvailable()`.

*Dockerfile* (`docker/Dockerfile.sandbox`) — minimal image based on `node:22-slim` with git, curl, python3. Non-root `sandbox` user (UID/GID 1000). Runs `sleep infinity` to stay alive for `docker exec`.

**MCP integration** (`mcp/`) — MCP client with lazy tool loading using `@modelcontextprotocol/sdk`:

*Client connection* (`mcp-client-connection.ts`) — wraps a single MCP server:
- `connect()` — `StdioClientTransport` for stdio, `StreamableHTTPClientTransport` for http-sse.
- `listTools()` — discovers tools, maps to `McpToolInfo`.
- `callTool(name, args)` — routes to backend, handles errors.
- `onToolsChanged(callback)` — listens for `notifications/tools/list_changed` for hot-reload.
- `disconnect()`.

*Client manager* (`mcp-client-manager.ts`) — manages connections to multiple MCP servers:
- `connectAll()` — connects all configured servers in parallel (`Promise.allSettled`), tolerates partial failures.
- `connect(config)` — connects one server, discovers tools, namespaces as `{serverName}__{toolName}`, registers in ToolRegistry with `source: 'mcp'`, sets up hot-reload.
- `disconnect(serverName)` — unregisters all tools from server.
- `callTool(namespacedName, args)` — routes to correct backend, strips namespace.
- `getAllTools()` — returns all discovered MCP tools.
- `getToolSchema(namespacedName)` — returns input schema for validation.

*Schema validator* (`schema-validator.ts`) — lightweight JSON Schema validation for MCP tool args:
- `validateToolArgs(args, schema): ValidationResult` — checks `required` fields and `properties` type matching (`string`, `number`, `integer`, `boolean`, `object`, `array`).
- `formatValidationErrors(errors, schema): string` — readable string with schema hints for LLM self-correction.

*Meta-tool* (`use-mcp-tool.ts`):
- `useMcpToolDefinition` — `name: 'use_mcp_tool'`, accepts `tool_name` (string) and `arguments` (object), `riskLevel: 'yellow'`.
- `createUseMcpToolHandler(mcpManager, policyEngine, getContext): ToolHandler` — checks policy → validates args against schema → routes via mcpManager → returns result. On validation failure, includes schema fields in error message for self-correction.

*Catalog* (`catalog.ts`):
- `buildMcpCatalog(allTools, pinnedNames)` — compact `{ name, description }[]` excluding pinned tools.
- `getPinnedToolDefinitions(pinnedNames, getDefinition)` — full ToolDefinitions for pinned MCP tools.
- `formatMcpCatalog(catalog)` — XML string (`<available-mcp-tools>`) for system prompt injection.

**Prompt integration** (`prompt-integration.ts`):
- `createMcpCatalogPromptHandler(getCatalogText): HookHandler` — `context_assemble` hook handler that injects the MCP catalog into the system prompt. Follows the same `appendToSystemPrompt` pattern from `agent-runtime/src/prompt-handlers.ts`.

### Integration with existing code

**No circular dependencies:** `@agentic-os/tools` depends on `@agentic-os/core` and `@modelcontextprotocol/sdk`. Neither `core` nor `agent-runtime` depends back on tools. Wiring happens at the application level via existing public APIs:
- `AgentManager.setTools()` — accepts `ToolDefinition[]` + `ToolHandlerMap` produced by `ToolRegistry.getDefinitions()` + `ToolRegistry.buildHandlerMap()`.
- `AgentManager.getHookRegistry()` → register `context_assemble` handler for MCP catalog injection.

**Files modified:**
- `packages/core/src/tools.ts` — added `ToolHandler`, `ToolHandlerMap`, `ToolSource`, `ToolRegistryEntry`, `PolicyContext`.
- `packages/core/src/index.ts` — exported new types.
- `packages/agent-runtime/src/tool-executor.ts` — imports `ToolHandler`/`ToolHandlerMap` from core, re-exports.
- `packages/agent-runtime/src/index.ts` — re-exports `ToolHandler`/`ToolHandlerMap` from core.
- `packages/tools/package.json` — added `@modelcontextprotocol/sdk` dependency.
- `knip.json` — removed `ignoreDependencies: ["@agentic-os/core"]` for tools workspace (now actively used).

**Dependencies:** `@modelcontextprotocol/sdk` (official MCP SDK). No other new dependencies.

### Deferred to future phases
- **Exposing the aggregated tool set as a single MCP server endpoint** for external clients — deferred until Phase 8 (Integration & DX).
- **Session-level and sandbox-level policy layers** — the policy engine currently resolves Global → Agent. Session and sandbox layers will be added in Phase 7 (Security Hardening).

### How to verify
- `turbo run build` — compiles all packages including tools.
- `turbo run check-types` — no TypeScript errors.
- `turbo run test` — all 108 tools tests pass across 11 test files:
  - Registry: register/get, conflict detection, unregister, source filtering, handler map building, definitions.
  - Policy engine: allow-all wildcard, agent-level deny, deny-wins-over-wildcard, pinned tools in builtin list, catalog excludes pinned, empty allow = no tools, group expansion in allow/deny lists, unknown groups as literals.
  - Risk classifier: GREEN/YELLOW/RED/CRITICAL classification, chain classification (highest wins), injection blocking ($(), backticks, LD_PRELOAD, --upload-pack).
  - Bash handler: execute green command, block critical, block injection, block RED without yolo, allow RED with yolo, sandbox routing, timeout handling.
  - File tools: read/write/edit operations, line range support, path traversal blocked, unique match enforcement (0 matches = error, >1 matches = error).
  - Docker CLI: command construction verification with security flags, exec/remove/info.
  - Sandbox manager: getOrCreate, container reuse, exec delegation, destroy/destroyAll, Docker availability check.
  - Schema validator: valid args pass, missing required fails, wrong type fails, multiple errors collected, format includes hints.
  - MCP client manager: connectAll discovery, tool namespacing, call routing, disconnect unregisters, getAllTools.
  - use_mcp_tool: valid call routing, policy denial, missing args, validation errors with schema hints.
- `npx knip` — no unused exports or dependencies.
- All existing tests still pass (especially memory package which imports `ToolHandler` from agent-runtime).

---

## Phase 5 — Plugin & Skills System (Week 18–20)

### Goal
Enable extensibility without modifying core code — plugins for deep system integration, skills for agent-level knowledge injection.

### What we build

**Plugin loader** (`packages/plugins`) — discovers, validates, orders, and loads plugins:

1. **Discovery**: scan `~/.agentic-os/plugins/` and any paths in `config.plugins.directories[]`. Each plugin is a directory containing a `package.json` with a `agenticOs` field pointing to the entry module, plus a `manifest` section matching `PluginManifest`.
2. **Dependency resolution**: build a directed acyclic graph from `manifest.dependencies`. Topological sort for load order. Detect and reject circular dependencies. Verify semver compatibility with `semver.satisfies()`.
3. **Loading**: for each plugin in sorted order, dynamically `import()` the entry module, instantiate the plugin, call `onLoad(ctx)` with a scoped `PluginContext`.
4. **Hot-reload**: watch plugin directories with chokidar (250ms debounce). On file change:
   - Call `onUnload()` on the old instance.
   - Invalidate the module from the import cache (use `import()` with cache-busting query param for ESM: `import(path + '?v=' + Date.now())`).
   - Re-import and call `onLoad()`.
   - Re-register all tools, hooks, and commands.

The `PluginContext` provided to each plugin gives access to:
- `registerTool(def)` — adds a tool to the registry (subject to policy).
- `registerHook(event, handler)` — subscribes to a lifecycle event with a priority (lower = earlier). Returns a `Disposable` for cleanup.
- `registerCommand(name, handler)` — adds a slash command for user-facing interaction.
- `getService(name)` — dependency injection point for core services (gateway, memory, llm).
- `logger` — namespaced logger (`[plugin:{name}]`).
- `config` — the plugin's section of the master config.

**Hook registry** — a central `HookRegistry` class that manages all lifecycle event subscriptions:

```typescript
class HookRegistry {
  private hooks: Map<LifecycleEvent, { priority: number; handler: HookHandler }[]>;

  register(event: LifecycleEvent, handler: HookHandler, priority = 100): Disposable;

  async fire(event: LifecycleEvent, context: unknown): Promise<unknown> {
    const handlers = this.hooks.get(event) ?? [];
    handlers.sort((a, b) => a.priority - b.priority);
    let result = context;
    for (const h of handlers) {
      result = await h.handler(result);  // Chain: each handler transforms the context
    }
    return result;
  }
}
```

Hooks are **composable transformers**: each receives the context, can modify and return it, and the next hook receives the modified version. A hook can block execution by throwing a `HookBlockError` (used by `tool_call` hooks to deny tool access).

**Skills system** — follows the AgentSkills spec:

1. **Skill format**: a directory with a `SKILL.md` file. YAML frontmatter declares `name`, `description`, and `metadata` (required env vars, required binaries, OS restrictions).
2. **Discovery**: scan workspace `./skills/`, user `~/.agentic-os/skills/`, and bundled skills. Merge in precedence order (workspace > user > bundled).
3. **Gating**: at load time, check each skill's requirements. Missing binary → skip with warning. Missing env var → skip with warning. Wrong OS → skip silently.
4. **Injection**: eligible skills are compiled into a compact catalog injected into the system prompt — just names, descriptions, and file paths (~24 tokens per skill). The agent reads the full `SKILL.md` via the `read_file` tool on demand (lazy loading).
5. **Hot-reload**: file watcher on skill directories (250ms debounce). On change, refresh the skill snapshot. Active sessions pick up changes on the next turn.

**System prompt compiler** — the `PromptCompiler` class assembles the full system prompt from layered sections:

```
[1] Base identity (from SOUL.md or config)
[2] Built-in tool schemas (bash, read_file, write_file, edit_file + use_mcp_tool meta-tool — full JSON Schema, filtered by policy)
[3] MCP tool catalog (compact list: name + one-line description per tool, filtered by policy)
[4] Pinned MCP tool schemas (full JSON Schema for tools listed in agent's mcp_pinned config)
[5] Safety guardrails
[6] Skills catalog (compact XML: name + description + path)
[7] Memory tools available (memory_search, memory_get — agent-initiated, not auto-injected)
[8] Workspace files (USER.md, AGENTS.md, MEMORY.md — truncated at 20K chars each)
[9] Sandbox info (if active)
[10] Runtime info (agent ID, model, channel, OS, timezone)
```

Static sections (1-6, 9-10) form a **cacheable prefix** for LLM providers that support prompt caching. Dynamic content (7-8) is appended as a suffix. The compiler supports three modes: `full` (all sections — primary agents), `minimal` (built-in tools + use_mcp_tool + safety + runtime — sub-agents), and `none` (identity only).

### How to verify
- Plugin loading: create a test plugin that registers a custom tool. Verify the tool appears in the registry and is callable by an agent.
- Hook composition: register two hooks on `tool_call` — one that logs, one that blocks a specific tool. Verify both fire in priority order and the block prevents execution.
- Hot-reload: modify a loaded plugin's tool handler on disk. Verify the new behavior takes effect within 1 second without restart.
- Skill gating: create a skill requiring a non-existent binary. Verify it's skipped with a warning. Create a valid skill; verify it appears in the prompt.
- Prompt compiler: compile a full prompt for an agent with 3 skills, 5 built-in tools, 20 MCP tools (2 pinned), and memory context. Verify all sections present: built-in schemas in section 2, compact MCP catalog in section 3, pinned MCP schemas in section 4, skills in section 6. Verify total token count is within budget and MCP catalog contributes ~400 tokens (not ~4,000).

---

## Phase 6 — Multi-Agent Orchestration (Week 21–23)

### Goal
Support multiple agents running concurrently with configurable routing, cross-agent communication, and orchestration patterns.

### What we build

**Agent router** (`packages/orchestrator`) — resolves which agent handles an incoming message using a priority-based binding cascade:

```typescript
class AgentRouter {
  resolve(message: IncomingMessage, bindings: Binding[]): string {
    // Evaluate bindings in priority order (highest specificity first)
    // 1. Exact peer/channel ID match
    // 2. Channel-type match (e.g., all Slack DMs)
    // 3. Account/team-level match
    // 4. Default agent fallback
    for (const binding of sortedBindings) {
      if (matches(message, binding)) return binding.agentId;
    }
    return getDefaultAgent();
  }
}
```

Bindings are defined in `config.bindings[]`, each specifying match criteria (`peer`, `channel`, `team`, `account`) and a target `agentId`. Match fields use AND logic (all specified fields must match). First match wins within the same specificity tier.

**Per-agent isolation** — each agent gets a fully isolated runtime:
- Workspace: `~/.agentic-os/agents/{agentId}/workspace/`
- Sessions: `~/.agentic-os/agents/{agentId}/sessions/`
- Memory: separate SQLite database per agent (episodic store with FTS5 + sqlite-vec).
- Config overrides: `agents.list[].{tools, models, sandbox, skills}` override global defaults.

**Cross-agent communication tools** — two tools, disabled by default, enabled per-agent in config:

`agent_spawn` — delegate a task to another agent:
```typescript
// The parent creates a sub-session on the child agent
{
  name: "agent_spawn",
  inputSchema: {
    targetAgent: "string",    // Agent ID to delegate to
    task: "string",           // Task description
    context: "string?",       // Optional context to pass
    timeout: "number?"        // Max seconds to wait (default: 120)
  }
}
```
Execution: create a temporary session on the target agent, inject the task as a user message, run the agent loop, return the final response to the caller. The child runs in its own context window with a `minimal` system prompt.

`agent_send` — direct message another agent:
```typescript
{
  name: "agent_send",
  inputSchema: {
    targetAgent: "string",
    message: "string",
    waitForReply: "boolean?",        // Default: true
    maxExchanges: "number?"          // Max ping-pong turns (default: 5)
  }
}
```
Execution: publish a message to `agent.{targetId}.inbox` via the gateway. If `waitForReply`, use NATS request/reply with correlation ID. For multi-turn exchanges, loop up to `maxExchanges` turns.

**Scheduling** — the `AgentScheduler` manages concurrent agent execution:
- Configurable concurrency limit (`config.gateway.maxConcurrentAgents`, default: 5).
- Ready queue: agents waiting for dispatch, ordered by priority then arrival time.
- When a RUNNING agent completes or suspends, the scheduler pops the next READY agent.
- Priority assignment: user-initiated tasks get priority 1 (highest), cross-agent delegations get priority 2, cron/background tasks get priority 3.

**Orchestration patterns via plugins** — ship three built-in orchestration plugins (all optional, composable):

1. **Supervisor plugin**: registers an `orchestrate` tool that accepts a task description and a list of worker agent IDs. The supervisor agent decides how to decompose the task, delegates via `agent_spawn`, and synthesizes results.
2. **Pipeline plugin**: defines a sequential chain of agents in config. Each agent's output becomes the next agent's input. Implemented as a `pipeline_execute` tool.
3. **Broadcast plugin**: registers a `broadcast` tool that sends a message to all agents matching a tag, collects responses, and returns the aggregate.

### How to verify
- Routing: configure two agents bound to different channels. Send messages to each channel; verify correct agent handles each.
- Isolation: two agents running concurrently don't see each other's workspace files or memory.
- `agent_spawn`: Agent A spawns a task on Agent B; verify B processes it and A receives the result.
- `agent_send`: Agent A sends a message to Agent B with `waitForReply: true`; verify the two-turn exchange completes.
- Scheduling: start 10 tasks with concurrency limit 3; verify only 3 run simultaneously, others queue in order.
- Supervisor: configure a supervisor with 2 workers, send a multi-part task, verify decomposition and synthesis.

---

## Phase 7 — Observability & Security Hardening (Week 24–26)

### Goal
Instrument the entire system for production visibility, and harden security across all layers.

### What we build

**OpenTelemetry integration** — instrument every component with the OTel Node.js SDK:

- **Traces**: create spans at each major boundary:
  - `gateway.route` — from message receipt to agent dispatch.
  - `agent.invoke` — wraps the full agent loop execution.
  - `agent.llm_call` — each LLM completion, with attributes: `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reason`.
  - `agent.tool_execute` — each tool invocation, with `gen_ai.tool.name` and `duration_ms`.
  - `memory.search` — each memory retrieval, with `memory.store_type` and `result_count`.
- **Cross-agent trace propagation**: inject W3C `traceparent` into `AgentMessage.traceContext` on publish. Extract on consume to create child spans. This gives end-to-end traces across multi-agent workflows.
- **Metrics** (via OTel Metrics SDK):
  - `agent.llm.latency` — histogram by model, p50/p95/p99.
  - `agent.llm.tokens` — counter by model, token type (input/output).
  - `agent.llm.cost` — counter by agent, model (USD).
  - `agent.tool.duration` — histogram by tool name.
  - `agent.tool.errors` — counter by tool name, error type.
  - `gateway.message.throughput` — counter by subject pattern.
  - `gateway.dlq.depth` — gauge.
- **Export**: OTel Collector sidecar routing traces to Jaeger/Tempo, metrics to Prometheus, logs to Loki.

**Append-only audit log** — every state-changing event writes to an immutable event store:

```typescript
interface AuditEvent {
  eventId: string;          // UUIDv7
  eventType: string;        // e.g., "agent.tool.executed"
  sequenceNumber: number;   // Monotonic per source
  timestamp: string;
  traceId?: string;
  spanId?: string;
  actor: { type: "agent" | "user" | "system"; id: string };
  data: Record<string, unknown>;
  checksum: string;         // SHA-256(prev_checksum + JSON(this_event))
}
```

Storage: PostgreSQL table with triggers preventing UPDATE and DELETE. Chained checksums provide tamper evidence. Key event types: `agent.llm.called`, `agent.tool.executed`, `agent.tool.blocked`, `agent.state.changed`, `security.command.blocked`, `security.access.denied`, `config.changed`.

**Security hardening:**

1. **Shell command security** — the bash tool's risk classifier and argument sanitization were implemented in Phase 4. In this phase, harden with additional layers:
   - Regex-based pattern matching for obfuscated dangerous commands (e.g., base64-encoded payloads, hex-escaped characters).
   - Environment variable injection prevention: reject commands that set sensitive env vars (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `PATH` overrides).
   - Allowlist mode: optionally restrict agents to a pre-approved set of commands rather than relying solely on the deny-based classifier.

2. **Access control** — implement a Policy Decision Point (PDP):
   - Agent identity carries: `agentId`, `ownerId`, `roles[]`, `scopes[]`, session JWT.
   - Tool-level permissions: each tool definition includes `requiredScopes[]`. The PDP checks `agent.scopes ⊇ tool.requiredScopes` before execution.
   - Delegation chain: when Agent A spawns Agent B, B's JWT includes a `delegation_chain` field and B's scopes are constrained to the intersection of A's allowed scopes and B's configured scopes (narrowing only).

3. **Secrets management** — secrets from config are loaded into memory only, never passed as environment variables to sandboxed containers. API keys for LLM providers are resolved at the `LLMService` layer, never exposed to agent code. Sandboxed tools that need credentials use a `secrets_proxy` that injects auth headers server-side.

4. **Sandbox hardening** — upgrade the Docker sandbox with:
   - Seccomp profile: custom profile extending Docker's default, additionally blocking `ptrace`, `process_vm_readv/writev`, `personality`.
   - No capability escalation: `--security-opt=no-new-privileges`.
   - Filesystem: read-only root, writable workspace only, `/tmp` as noexec tmpfs.
   - Resource limits: PID limit (256), ulimit for open files (1024), 30-second hard timeout via `timeout` command.

### How to verify
- Trace: send a message through the gateway → agent → LLM → tool → response. Verify a complete trace with all spans appears in Jaeger.
- Cross-agent trace: Agent A spawns Agent B; verify both appear as child spans under the same trace.
- Metrics: generate load; verify histograms and counters appear in Prometheus.
- Audit: execute 10 tool calls; verify 10 events in PostgreSQL with valid chained checksums. Attempt UPDATE; verify trigger rejection.
- Shell security hardening: attempt obfuscated dangerous command (e.g., base64-encoded `rm -rf /`); verify blocked. Attempt `LD_PRELOAD=/evil.so ls`; verify env injection blocked. Enable allowlist mode; verify unlisted commands are rejected.
- Delegation: Agent A (scopes: `["bash", "read", "write"]`) spawns Agent B (configured scopes: `["bash", "web"]`). Verify B's effective scopes are `["bash"]` (intersection).

---

## Phase 8 — Integration Testing & Developer Experience (Week 27–28)

### Goal
End-to-end integration tests, a CLI for operators, and documentation that makes the system usable.

### What we build

**CLI tool** (`agentic-os`) for system management:

```bash
agentic-os init                    # Scaffold config + directories
agentic-os start                   # Launch gateway + all agents
agentic-os stop                    # Graceful shutdown
agentic-os status                  # Show agent states, queue depths, health
agentic-os agent list              # List registered agents
agentic-os agent create <name>     # Scaffold a new agent
agentic-os plugin install <path>   # Install a plugin
agentic-os skill add <path>        # Add a skill
agentic-os config validate         # Validate configuration
agentic-os logs <agentId>          # Tail agent logs
agentic-os replay <sessionId>      # Replay a session from audit log
```

**Docker Compose stack** — single `docker-compose.yml` that launches:
- NATS server (with JetStream enabled)
- Redis
- PostgreSQL (audit log)
- The gateway process
- OTel Collector → Jaeger + Prometheus + Grafana

One `docker compose up` gets the entire system running.

**End-to-end test suite:**
- **Scenario 1 — Single agent conversation**: send 5 messages to an agent via WebSocket, verify coherent responses, verify session JSONL file is correct.
- **Scenario 2 — Tool execution**: ask an agent to create a file, verify the file exists in the workspace, verify the tool execution audit event.
- **Scenario 3 — Memory persistence**: have a conversation, terminate the session, start a new session, ask about the previous conversation, verify memory retrieval surfaces the relevant context.
- **Scenario 4 — Multi-agent delegation**: configure a supervisor + worker, send a task to the supervisor, verify it delegates and synthesizes correctly.
- **Scenario 5 — Plugin hot-reload**: start the system, add a plugin that registers a new tool, verify the tool is usable without restart.
- **Scenario 6 — Security**: attempt a CRITICAL shell command; verify it's blocked, logged in audit, and an OTel span records the denial.
- **Scenario 7 — Resilience**: kill the NATS server, verify the circuit breaker activates, restart NATS, verify messages drain and processing resumes.

**Documentation:**
- `README.md` — quickstart (clone → configure → `docker compose up` → chat).
- `docs/architecture.md` — this HLD distilled into a living doc.
- `docs/configuration.md` — annotated config reference.
- `docs/plugin-guide.md` — how to write and publish plugins.
- `docs/skill-guide.md` — how to create skills.
- Per-package `README.md` files with API reference.

### How to verify
- All 7 E2E scenarios pass in CI.
- `docker compose up` from a clean checkout reaches healthy state in <60 seconds.
- CLI commands complete without errors on a running system.

---

## Timeline Summary

| Phase | Focus | Weeks | Cumulative |
|-------|-------|-------|------------|
| 0 | Scaffold & Contracts | 1–2 | 2 weeks |
| 1 | Messaging Gateway | 3–5 | 5 weeks |
| 2 | Agent Runtime | 6–9 | 9 weeks |
| 3 | Memory Subsystem | 10–13 | 13 weeks |
| 4 | Tool System & Sandbox | 14–17 | 17 weeks |
| 5 | Plugins & Skills | 18–20 | 20 weeks |
| 6 | Multi-Agent Orchestration | 21–23 | 23 weeks |
| 7 | Observability & Security | 24–26 | 26 weeks |
| 8 | Integration & DX | 27–28 | **28 weeks** |

Each phase produces a testable, working system. Phase 1-2 gives you a single agent talking through the gateway. Phase 3 adds memory. Phase 4 adds tools. Phase 5 makes it extensible. Phase 6 makes it multi-agent. Phase 7 makes it production-grade. Phase 8 makes it usable by others.
