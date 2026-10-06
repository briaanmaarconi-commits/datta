import type pg from "pg";
import { loadCatalog, type Catalog, type ColumnInfo, type ForeignKey } from "./catalog.js";
import { parseSelect, SelectParseError, type SelectNode } from "./selectParser.js";

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is";
export interface Filter {
  col: string;
  op: FilterOp;
  value: unknown;
  negate?: boolean;
}
export interface QuerySpec {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  select?: string;
  filters?: Filter[];
  order?: { col: string; ascending?: boolean; nullsFirst?: boolean }[];
  limit?: number;
  single?: "single" | "maybe";
  count?: "exact";
  head?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
}
export interface QueryError {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
}
export interface QueryResult {
  data: unknown;
  error: QueryError | null;
  count: number | null;
}

export class QueryBuildError extends Error {
  constructor(message: string, public code = "PGRST100") {
    super(message);
  }
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
const FILTER_OPS = new Set<FilterOp>(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"]);

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

interface Ctx {
  cat: Catalog;
  params: Params;
  n: number;
}
const nextAlias = (ctx: Ctx) => `t${ctx.n++}`;

interface Rel {
  kind: "one" | "many";
  refTable: string;
  /** pares [columna en tabla base, columna en tabla relacionada] */
  join: [string, string][];
}

function resolveEmbed(cat: Catalog, base: string, target: string, hint?: string): Rel {
  const toOne = (fk: ForeignKey): Rel => ({
    kind: "one",
    refTable: fk.refTable,
    join: fk.columns.map((c, i) => [c, fk.refColumns[i]]),
  });
  const toMany = (fk: ForeignKey): Rel => ({
    kind: "many",
    refTable: fk.table,
    join: fk.refColumns.map((c, i) => [c, fk.columns[i]]),
  });

  // alias:fk_column(...) -> relación to-one por la columna FK
  const byCol = cat.fks.filter((fk) => fk.table === base && fk.columns.length === 1 && fk.columns[0] === target);
  if (byCol.length) return toOne(byCol[0]);

  if (cat.tables.has(target)) {
    const matchHint = (fk: ForeignKey) => !hint || fk.name === hint || fk.columns.includes(hint);
    const cands: Rel[] = [
      ...cat.fks.filter((fk) => fk.table === base && fk.refTable === target && matchHint(fk)).map(toOne),
      ...cat.fks.filter((fk) => fk.table === target && fk.refTable === base && matchHint(fk)).map(toMany),
    ];
    if (cands.length === 1) return cands[0];
    if (cands.length > 1) throw new QueryBuildError(`Relación ambigua entre "${base}" y "${target}"`, "PGRST201");
  }
  throw new QueryBuildError(`No se encontró relación entre "${base}" y "${target}"`, "PGRST200");
}

function cols(cat: Catalog, table: string): Map<string, ColumnInfo> {
  const c = cat.tables.get(table);
  if (!c) throw new QueryBuildError(`Tabla desconocida: ${table}`, "42P01");
  return c;
}
function colInfo(cat: Catalog, table: string, col: string): ColumnInfo {
  const c = cols(cat, table).get(col);
  if (!c) throw new QueryBuildError(`Columna desconocida: ${table}.${col}`, "42703");
  return c;
}

function filterSql(ctx: Ctx, table: string, alias: string, f: Filter): string {
  colInfo(ctx.cat, table, f.col);
  const col = `${alias}.${q(f.col)}`;
  if (!FILTER_OPS.has(f.op)) throw new QueryBuildError(`Operador no soportado: ${f.op}`);
  let sql: string;
  switch (f.op) {
    case "eq": sql = `${col} = ${ctx.params.add(f.value)}`; break;
    case "neq": sql = `${col} <> ${ctx.params.add(f.value)}`; break;
    case "gt": sql = `${col} > ${ctx.params.add(f.value)}`; break;
    case "gte": sql = `${col} >= ${ctx.params.add(f.value)}`; break;
    case "lt": sql = `${col} < ${ctx.params.add(f.value)}`; break;
    case "lte": sql = `${col} <= ${ctx.params.add(f.value)}`; break;
    case "like": sql = `${col} LIKE ${ctx.params.add(f.value)}`; break;
    case "ilike": sql = `${col} ILIKE ${ctx.params.add(f.value)}`; break;
    case "in": {
      if (!Array.isArray(f.value)) throw new QueryBuildError("in() requiere un array");
      sql = f.value.length === 0 ? "FALSE" : `${col} = ANY(${ctx.params.add(f.value)})`;
      break;
    }
    case "is": {
      if (f.value === null) sql = `${col} IS NULL`;
      else if (f.value === true) sql = `${col} IS TRUE`;
      else if (f.value === false) sql = `${col} IS FALSE`;
      else throw new QueryBuildError("is() solo admite null, true o false");
      break;
    }
  }
  return f.negate ? `NOT (${sql})` : sql;
}

/** Separa los filtros propios de los que apuntan a una relación embebida ("rel.col"). */
function splitFilters(filters: Filter[]): { own: Filter[]; nested: Map<string, Filter[]> } {
  const own: Filter[] = [];
  const nested = new Map<string, Filter[]>();
  for (const f of filters) {
    const dot = f.col.indexOf(".");
    if (dot === -1) own.push(f);
    else {
      const head = f.col.slice(0, dot);
      if (!nested.has(head)) nested.set(head, []);
      nested.get(head)!.push({ ...f, col: f.col.slice(dot + 1) });
    }
  }
  return { own, nested };
}

interface Built {
  /** expresiones del SELECT (sin la palabra SELECT) */
  list: string;
  /** condiciones extra para el WHERE de la tabla base (embeds !inner) */
  where: string[];
}

function joinCond(rel: Rel, baseAlias: string, refAlias: string): string {
  return rel.join.map(([b, r]) => `${refAlias}.${q(r)} = ${baseAlias}.${q(b)}`).join(" AND ");
}

function buildSelect(ctx: Ctx, table: string, alias: string, nodes: SelectNode[], nestedFilters: Map<string, Filter[]>): Built {
  const items: string[] = [];
  const where: string[] = [];
  const tableCols = cols(ctx.cat, table);

  for (const node of nodes) {
    if (node.kind === "star") {
      items.push(`${alias}.*`);
    } else if (node.kind === "col") {
      if (!tableCols.has(node.name)) throw new QueryBuildError(`Columna desconocida: ${table}.${node.name}`, "42703");
      items.push(`${alias}.${q(node.name)}${node.alias ? ` AS ${q(node.alias)}` : ""}`);
    } else {
      const rel = resolveEmbed(ctx.cat, table, node.target, node.hint);
      const outName = node.alias ?? node.target;
      const filtersHere = nestedFilters.get(outName) ?? nestedFilters.get(node.target) ?? [];
      const { own, nested } = splitFilters(filtersHere);

      const sub = (): string => {
        const ra = nextAlias(ctx);
        const inner = buildSelect(ctx, rel.refTable, ra, node.children, nested);
        const conds = [joinCond(rel, alias, ra), ...own.map((f) => filterSql(ctx, rel.refTable, ra, f)), ...inner.where];
        return `SELECT ${inner.list} FROM public.${q(rel.refTable)} ${ra} WHERE ${conds.join(" AND ")}`;
      };

      if (rel.kind === "one") {
        items.push(`(SELECT to_jsonb(e) FROM (${sub()}) e) AS ${q(outName)}`);
      } else {
        items.push(`COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM (${sub()}) e), '[]'::jsonb) AS ${q(outName)}`);
      }

      if (node.inner) {
        const xa = nextAlias(ctx);
        const conds = [joinCond(rel, alias, xa), ...own.map((f) => filterSql(ctx, rel.refTable, xa, f))];
        where.push(`EXISTS (SELECT 1 FROM public.${q(rel.refTable)} ${xa} WHERE ${conds.join(" AND ")})`);
      }
    }
  }
  return { list: items.join(", "), where };
}

function orderSql(ctx: Ctx, table: string, alias: string, order: QuerySpec["order"]): string {
  if (!order?.length) return "";
  const parts: string[] = [];
  for (const o of order) {
    // order('type, name') llega como una sola cadena con varias columnas.
    for (const piece of o.col.split(",")) {
      const [name, dir] = piece.trim().split(/\s+/);
      colInfo(ctx.cat, table, name);
      const desc = dir ? dir.toLowerCase() === "desc" : o.ascending === false;
      const nulls = o.nullsFirst === undefined ? "" : o.nullsFirst ? " NULLS FIRST" : " NULLS LAST";
      parts.push(`${alias}.${q(name)} ${desc ? "DESC" : "ASC"}${nulls}`);
    }
  }
  return ` ORDER BY ${parts.join(", ")}`;
}

function whereSql(ctx: Ctx, table: string, alias: string, own: Filter[], extra: string[]): string {
  const conds = [...own.map((f) => filterSql(ctx, table, alias, f)), ...extra];
  return conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
}

function bindValue(info: ColumnInfo, v: unknown, params: Params): string {
  if (v === undefined) return "DEFAULT";
  if (v === null) return params.add(null);
  if (info.type === "jsonb" || info.type === "json") return `${params.add(JSON.stringify(v))}::${info.type}`;
  return params.add(v);
}

export interface BuiltQuery {
  sql: string;
  params: unknown[];
  countSql?: { sql: string; params: unknown[] };
  returnsRows: boolean;
}

export function buildQuery(cat: Catalog, spec: QuerySpec): BuiltQuery {
  const params = new Params();
  const ctx: Ctx = { cat, params, n: 0 };
  const table = spec.table;
  cols(cat, table);
  const filters = spec.filters ?? [];
  const selectStr = spec.select ?? (spec.op === "select" ? "*" : undefined);

  const selectFrom = (source: string, withFilters: boolean): string => {
    const nodes = parseSelect(selectStr ?? "*");
    const { own, nested } = splitFilters(withFilters ? filters : []);
    const built = buildSelect(ctx, table, "b", nodes, nested);
    const where = whereSql(ctx, table, "b", own, built.where);
    const order = orderSql(ctx, table, "b", spec.order);
    const limit = spec.limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(Number(spec.limit)))}` : "";
    return `SELECT to_jsonb(r) AS row FROM (SELECT ${built.list} FROM ${source} b${where}${order}${limit}) r`;
  };

  if (spec.op === "select") {
    const main = spec.head ? "SELECT NULL::jsonb AS row WHERE FALSE" : selectFrom(`public.${q(table)}`, true);
    let countSql: BuiltQuery["countSql"];
    if (spec.count) {
      const cctx: Ctx = { cat, params: new Params(), n: 0 };
      const { own, nested } = splitFilters(filters);
      const built = buildSelect(cctx, table, "b", parseSelect(selectStr ?? "*"), nested);
      countSql = {
        sql: `SELECT count(*)::int AS n FROM public.${q(table)} b${whereSql(cctx, table, "b", own, built.where)}`,
        params: cctx.params.values,
      };
    }
    return { sql: main, params: params.values, countSql, returnsRows: true };
  }

  const { own, nested } = splitFilters(filters);
  if (nested.size) throw new QueryBuildError("Las mutaciones no admiten filtros sobre relaciones");

  if (spec.op === "insert") {
    const rows = Array.isArray(spec.values) ? spec.values : spec.values ? [spec.values] : [];
    if (!rows.length) throw new QueryBuildError("insert() requiere valores");
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const infos = keys.map((k) => colInfo(cat, table, k));
    const valuesSql = rows
      .map((r) => `(${keys.map((k, i) => bindValue(infos[i], (r as Record<string, unknown>)[k], params)).join(", ")})`)
      .join(", ");
    const ins = keys.length
      ? `INSERT INTO public.${q(table)} (${keys.map(q).join(", ")}) VALUES ${valuesSql}`
      : `INSERT INTO public.${q(table)} DEFAULT VALUES`;
    if (!spec.select) return { sql: ins, params: params.values, returnsRows: false };
    return { sql: `WITH ins AS (${ins} RETURNING *) ${selectFrom("ins", false)}`, params: params.values, returnsRows: true };
  }

  if (!own.length) throw new QueryBuildError(`${spec.op}() sin filtros no está permitido`);

  if (spec.op === "update") {
    const vals = (spec.values ?? {}) as Record<string, unknown>;
    const keys = Object.keys(vals);
    if (!keys.length) throw new QueryBuildError("update() requiere valores");
    const sets = keys.map((k) => `${q(k)} = ${bindValue(colInfo(cat, table, k), vals[k], params)}`).join(", ");
    const upd = `UPDATE public.${q(table)} AS b SET ${sets}${whereSql(ctx, table, "b", own, [])}`;
    if (!spec.select) return { sql: upd, params: params.values, returnsRows: false };
    return { sql: `WITH upd AS (${upd} RETURNING b.*) ${selectFrom("upd", false)}`, params: params.values, returnsRows: true };
  }

  const del = `DELETE FROM public.${q(table)} AS b${whereSql(ctx, table, "b", own, [])}`;
  if (!spec.select) return { sql: del, params: params.values, returnsRows: false };
  return { sql: `WITH del AS (${del} RETURNING b.*) ${selectFrom("del", false)}`, params: params.values, returnsRows: true };
}

export function toQueryError(e: unknown): QueryError {
  const err = e as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: err.message ?? "Error", code: err.code ?? null, details: err.detail ?? null, hint: err.hint ?? null };
}

export async function runQuery(client: pg.PoolClient, spec: QuerySpec): Promise<QueryResult> {
  const cat = await loadCatalog();
  let built: BuiltQuery;
  try {
    built = buildQuery(cat, spec);
  } catch (e) {
    if (e instanceof QueryBuildError || e instanceof SelectParseError) {
      const code = e instanceof QueryBuildError ? e.code : "PGRST100";
      return { data: null, error: { message: e.message, code, details: null, hint: null }, count: null };
    }
    throw e;
  }

  // SAVEPOINT: un error de SQL (RLS, unique, ...) no debe dejar la transacción abortada
  // antes de devolver el error al cliente.
  await client.query("SAVEPOINT q");
  try {
    const res = await client.query(built.sql, built.params);
    let count: number | null = null;
    if (built.countSql) {
      const c = await client.query(built.countSql.sql, built.countSql.params);
      count = c.rows[0].n as number;
    }
    await client.query("RELEASE SAVEPOINT q");

    if (!built.returnsRows) return { data: null, error: null, count };
    const rows = res.rows.map((r) => r.row);
    if (spec.single) {
      if (rows.length === 1) return { data: rows[0], error: null, count };
      if (rows.length === 0 && spec.single === "maybe") return { data: null, error: null, count };
      return {
        data: null,
        error: {
          message: "JSON object requested, multiple (or no) rows returned",
          code: "PGRST116",
          details: `The result contains ${rows.length} rows`,
          hint: null,
        },
        count,
      };
    }
    return { data: spec.head ? null : rows, error: null, count };
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT q");
    return { data: null, error: toQueryError(e), count: null };
  }
}
