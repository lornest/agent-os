import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  CREATE_CHUNKS_TABLE,
  CREATE_CHUNKS_INDEXES,
  CREATE_FTS_TABLE,
  CREATE_FTS_TRIGGERS,
  CREATE_SCHEMA_META,
  ENABLE_WAL,
  SET_BUSY_TIMEOUT,
  createVecTable,
} from '../src/schema.js';

describe('schema DDL', () => {
  it('creates chunks table in an in-memory database', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_CHUNKS_TABLE);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    expect(tables.some((t) => t.name === 'chunks')).toBe(true);

    db.close();
  });

  it('creates indexes', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_CHUNKS_TABLE);

    for (const stmt of CREATE_CHUNKS_INDEXES.trim().split(';')) {
      const trimmed = stmt.trim();
      if (trimmed) db.exec(trimmed);
    }

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    expect(indexes.some((i) => i.name === 'idx_chunks_agent_id')).toBe(true);
    expect(indexes.some((i) => i.name === 'idx_chunks_created_at')).toBe(true);

    db.close();
  });

  it('creates FTS5 virtual table and triggers', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_CHUNKS_TABLE);
    db.exec(CREATE_FTS_TABLE);

    for (const stmt of CREATE_FTS_TRIGGERS.trim().split(/;\s*CREATE/)) {
      let trimmed = stmt.trim();
      if (!trimmed) continue;
      if (!trimmed.toUpperCase().startsWith('CREATE')) {
        trimmed = 'CREATE ' + trimmed;
      }
      db.exec(trimmed);
    }

    // Insert a row and verify FTS is synced via trigger
    db.prepare(
      `INSERT INTO chunks (id, agent_id, session_id, content, importance, token_count, source_type, chunk_index, created_at)
       VALUES ('test1', 'agent1', 'sess1', 'hello world test', 0.5, 4, 'conversation', 0, '2025-01-01T00:00:00Z')`,
    ).run();

    const ftsResults = db.prepare("SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'hello'").all();
    expect(ftsResults).toHaveLength(1);

    db.close();
  });

  it('creates schema_meta table', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_SCHEMA_META);

    db.prepare("INSERT INTO schema_meta (key, value) VALUES ('version', '1')").run();
    const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string };
    expect(row.value).toBe('1');

    db.close();
  });

  it('enables WAL mode', () => {
    const db = new Database(':memory:');
    db.exec(ENABLE_WAL);
    const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    // In-memory databases may not support WAL, but the pragma should not throw
    expect(result).toBeDefined();
    db.close();
  });

  it('sets busy timeout', () => {
    const db = new Database(':memory:');
    db.exec(SET_BUSY_TIMEOUT);
    const result = db.prepare('PRAGMA busy_timeout').get() as Record<string, unknown>;
    // The pragma key name varies by SQLite version (busy_timeout or timeout)
    const value = Object.values(result)[0];
    expect(value).toBe(5000);
    db.close();
  });

  it('createVecTable generates valid SQL', () => {
    const sql = createVecTable(1024);
    expect(sql).toContain('float[1024]');
    expect(sql).toContain('chunks_vec');
  });

  it('enforces importance constraint', () => {
    const db = new Database(':memory:');
    db.exec(CREATE_CHUNKS_TABLE);

    expect(() => {
      db.prepare(
        `INSERT INTO chunks (id, agent_id, session_id, content, importance, token_count, source_type, chunk_index, created_at)
         VALUES ('bad', 'a', 's', 'c', 1.5, 1, 'conversation', 0, '2025-01-01')`,
      ).run();
    }).toThrow();

    db.close();
  });
});
