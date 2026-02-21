import type { AgentRegistry, AgentRegistryEntry } from './agent-registry.js';
import type { RemoteDispatchTransport } from './remote-dispatch.js';
import { RemoteAgentRegistryEntry } from './remote-dispatch.js';

export interface FederatedAgentRegistryOptions {
  localRegistry: AgentRegistry;
  transport: RemoteDispatchTransport;
  remoteTimeoutMs?: number;
}

/**
 * Wraps a local `AgentRegistry` with transparent remote fallback.
 *
 * When `get(agentId)` finds no local entry it returns a
 * `RemoteAgentRegistryEntry` that dispatches via NATS.  The 5
 * orchestration tools call `registry.get().dispatch()` unchanged —
 * zero tool-code changes required.
 *
 * `has()`, `getAll()`, and `getAvailable()` remain local-only so
 * existing error paths and diagnostics are preserved.
 */
export class FederatedAgentRegistry implements AgentRegistry {
  private readonly local: AgentRegistry;
  private readonly transport: RemoteDispatchTransport;
  private readonly remoteTimeoutMs: number | undefined;
  private readonly remoteCache = new Map<string, AgentRegistryEntry>();

  constructor(opts: FederatedAgentRegistryOptions) {
    this.local = opts.localRegistry;
    this.transport = opts.transport;
    this.remoteTimeoutMs = opts.remoteTimeoutMs;
  }

  /** Local first, then remote fallback (cached). */
  get(agentId: string): AgentRegistryEntry | undefined {
    const local = this.local.get(agentId);
    if (local) return local;

    let remote = this.remoteCache.get(agentId);
    if (!remote) {
      remote = new RemoteAgentRegistryEntry({
        agentId,
        transport: this.transport,
        timeoutMs: this.remoteTimeoutMs,
      });
      this.remoteCache.set(agentId, remote);
    }
    return remote;
  }

  /** Local only — preserves existing error behavior for diagnostics. */
  has(agentId: string): boolean {
    return this.local.has(agentId);
  }

  /** Local only. */
  getAll(): AgentRegistryEntry[] {
    return this.local.getAll();
  }

  /** Local only. */
  getAvailable(): AgentRegistryEntry[] {
    return this.local.getAvailable();
  }
}
