/** Thrown when a plugin fails to load. */
export class PluginLoadError extends Error {
  constructor(pluginName: string, cause?: Error) {
    super(`Failed to load plugin "${pluginName}"${cause ? `: ${cause.message}` : ''}`);
    this.name = 'PluginLoadError';
    this.cause = cause;
  }
}

/** Thrown when a plugin dependency is unsatisfied. */
export class PluginDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginDependencyError';
  }
}

/** Thrown when a circular dependency is detected among plugins. */
export class CyclicDependencyError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
    this.cycle = cycle;
  }
}

/** Thrown when a skill's requirements are not met. */
export class SkillGatingError extends Error {
  readonly skillName: string;
  readonly reason: string;

  constructor(skillName: string, reason: string) {
    super(`Skill "${skillName}" unavailable: ${reason}`);
    this.name = 'SkillGatingError';
    this.skillName = skillName;
    this.reason = reason;
  }
}
