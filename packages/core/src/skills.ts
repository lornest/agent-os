/** Metadata for skill requirement gating. */
export interface SkillMetadata {
  requiredBinaries?: string[];
  requiredEnvVars?: string[];
  osPlatforms?: string[]; // e.g., ['darwin', 'linux']
}

/** A discovered skill entry from a SKILL.md file. */
export interface SkillEntry {
  name: string;
  description: string;
  filePath: string; // absolute path to SKILL.md
  metadata: SkillMetadata;
}

/** Configuration for the skills subsystem. */
export interface SkillsConfig {
  directories: string[];
  enabled: string[];
  disabled: string[];
}
