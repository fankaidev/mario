import Database from "better-sqlite3";

// Minimal subset of D1Database interface that the application uses
interface D1Result {
  meta: {
    last_row_id?: number;
    changes?: number;
  };
}

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<D1Result>;
  raw<T>(): Promise<T[]>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<void>;
}

export function createD1Adapter(sqlite: Database.Database): D1Like {
  function createStatement(sql: string, boundParams: unknown[] = []): D1PreparedStatement {
    const stmt: D1PreparedStatement = {
      bind(...params: unknown[]) {
        return createStatement(sql, params);
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...boundParams) ?? null) as T | null;
      },
      async all<T>() {
        const results = sqlite.prepare(sql).all(...boundParams) as T[];
        return { results };
      },
      async run() {
        const info = sqlite.prepare(sql).run(...boundParams);
        return {
          meta: {
            last_row_id: Number(info.lastInsertRowid),
            changes: info.changes,
          },
        };
      },
      async raw<T>() {
        return sqlite.prepare(sql).all(...boundParams) as T[];
      },
    };
    return stmt;
  }

  return {
    prepare(sql: string) {
      return createStatement(sql);
    },
    async exec(sql: string) {
      sqlite.exec(sql);
    },
  };
}
