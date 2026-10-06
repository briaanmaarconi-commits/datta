import { z } from "zod";

const filterSchema = z.object({
  col: z.string().max(100),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"]),
  value: z.unknown(),
  negate: z.boolean().optional(),
});

/** Forma de las consultas que envía el cliente (src/lib/db.ts). */
export const specSchema = z.object({
  table: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  op: z.enum(["select", "insert", "update", "delete"]),
  select: z.string().max(2000).optional(),
  filters: z.array(filterSchema).max(50).optional(),
  order: z
    .array(z.object({ col: z.string().max(200), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() }))
    .max(10)
    .optional(),
  limit: z.number().int().min(0).max(100000).optional(),
  single: z.enum(["single", "maybe"]).optional(),
  count: z.literal("exact").optional(),
  head: z.boolean().optional(),
  values: z.union([z.record(z.unknown()), z.array(z.record(z.unknown())).max(5000)]).optional(),
});
