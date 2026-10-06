import { SERVICE, withDb } from "./pool.js";
import type pg from "pg";

// service_role tiene privilegios sobre las tablas, así information_schema muestra todas las columnas.
const query = <R extends pg.QueryResultRow>(sql: string) => withDb(SERVICE, (c) => c.query<R>(sql));

export interface ColumnInfo {
  name: string;
  /** data_type de information_schema (jsonb, uuid, ARRAY, ...) */
  type: string;
  udt: string;
}
export interface ForeignKey {
  name: string;
  table: string; // tabla que tiene la FK
  columns: string[];
  refTable: string;
  refColumns: string[];
}
export interface Catalog {
  tables: Map<string, Map<string, ColumnInfo>>;
  fks: ForeignKey[];
  primaryKeys: Map<string, string[]>;
  functions: Map<string, { kind: "set" | "composite" | "void" | "scalar" }>;
}

let cache: Catalog | null = null;

/** Lee tablas, columnas y FK del esquema public. El motor valida todo identificador contra esto. */
export async function loadCatalog(force = false): Promise<Catalog> {
  if (cache && !force) return cache;
  const cols = await query<{ table_name: string; column_name: string; data_type: string; udt_name: string }>(
    `SELECT c.table_name, c.column_name, c.data_type, c.udt_name
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY c.table_name, c.ordinal_position`,
  );
  const tables = new Map<string, Map<string, ColumnInfo>>();
  for (const r of cols.rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, new Map());
    tables.get(r.table_name)!.set(r.column_name, { name: r.column_name, type: r.data_type, udt: r.udt_name });
  }

  const fkRows = await query<{
    conname: string; tbl: string; cols: string[]; reftbl: string; refcols: string[];
  }>(
    `SELECT con.conname, cl.relname AS tbl, rcl.relname AS reftbl,
            ARRAY(SELECT a.attname::text FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS cols,
            ARRAY(SELECT a.attname::text FROM unnest(con.confkey) k JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k) AS refcols
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
       JOIN pg_class rcl ON rcl.oid = con.confrelid
       JOIN pg_namespace rn ON rn.oid = rcl.relnamespace AND rn.nspname = 'public'
      WHERE con.contype = 'f'`,
  );
  const fks: ForeignKey[] = fkRows.rows.map((r) => ({
    name: r.conname, table: r.tbl, columns: r.cols, refTable: r.reftbl, refColumns: r.refcols,
  }));

  const pkRows = await query<{ tbl: string; cols: string[] }>(
    `SELECT cl.relname AS tbl,
            ARRAY(SELECT a.attname::text FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS cols
       FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE con.contype = 'p'`,
  );
  const primaryKeys = new Map(pkRows.rows.map((r) => [r.tbl, r.cols]));

  const fnRows = await query<{ proname: string; kind: "set" | "composite" | "void" | "scalar" }>(
    `SELECT p.proname, CASE WHEN p.proretset THEN 'set' WHEN p.prorettype = 'void'::regtype THEN 'void' WHEN t.typtype = 'c' THEN 'composite' ELSE 'scalar' END AS kind FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype WHERE n.nspname = 'public'`,
  );
  const functions = new Map(fnRows.rows.map((r) => [r.proname, { kind: r.kind }]));

  cache = { tables, fks, primaryKeys, functions };
  return cache;
}
