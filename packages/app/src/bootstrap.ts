import type {
  AgenticOsConfig,
  LLMProvider,
  Logger,
} from '@agentic-os/core';
import { loadConfig } from '@agentic-os/core';
import { GatewayServer } from '@agentic-os/gateway';
import { ChannelManager, WebChatAdaptor } from '@agentic-os/channels';
import type { FileSystem, LLMServiceOptions } from '@agentic-os/agent-runtime';
import { wireAgent } from './agent-wiring.js';
import type { WiredAgent } from './agent-wiring.js';

export interface BootstrapOptions {
  configPath: string;
  basePath: string;
  fs: FileSystem;
  logger: Logger;
  /** Override LLM providers (e.g. for testing with a mock). */
  llmProviders?: LLMProvider[];
}

export interface AppServer {
  gateway: GatewayServer;
  channelManager: ChannelManager;
  agents: Map<string, WiredAgent>;
  config: AgenticOsConfig;
  shutdown: () => Promise<void>;
}

/**
 * Bootstrap the entire application:
 * 1. Load and validate config
 * 2. Start gateway (NATS + Redis + WebSocket)
 * 3. Wire each configured agent with tools, memory, plugins, skills
 * 4. Return an AppServer handle for lifecycle management
 */
export async function bootstrap(options: BootstrapOptions): Promise<AppServer> {
  const { configPath, basePath, fs, logger, llmProviders } = options;

  // 1. Load config
  const result = loadConfig(configPath);
  if (!result.valid || !result.config) {
    const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`Invalid configuration: ${errorMessages}`);
  }
  const config = result.config;

  // 2. Start gateway
  const gateway = new GatewayServer(config.gateway);
  await gateway.start();
  logger.info('Gateway started');

  // 3. Wire agents
  const agents = new Map<string, WiredAgent>();

  const llmServiceOptions: LLMServiceOptions = {
    providers: llmProviders ?? [],
    models: config.models,
    auth: config.auth,
  };

  for (const agentEntry of config.agents.list) {
    try {
      const wired = await wireAgent({
        agentEntry,
        defaults: config.agents.defaults,
        basePath,
        fs,
        llmServiceOptions,
        toolsConfig: config.tools,
        sandboxConfig: config.sandbox,
        memoryConfig: config.memory,
        pluginsConfig: config.plugins,
        skillsConfig: config.skills,
        gateway,
        logger,
      });
      agents.set(agentEntry.id, wired);
    } catch (err) {
      logger.error(
        `Failed to wire agent "${agentEntry.id}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  logger.info(`${agents.size} agent(s) wired and ready`);

  // 4. Wire channel adaptors
  const channelsConfig = config.channels ?? { adaptors: {} };
  const channelManager = new ChannelManager({
    gateway,
    bindings: config.bindings,
    channelsConfig,
    logger,
  });

  channelManager.register(new WebChatAdaptor());
  await channelManager.startAll();
  logger.info('Channel adaptors started');

  // 5. Build shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down...');
    await channelManager.stopAll();
    logger.info('Channel adaptors stopped');
    for (const [id, wired] of agents) {
      try {
        await wired.cleanup();
        logger.info(`Agent "${id}" shut down`);
      } catch (err) {
        logger.error(
          `Error shutting down agent "${id}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await gateway.stop();
    logger.info('Gateway stopped');
  };

  return { gateway, channelManager, agents, config, shutdown };
}
