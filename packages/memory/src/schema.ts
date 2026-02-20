/** SQL DDL for the episodic memory store. */

export const CREATE_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  token_count INTEGER NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'conversation',
  chunk_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  CHECK (importance >= 0.0 AND importance <= 1.0)
);
`;

export const CREATE_CHUNKS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_chunks_agent_id ON chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_chunks_session_id ON chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_importance ON chunks(importance);
CREATE INDEX IF NOT EXISTS idx_chunks_source_type ON chunks(source_type);
`;

export const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, content='chunks', content_rowid='rowid');
`;

export const CREATE_FTS_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
`;

/** Create the vec0 table. Dimensions must be substituted at runtime. */
export function createVecTable(dimensions: number): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[${dimensions}]);`;
}

export const CREATE_SCHEMA_META = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const ENABLE_WAL = 'PRAGMA journal_mode=WAL;';
export const SET_BUSY_TIMEOUT = 'PRAGMA busy_timeout=5000;';
