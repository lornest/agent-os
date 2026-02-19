import type {
  AgentControlBlock,
  AgentEvent,
  AgentSnapshot,
  AgentStatus,
  Message,
  ToolDefinition,
} from '@agentic-os/core';
import { now } from '@agentic-os/core';
import type { NatsClient, Subscription } from '@agentic-os/gateway';
import { agentLoop } from './agent-loop.js';
import { ContextCompactor } from './context-compactor.js';
import { ConversationContext } from './conversation-context.js';
import { InvalidStateTransitionError } from './errors.js';
import { HookRegistry } from './hook-registry.js';
import { LLMService } from './llm-service.js';
import { SessionStore } from './session-store.js';
import type { ToolHandlerMap } from './tool-executor.js';
import type { AgentManagerOptions, FileSystem } from './types.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  REGISTERED: ['INITIALIZING'],
  INITIALIZING: ['READY'],
  READY: ['RUNNING', 'SUSPENDED', 'TERMINATED'],
  RUNNING: ['READY', 'SUSPENDED', 'TERMINATED', 'ERROR'],
  SUSPENDED: ['READY', 'TERMINATED'],
  ERROR: ['TERMINATED', 'INITIALIZING'],
  TERMINATED: [],
};

export class AgentManager {
  readonly agentId: string;
  private status: AgentStatus = 'REGISTERED' as AgentStatus;
  private llm: LLMService | null = null;
  private hooks = new HookRegistry();
  private sessionStore: SessionStore;
  private compactor: ContextCompactor | null = null;
  private tools: ToolDefinition[] = [];
  private toolHandlers: ToolHandlerMap = new Map();
  private context: ConversationContext | null = null;
  private currentSessionId: string | null = null;
  private loopIteration = 0;
  private inboxSubscription: Subscription | null = null;
  private persona = '';
  private fs: FileSystem;
  private basePath: string;
  private defaults: AgentManagerOptions['defaults'];
  private agentEntry: AgentManagerOptions['agentEntry'];

  constructor(options: AgentManagerOptions) {
    this.agentId = options.agentEntry.id;
    this.agentEntry = options.agentEntry;
    this.defaults = options.defaults;
    this.basePath = options.basePath;
    this.fs = options.fs;
    this.sessionStore = new SessionStore(
      `${options.basePath}/sessions`,
      options.fs,
    );
  }

  async init(llmService: LLMService): Promise<void> {
    this.transition('INITIALIZING' as AgentStatus);
    this.llm = llmService;

    // Create workspace directories
    const agentDir = `${this.basePath}/agents/${this.agentId}`;
    const snapshotsDir = `${agentDir}/snapshots`;
    await this.fs.mkdir(agentDir, { recursive: true });
    await this.fs.mkdir(snapshotsDir, { recursive: true });

    // Load persona
    const soulPath = `${agentDir}/SOUL.md`;
    if (await this.fs.exists(soulPath)) {
      this.persona = await this.fs.readFile(soulPath);
    } else {
      this.persona =
        this.agentEntry.persona ??
        `You are ${this.agentEntry.name}. ${this.agentEntry.description ?? ''}`;
    }

    // Set up compactor
    this.compactor = new ContextCompactor({
      contextWindow: this.defaults.contextWindow,
      reserveTokens: this.defaults.reserveTokens,
    });

    this.transition('READY' as AgentStatus);
  }

  setTools(tools: ToolDefinition[], handlers: ToolHandlerMap): void {
    this.tools = tools;
    this.toolHandlers = handlers;
  }

  async *dispatch(
    userMessage: string,
    sessionId?: string,
  ): AsyncGenerator<AgentEvent> {
    this.transition('RUNNING' as AgentStatus);

    try {
      const llm = this.llm!;

      // Create or resume session
      if (!sessionId) {
        sessionId = await this.sessionStore.createSession(this.agentId);
      }
      this.currentSessionId = sessionId;
      llm.bindSession(sessionId);

      // Build or restore context
      if (!this.context) {
        const history = await this.sessionStore.getHistory(
          this.agentId,
          sessionId,
        );
        this.context = new ConversationContext({
          agentId: this.agentId,
          sessionId,
          systemPrompt: this.persona,
          messages: history.length > 0 ? history : undefined,
        });
      }

      this.context.addUserMessage(userMessage);
      await this.sessionStore.appendEntry(this.agentId, sessionId, {
        role: 'user',
        content: userMessage,
      });

      // Check compaction
      if (this.compactor && (await this.compactor.needsCompaction(this.context, llm))) {
        await this.compactor.compact(this.context, llm, this.hooks);
      }

      // Run agent loop
      for await (const event of agentLoop(
        llm,
        this.context,
        this.tools,
        this.toolHandlers,
        this.hooks,
        { maxTurns: this.defaults.maxTurns },
      )) {
        this.loopIteration++;

        // Persist events to session JSONL
        if (event.type === 'assistant_message') {
          const msg: Message = {
            role: 'assistant',
            content: event.content.text,
            toolCalls: event.content.toolCalls,
          };
          await this.sessionStore.appendEntry(this.agentId, sessionId, msg);
        } else if (event.type === 'tool_result') {
          await this.sessionStore.appendEntry(this.agentId, sessionId, {
            role: 'tool',
            content: JSON.stringify(event.result),
          });
        }

        yield event;
      }

      llm.unbindSession();
      this.transition('READY' as AgentStatus);
    } catch (err) {
      this.status = 'ERROR' as AgentStatus;
      throw err;
    }
  }

  async suspend(): Promise<void> {
    this.transition('SUSPENDED' as AgentStatus);

    if (this.context && this.currentSessionId) {
      const snapshot: AgentSnapshot = {
        agentId: this.agentId,
        sessionId: this.currentSessionId,
        messages: this.context.getMessages(),
        loopIteration: this.loopIteration,
        pendingToolCalls: [],
        savedAt: now(),
      };

      const snapshotPath = `${this.basePath}/agents/${this.agentId}/snapshots/${this.currentSessionId}.json`;
      await this.fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
    }
  }

  async resume(): Promise<void> {
    if (this.status !== ('SUSPENDED' as AgentStatus)) {
      throw new InvalidStateTransitionError(this.status, 'READY');
    }

    if (this.currentSessionId) {
      const snapshotPath = `${this.basePath}/agents/${this.agentId}/snapshots/${this.currentSessionId}.json`;
      if (await this.fs.exists(snapshotPath)) {
        const raw = await this.fs.readFile(snapshotPath);
        const snapshot = JSON.parse(raw) as AgentSnapshot;
        this.context = new ConversationContext({
          agentId: this.agentId,
          sessionId: snapshot.sessionId,
          systemPrompt: this.persona,
          messages: snapshot.messages,
        });
        this.loopIteration = snapshot.loopIteration;
      }
    }

    this.status = 'READY' as AgentStatus;
  }

  async terminate(): Promise<void> {
    if (this.inboxSubscription) {
      this.inboxSubscription.unsubscribe();
      this.inboxSubscription = null;
    }
    this.transition('TERMINATED' as AgentStatus);
  }

  async subscribeToInbox(nats: NatsClient): Promise<void> {
    const subject = `agent.${this.agentId}.inbox`;
    this.inboxSubscription = await nats.subscribe(subject, async (_msg) => {
      // Message handling delegated to dispatch
    });
  }

  getControlBlock(): AgentControlBlock {
    return {
      agentId: this.agentId,
      status: this.status,
      priority: 0,
      loopIteration: this.loopIteration,
      tokenUsage: this.llm?.getSessionTokenUsage() ?? {
        input: 0,
        output: 0,
        total: 0,
      },
      snapshotRef: this.currentSessionId
        ? `${this.basePath}/agents/${this.agentId}/snapshots/${this.currentSessionId}.json`
        : undefined,
      createdAt: now(),
      lastActiveAt: now(),
    };
  }

  getHookRegistry(): HookRegistry {
    return this.hooks;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  private transition(to: AgentStatus): void {
    const allowed = VALID_TRANSITIONS[this.status];
    if (!allowed || !allowed.includes(to)) {
      throw new InvalidStateTransitionError(this.status, to);
    }
    this.status = to;
  }
}
