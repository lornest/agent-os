// Error classes
export {
  PluginLoadError,
  PluginDependencyError,
  CyclicDependencyError,
  SkillGatingError,
} from './errors.js';

// Internal types
export type {
  DiscoveredPlugin,
  LoadedPlugin,
  PluginLoaderCallbacks,
  PluginLoaderOptions,
  SkillDiscoveryOptions,
  FileWatcherOptions,
} from './types.js';

// Dependency resolver
export { resolveDependencyOrder } from './dependency-resolver.js';

// Service registry
export { ServiceRegistry } from './service-registry.js';

// Command registry
export { CommandRegistry } from './command-registry.js';

// Plugin context
export { createPluginContext } from './plugin-context-impl.js';
export type { PluginContextResult } from './plugin-context-impl.js';

// Plugin discovery
export { discoverPlugins } from './plugin-discovery.js';

// Plugin loader
export { PluginLoader } from './plugin-loader.js';

// Skill parser
export { parseSkillFile, extractFrontmatter } from './skill-parser.js';

// Skill gating
export {
  checkSkillRequirements,
  filterAvailableSkills,
  isBinaryAvailable,
  isEnvVarSet,
} from './skill-gating.js';
export type { SkillCheckResult } from './skill-gating.js';

// Skill discovery
export { discoverSkills, mergeSkillSources } from './skill-discovery.js';

// File watcher
export { FileWatcher } from './file-watcher.js';
