import * as path from 'node:path';
import type { AgentEntry, LLMProvider } from '@agentic-os/core';
import { bootstrap } from '../../../src/bootstrap.js';
import type { AppServer } from '../../../src/bootstrap.js';
import {
  createTempDir,
  cleanupTempDir,
  createNodeFs,
  createTestLogger,
  writeTestConfig,
} from './fixtures.js';
import { MockLLMProvider } from './mock-llm.js';
import type { MockResponse } from './mock-llm.js';
import { WsTestClient } from './ws-client.js';

interface AppHarnessOptions {
  /** Responses the mock LLM will produce, in order. */
  mockResponses?: MockResponse[];
  /** Override agent entries. */
  agents?: AgentEntry[];
  /** Tools to deny. */
  toolsDeny?: string[];
  /** Whether to enable memory. Default: true */
  memoryEnabled?: boolean;
  /** Custom LLM provider (overrides mockResponses). */
  llmProvider?: LLMProvider;
}

/**
 * Test harness that boots the full app stack with mock LLM
 * and provides a WS client for testing.
 *
 * Requires NATS and Redis to be running on localhost.
 */
export class AppHarness {
  private tempDir: string | null = null;
  private app: AppServer | null = null;
  private wsClient: WsTestClient | null = null;
  private mockProvider: MockLLMProvider | null = null;

  async start(options: AppHarnessOptions = {}): Promise<void> {
    const {
      mockResponses = [{ text: 'Hello from mock agent!' }],
      agents,
      toolsDeny,
      memoryEnabled = true,
      llmProvider,
    } = options;

    this.tempDir = await createTempDir();
    const basePath = path.join(this.tempDir, 'data');

    // Use a random high port to avoid conflicts
    const port = 18800 + Math.floor(Math.random() * 200);

    const configPath = await writeTestConfig(this.tempDir, {
      port,
      agents,
      toolsDeny,
      memoryEnabled,
    });

    if (llmProvider) {
      this.mockProvider = null;
    } else {
      this.mockProvider = new MockLLMProvider(mockResponses);
    }

    const provider = llmProvider ?? this.mockProvider!;

    this.app = await bootstrap({
      configPath,
      basePath,
      fs: createNodeFs(),
      logger: createTestLogger(),
      llmProviders: [provider],
    });

    // Connect WS client
    this.wsClient = new WsTestClient();
    await this.wsClient.connect({ port, timeout: 5000 });
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      await this.wsClient.disconnect();
      this.wsClient = null;
    }
    if (this.app) {
      await this.app.shutdown();
      this.app = null;
    }
    if (this.tempDir) {
      await cleanupTempDir(this.tempDir);
      this.tempDir = null;
    }
  }

  get client(): WsTestClient {
    if (!this.wsClient) throw new Error('Harness not started');
    return this.wsClient;
  }

  get server(): AppServer {
    if (!this.app) throw new Error('Harness not started');
    return this.app;
  }

  get mock(): MockLLMProvider {
    if (!this.mockProvider) throw new Error('No mock provider');
    return this.mockProvider;
  }

  get basePath(): string {
    if (!this.tempDir) throw new Error('Harness not started');
    return path.join(this.tempDir, 'data');
  }
}
