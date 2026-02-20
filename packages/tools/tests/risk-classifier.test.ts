import { describe, it, expect } from 'vitest';
import { classifyCommandRisk, sanitizeArguments } from '../src/builtin/risk-classifier.js';

describe('classifyCommandRisk', () => {
  // ── GREEN commands ─────────────────────────────────────────────────

  describe('GREEN commands', () => {
    it.each(['ls', 'pwd', 'cat foo.txt', 'echo hello', 'whoami'])(
      'classifies "%s" as green and not blocked',
      (cmd) => {
        const result = classifyCommandRisk(cmd);
        expect(result.level).toBe('green');
        expect(result.blocked).toBe(false);
      },
    );
  });

  // ── YELLOW commands ────────────────────────────────────────────────

  describe('YELLOW commands', () => {
    it.each(['git status', 'npm install', 'node script.js'])(
      'classifies "%s" as yellow and not blocked',
      (cmd) => {
        const result = classifyCommandRisk(cmd);
        expect(result.level).toBe('yellow');
        expect(result.blocked).toBe(false);
      },
    );
  });

  // ── RED commands ───────────────────────────────────────────────────

  describe('RED commands', () => {
    it.each(['rm file.txt', 'curl https://example.com', 'sudo apt-get update'])(
      'classifies "%s" as red and not blocked',
      (cmd) => {
        const result = classifyCommandRisk(cmd);
        expect(result.level).toBe('red');
        expect(result.blocked).toBe(false);
      },
    );
  });

  // ── CRITICAL commands ──────────────────────────────────────────────

  describe('CRITICAL commands', () => {
    it.each(['rm -rf /', 'dd if=/dev/zero of=/dev/sda', 'shutdown now'])(
      'classifies "%s" as critical and blocked',
      (cmd) => {
        const result = classifyCommandRisk(cmd);
        expect(result.level).toBe('critical');
        expect(result.blocked).toBe(true);
      },
    );
  });

  // ── Chain classification ───────────────────────────────────────────

  describe('chain classification', () => {
    it('takes the highest risk in a chain: ls && rm file.txt → red', () => {
      const result = classifyCommandRisk('ls && rm file.txt');
      expect(result.level).toBe('red');
      expect(result.blocked).toBe(false);
    });

    it('takes the highest risk in a pipe: echo hi | rm -rf /', () => {
      const result = classifyCommandRisk('echo hi | rm -rf /');
      expect(result.level).toBe('critical');
      expect(result.blocked).toBe(true);
    });
  });
});

describe('sanitizeArguments', () => {
  // ── Blocked patterns ───────────────────────────────────────────────

  it('blocks shell injection via $()', () => {
    const result = sanitizeArguments('echo $(whoami)');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('$()');
  });

  it('blocks shell injection via backticks', () => {
    const result = sanitizeArguments('echo `whoami`');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('backtick');
  });

  it('blocks LD_PRELOAD injection', () => {
    const result = sanitizeArguments('LD_PRELOAD=hack.so ls');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('LD_PRELOAD');
  });

  it('blocks --upload-pack on git', () => {
    const result = sanitizeArguments('git clone --upload-pack=evil repo');
    expect(result).toBeTypeOf('string');
    expect(result).toContain('--upload-pack');
  });

  // ── Safe commands ──────────────────────────────────────────────────

  it('allows safe commands and returns null', () => {
    const result = sanitizeArguments('ls -la');
    expect(result).toBeNull();
  });
});
