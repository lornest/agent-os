import { describe, it, expect } from 'vitest';
import { parseSkillFile, extractFrontmatter } from '../src/skill-parser.js';

describe('extractFrontmatter', () => {
  it('extracts YAML frontmatter from markdown', () => {
    const content = `---
name: commit
description: Git commit helper
---
# Commit Skill
Some content here.`;
    const fm = extractFrontmatter(content);
    expect(fm['name']).toBe('commit');
    expect(fm['description']).toBe('Git commit helper');
  });

  it('returns empty object when no frontmatter', () => {
    const content = '# No Frontmatter\nJust content.';
    expect(extractFrontmatter(content)).toEqual({});
  });

  it('returns empty object for invalid YAML', () => {
    const content = `---
invalid: [unclosed
---
Content`;
    expect(extractFrontmatter(content)).toEqual({});
  });

  it('returns empty object for non-object YAML', () => {
    const content = `---
- just a list
---
Content`;
    expect(extractFrontmatter(content)).toEqual({});
  });
});

describe('parseSkillFile', () => {
  it('parses full frontmatter into SkillEntry', () => {
    const content = `---
name: commit
description: Git commit helper
requiredBinaries:
  - git
requiredEnvVars:
  - GIT_AUTHOR_NAME
osPlatforms:
  - darwin
  - linux
---
# Commit Skill`;

    const entry = parseSkillFile(content, '/skills/commit/SKILL.md');
    expect(entry.name).toBe('commit');
    expect(entry.description).toBe('Git commit helper');
    expect(entry.filePath).toBe('/skills/commit/SKILL.md');
    expect(entry.metadata.requiredBinaries).toEqual(['git']);
    expect(entry.metadata.requiredEnvVars).toEqual(['GIT_AUTHOR_NAME']);
    expect(entry.metadata.osPlatforms).toEqual(['darwin', 'linux']);
  });

  it('falls back to directory name when name is missing', () => {
    const content = `---
description: A skill
---
Content`;
    const entry = parseSkillFile(content, '/skills/my-skill/SKILL.md');
    expect(entry.name).toBe('my-skill');
  });

  it('defaults description to empty string when missing', () => {
    const content = `---
name: test
---
Content`;
    const entry = parseSkillFile(content, '/skills/test/SKILL.md');
    expect(entry.description).toBe('');
  });

  it('handles no frontmatter at all', () => {
    const content = '# Just a markdown file\nNo frontmatter.';
    const entry = parseSkillFile(content, '/skills/bare/SKILL.md');
    expect(entry.name).toBe('bare');
    expect(entry.description).toBe('');
    expect(entry.metadata).toEqual({});
  });

  it('filters non-string values from arrays', () => {
    const content = `---
name: test
requiredBinaries:
  - git
  - 123
  - true
---
Content`;
    const entry = parseSkillFile(content, '/skills/test/SKILL.md');
    expect(entry.metadata.requiredBinaries).toEqual(['git']);
  });

  it('does not include metadata fields when not present in frontmatter', () => {
    const content = `---
name: minimal
description: A minimal skill
---
Content`;
    const entry = parseSkillFile(content, '/skills/minimal/SKILL.md');
    expect(entry.metadata.requiredBinaries).toBeUndefined();
    expect(entry.metadata.requiredEnvVars).toBeUndefined();
    expect(entry.metadata.osPlatforms).toBeUndefined();
  });

  it('handles Windows-style line endings', () => {
    const content = '---\r\nname: test\r\ndescription: A test\r\n---\r\nContent';
    const entry = parseSkillFile(content, '/skills/test/SKILL.md');
    expect(entry.name).toBe('test');
    expect(entry.description).toBe('A test');
  });
});
