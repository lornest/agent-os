/** Prompt mode controls how much enrichment is added to the system prompt. */
export type PromptMode = 'full' | 'minimal' | 'none';

/** Runtime metadata injected into the system prompt. */
export interface RuntimeInfo {
  os: string;
  model: string;
  timezone: string;
  repoRoot: string;
  agentId: string;
  agentName: string;
}

/** Configuration for loading bootstrap workspace files. */
export interface BootstrapConfig {
  fileNames: string[];
  maxCharsPerFile: number;
  maxTotalChars: number;
}

/** A loaded bootstrap file with optional truncation metadata. */
export interface BootstrapFile {
  name: string;
  content: string;
  originalLength: number;
  truncated: boolean;
}

/** Priority levels for prompt enrichment handlers. */
export interface PromptPriorities {
  persona: number;
  tools: number;
  skills: number;
  runtime: number;
  bootstrap: number;
}

/** Full configuration for the prompt assembler. */
export interface PromptAssemblerConfig {
  promptMode: PromptMode;
  bootstrap: BootstrapConfig;
  priorities?: Partial<PromptPriorities>;
}

export const DEFAULT_PROMPT_PRIORITIES: PromptPriorities = {
  persona: 10,
  tools: 20,
  skills: 30,
  runtime: 40,
  bootstrap: 50,
};

export const DEFAULT_BOOTSTRAP_FILES = [
  'SOUL.md',
  'IDENTITY.md',
  'AGENTS.md',
  'TOOLS.md',
  'USER.md',
  'MEMORY.md',
];

export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  fileNames: DEFAULT_BOOTSTRAP_FILES,
  maxCharsPerFile: 20_000,
  maxTotalChars: 150_000,
};
