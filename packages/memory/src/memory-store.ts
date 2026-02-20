import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { statSync } from 'node:fs';
import { MemoryStoreError } from './errors.js';
import {
  CREATE_CHUNKS_INDEXES,
  CREATE_CHUNKS_TABLE,
  CREATE_FTS_TABLE,
  CREATE_FTS_TRIGGERS,
  CREATE_SCHEMA_META,
  ENABLE_WAL,
  SET_BUSY_TIMEOUT,
  createVecTable,
} from './schema.js';
import type {
  EmbeddingProvider,
  GetOptions,
  MemoryChunk,
  MemoryConfig,
  MemoryStats,
  ScoredCandidate,
  SearchOptions,
  SearchResult,
} from './types.js';
import { hybridRank } from './hybrid-search.js';

interface ChunkRow {
  id: string;
  agent_id: string;
  session_id: string;
  content: string;
  importance: number;
  token_count: number;
  source_type: string;
  chunk_index: number;
  created_at: string;
  metadata: string;
  rowid: number;
}

export class EpisodicMemoryStore {
  private db: Database.Database | null = null;
  private readonly agentId: string;
  private readonly config: MemoryConfig;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly dbPath: string;
  hasVectorSupport = false;

  constructor(options: {
    agentId: string;
    dbPath: string;
    config: MemoryConfig;
    embeddingProvider: EmbeddingProvider;
  }) {
    this.agentId = options.agentId;
    this.config = options.config;
    this.embeddingProvider = options.embeddingProvider;
    this.dbPath = options.dbPath;
  }

  open(): void {
    try {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this.db = new Database(this.dbPath);
    } catch (err) {
      throw new MemoryStoreError(`Failed to open database: ${this.dbPath}`, err);
    }

    const db = this.db;
    db.exec(ENABLE_WAL);
    db.exec(SET_BUSY_TIMEOUT);
    db.exec(CREATE_CHUNKS_TABLE);

    // Execute indexes one at a time
    for (const stmt of CREATE_CHUNKS_INDEXES.trim().split(';')) {
      const trimmed = stmt.trim();
      if (trimmed) db.exec(trimmed);
    }

    db.exec(CREATE_FTS_TABLE);

    // Execute triggers one at a time
    for (const stmt of CREATE_FTS_TRIGGERS.trim().split(/;\s*CREATE/)) {
      let trimmed = stmt.trim();
      if (!trimmed) continue;
      if (!trimmed.toUpperCase().startsWith('CREATE')) {
        trimmed = 'CREATE ' + trimmed;
      }
      db.exec(trimmed);
    }

    db.exec(CREATE_SCHEMA_META);

    // Try loading sqlite-vec
    this.hasVectorSupport = this.loadVecExtension(db);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  upsertChunks(chunks: MemoryChunk[]): void {
    const db = this.getDb();

    const insertChunk = db.prepare(`
      INSERT OR REPLACE INTO chunks (id, agent_id, session_id, content, importance, token_count, source_type, chunk_index, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVec = this.hasVectorSupport
      ? db.prepare('INSERT OR REPLACE INTO chunks_vec (rowid, embedding) VALUES (?, ?)')
      : null;

    const getRowid = db.prepare('SELECT rowid FROM chunks WHERE id = ?');

    const transaction = db.transaction((items: MemoryChunk[]) => {
      for (const chunk of items) {
        insertChunk.run(
          chunk.id,
          chunk.agentId,
          chunk.sessionId,
          chunk.content,
          chunk.importance,
          chunk.tokenCount,
          chunk.sourceType,
          chunk.chunkIndex,
          chunk.createdAt,
          JSON.stringify(chunk.metadata),
        );

        if (insertVec && chunk.embedding && chunk.embedding.length > 0) {
          const row = getRowid.get(chunk.id) as { rowid: number } | undefined;
          if (row) {
            insertVec.run(row.rowid, new Float32Array(chunk.embedding));
          }
        }
      }
    });

    transaction(chunks);
  }

  search(options: SearchOptions): SearchResult[] {
    const db = this.getDb();
    const maxCandidates = (options.maxResults ?? this.config.search.defaultMaxResults) * 4;

    // BM25 search
    const bm25Candidates = this.bm25Search(db, options, maxCandidates);

    // Vector search (if available and we have an embedding)
    let vectorCandidates: ScoredCandidate[] = [];
    if (this.hasVectorSupport && options.embedding && options.embedding.length > 0) {
      vectorCandidates = this.vectorSearch(db, options, maxCandidates);
    }

    // If we only have BM25 results, return them directly with temporal decay
    if (vectorCandidates.length === 0 && bm25Candidates.length > 0) {
      return hybridRank([], bm25Candidates, {
        vectorWeight: 0,
        bm25Weight: 1,
        decayHalfLifeDays: this.config.search.decayHalfLifeDays,
        mmrLambda: this.config.search.mmrLambda,
        maxResults: options.maxResults ?? this.config.search.defaultMaxResults,
      });
    }

    return hybridRank(vectorCandidates, bm25Candidates, {
      vectorWeight: this.config.search.vectorWeight,
      bm25Weight: this.config.search.bm25Weight,
      decayHalfLifeDays: this.config.search.decayHalfLifeDays,
      mmrLambda: this.config.search.mmrLambda,
      maxResults: options.maxResults ?? this.config.search.defaultMaxResults,
    });
  }

  get(options: GetOptions): MemoryChunk[] {
    const db = this.getDb();
    const conditions: string[] = ['agent_id = ?'];
    const params: unknown[] = [options.agentId];

    if (options.id) {
      conditions.push('id = ?');
      params.push(options.id);
    }
    if (options.sessionId) {
      conditions.push('session_id = ?');
      params.push(options.sessionId);
    }
    if (options.date) {
      conditions.push("date(created_at) = date(?)");
      params.push(options.date);
    }

    const limit = options.limit ?? 100;
    const sql = `SELECT * FROM chunks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as ChunkRow[];
    return rows.map(rowToChunk);
  }

  updateImportance(chunkIds: string[], importance: number): void {
    const db = this.getDb();
    const clamped = Math.max(0, Math.min(1, importance));
    const stmt = db.prepare('UPDATE chunks SET importance = ? WHERE id = ?');
    const transaction = db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(clamped, id);
      }
    });
    transaction(chunkIds);
  }

  stats(): MemoryStats {
    const db = this.getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(this.dbPath).size;
    } catch {
      // File might not exist yet
    }
    return {
      chunkCount: row.count,
      dbSizeBytes,
      hasVectorSupport: this.hasVectorSupport,
    };
  }

  private bm25Search(
    db: Database.Database,
    options: SearchOptions,
    maxCandidates: number,
  ): ScoredCandidate[] {
    const conditions: string[] = ['c.agent_id = ?'];
    const params: unknown[] = [options.agentId];

    if (options.minImportance !== undefined) {
      conditions.push('c.importance >= ?');
      params.push(options.minImportance);
    }
    if (options.dateFrom) {
      conditions.push('c.created_at >= ?');
      params.push(options.dateFrom);
    }
    if (options.dateTo) {
      conditions.push('c.created_at <= ?');
      params.push(options.dateTo);
    }
    if (options.sessionId) {
      conditions.push('c.session_id = ?');
      params.push(options.sessionId);
    }
    if (options.sourceTypes && options.sourceTypes.length > 0) {
      const placeholders = options.sourceTypes.map(() => '?').join(', ');
      conditions.push(`c.source_type IN (${placeholders})`);
      params.push(...options.sourceTypes);
    }

    // Escape FTS5 special characters
    const ftsQuery = escapeFts5Query(options.query);
    params.push(ftsQuery, maxCandidates);

    const sql = `
      SELECT c.*, rank
      FROM chunks_fts fts
      JOIN chunks c ON c.rowid = fts.rowid
      WHERE fts.chunks_fts MATCH ?
        AND ${conditions.join(' AND ')}
      ORDER BY rank
      LIMIT ?
    `;

    // FTS query param comes before the condition params — reorder
    const ftsParam = params.pop()!; // limit
    const ftsQueryParam = params.pop()!; // fts query
    const reordered = [ftsQueryParam, ...params, ftsParam];

    try {
      const rows = db.prepare(sql).all(...reordered) as (ChunkRow & { rank: number })[];
      return rows.map((row) => ({
        chunk: rowToChunk(row),
        score: -row.rank, // FTS5 rank is negative (lower = better)
        source: 'bm25' as const,
      }));
    } catch {
      // FTS query might be invalid
      return [];
    }
  }

  private vectorSearch(
    db: Database.Database,
    options: SearchOptions,
    maxCandidates: number,
  ): ScoredCandidate[] {
    if (!options.embedding || options.embedding.length === 0) return [];

    try {
      const vecSql = `
        SELECT rowid, distance
        FROM chunks_vec
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `;
      const vecRows = db.prepare(vecSql).all(
        new Float32Array(options.embedding),
        maxCandidates,
      ) as Array<{ rowid: number; distance: number }>;

      if (vecRows.length === 0) return [];

      const rowids = vecRows.map((r) => r.rowid);
      const placeholders = rowids.map(() => '?').join(', ');

      const conditions: string[] = [`c.rowid IN (${placeholders})`, 'c.agent_id = ?'];
      const params: unknown[] = [...rowids, options.agentId];

      if (options.minImportance !== undefined) {
        conditions.push('c.importance >= ?');
        params.push(options.minImportance);
      }
      if (options.dateFrom) {
        conditions.push('c.created_at >= ?');
        params.push(options.dateFrom);
      }
      if (options.dateTo) {
        conditions.push('c.created_at <= ?');
        params.push(options.dateTo);
      }

      const chunkSql = `SELECT * FROM chunks c WHERE ${conditions.join(' AND ')}`;
      const chunkRows = db.prepare(chunkSql).all(...params) as ChunkRow[];

      const distMap = new Map<number, number>();
      for (const vr of vecRows) {
        distMap.set(vr.rowid, vr.distance);
      }

      return chunkRows.map((row) => ({
        chunk: rowToChunk(row),
        score: 1 / (1 + (distMap.get(row.rowid) ?? 1)), // Convert distance to similarity
        source: 'vector' as const,
      }));
    } catch {
      return [];
    }
  }

  private loadVecExtension(db: Database.Database): boolean {
    try {
      // sqlite-vec provides a load function that returns the extension path
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(db);
      db.exec(createVecTable(this.config.embedding.dimensions));
      return true;
    } catch {
      return false;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new MemoryStoreError('Database not opened. Call open() first.');
    }
    return this.db;
  }
}

function rowToChunk(row: ChunkRow): MemoryChunk {
  return {
    id: row.id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    content: row.content,
    importance: row.importance,
    tokenCount: row.token_count,
    sourceType: row.source_type as MemoryChunk['sourceType'],
    chunkIndex: row.chunk_index,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

/** Escape special FTS5 characters in a query string. */
function escapeFts5Query(query: string): string {
  // Remove FTS5 operators and wrap in quotes for phrase matching
  // Simple approach: remove special chars, split on spaces, join with OR
  const cleaned = query.replace(/['"():*^~]/g, '').trim();
  if (cleaned.length === 0) return '""';
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '""';
  return words.join(' OR ');
}
