import type { RuntimeInfo } from './prompt-types.js';
import { section } from './prompt-section-builder.js';

export interface CollectRuntimeInfoParams {
  model: string;
  repoRoot: string;
  agentId: string;
  agentName: string;
}

/** Collects runtime metadata. Timezone is a static string for cache stability. */
export function collectRuntimeInfo(params: CollectRuntimeInfoParams): RuntimeInfo {
  return {
    os: process.platform,
    model: params.model,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    repoRoot: params.repoRoot,
    agentId: params.agentId,
    agentName: params.agentName,
  };
}

/** Formats RuntimeInfo as an XML `<runtime-info>` section. */
export function formatRuntimeInfo(info: RuntimeInfo): string {
  const lines = [
    `os: ${info.os}`,
    `model: ${info.model}`,
    `timezone: ${info.timezone}`,
    `repo-root: ${info.repoRoot}`,
    `agent-id: ${info.agentId}`,
    `agent-name: ${info.agentName}`,
  ];
  return section('runtime-info', lines.join('\n'));
}
