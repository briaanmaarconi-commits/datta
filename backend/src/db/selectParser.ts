// Parser del subconjunto de la sintaxis `select` de PostgREST que usa la app:
//   *            col            alias:col
//   rel(...)     alias:rel(...) rel!inner(...)    rel!fk_hint(...)    alias:fk_column(...)
export type SelectNode =
  | { kind: "star" }
  | { kind: "col"; name: string; alias?: string }
  | { kind: "embed"; alias?: string; target: string; hint?: string; inner: boolean; children: SelectNode[] };

export class SelectParseError extends Error {}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;

export function parseSelect(input: string): SelectNode[] {
  const s = input;
  let i = 0;

  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const ident = (): string => {
    IDENT.lastIndex = i;
    const m = IDENT.exec(s);
    if (!m) throw new SelectParseError(`Se esperaba un identificador en la posición ${i} de "${input}"`);
    i += m[0].length;
    return m[0];
  };

  const list = (nested: boolean): SelectNode[] => {
    const nodes: SelectNode[] = [];
    for (;;) {
      ws();
      if (s[i] === "*") {
        i++;
        nodes.push({ kind: "star" });
      } else {
        let first = ident();
        ws();
        let alias: string | undefined;
        if (s[i] === ":" && s[i + 1] !== ":") {
          i++;
          ws();
          alias = first;
          first = ident();
          ws();
        }
        let inner = false;
        let hint: string | undefined;
        while (s[i] === "!") {
          i++;
          const h = ident();
          if (h === "inner") inner = true;
          else if (h !== "left") hint = h;
          ws();
        }
        if (s[i] === "(") {
          i++;
          const children = list(true);
          ws();
          if (s[i] !== ")") throw new SelectParseError(`Falta ")" en "${input}"`);
          i++;
          nodes.push({ kind: "embed", alias, target: first, hint, inner, children });
        } else {
          if (inner || hint) throw new SelectParseError(`Modificador inválido en "${first}"`);
          nodes.push({ kind: "col", name: first, alias });
        }
      }
      ws();
      if (s[i] === ",") { i++; continue; }
      break;
    }
    if (!nested && i < s.length) throw new SelectParseError(`Texto inesperado en la posición ${i} de "${input}"`);
    return nodes;
  };

  const out = list(false);
  return out;
}
