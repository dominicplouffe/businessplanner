import ExcelJS from "exceljs";

/* ==========================================================================
   A tiny spreadsheet evaluator, for tests only.
   --------------------------------------------------------------------------
   exceljs writes formulas but never evaluates them, so a workbook whose
   formulas quietly disagreed with the engine would ship looking perfect. This
   evaluates the exact subset of Excel the exporter emits — nothing more — so
   the workbook's arithmetic can be checked against the engine's the same way
   every other number in this product is.

   It is deliberately small and strict: an unknown function throws rather than
   returning zero, because a silent zero here would defeat the purpose.
   ========================================================================== */

type Cell = { formula?: string; value: number | string | null };
type Grid = Map<string, Map<string, Cell>>; // sheet -> "A1" -> cell

export type Sheet = {
  /** Evaluates one cell, e.g. get("Monthly model", "D12"). */
  get(sheet: string, address: string): number;
  raw(sheet: string, address: string): number | string | null;
  has(sheet: string): boolean;
  sheetNames(): string[];
  /** The row carrying this label in column A. Tests address rows by what they
   *  are called rather than by number, so inserting a line above one does not
   *  quietly move every assertion onto the wrong figures. */
  rowOf(sheet: string, label: string, occurrence?: number): number;
};

export async function loadWorkbook(buffer: Buffer): Promise<Sheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const grid: Grid = new Map();
  for (const ws of wb.worksheets) {
    const cells = new Map<string, Cell>();
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const address = `${colLetter(colNumber)}${rowNumber}`;
        const value = cell.value as unknown;
        if (value !== null && typeof value === "object" && "formula" in (value as object)) {
          cells.set(address, { formula: (value as { formula: string }).formula, value: null });
        } else if (typeof value === "number" || typeof value === "string") {
          cells.set(address, { value });
        } else if (value !== null && typeof value === "object" && "text" in (value as object)) {
          cells.set(address, { value: (value as { text: string }).text });
        } else {
          cells.set(address, { value: null });
        }
      });
    });
    grid.set(ws.name, cells);
  }

  const memo = new Map<string, number>();
  const seen = new Set<string>();

  function evaluate(sheet: string, address: string): number {
    const key = `${sheet}!${address}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) throw new Error(`Circular reference at ${key}`);

    const cell = grid.get(sheet)?.get(address);
    if (!cell) return 0;
    if (cell.formula === undefined) {
      const result = typeof cell.value === "number" ? cell.value : 0;
      memo.set(key, result);
      return result;
    }

    seen.add(key);
    const result = new Parser(cell.formula.replace(/^=/, ""), sheet, evaluate, rangeOf).parse();
    seen.delete(key);
    const numeric = typeof result === "number" ? result : 0;
    memo.set(key, numeric);
    return numeric;
  }

  function rangeOf(sheet: string, from: string, to: string): number[] {
    const [c1, r1] = splitAddress(from);
    const [c2, r2] = splitAddress(to);
    const out: number[] = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
        out.push(evaluate(sheet, `${colLetter(c)}${r}`));
      }
    }
    return out;
  }

  return {
    get: (sheet, address) => evaluate(sheet, address),
    raw: (sheet, address) => grid.get(sheet)?.get(address)?.value ?? null,
    has: (sheet) => grid.has(sheet),
    sheetNames: () => [...grid.keys()],
    rowOf: (sheet, label, occurrence = 1) => {
      const cells = grid.get(sheet);
      if (!cells) throw new Error(`No sheet "${sheet}"`);
      let seenCount = 0;
      for (const [address, cell] of cells) {
        if (!address.startsWith("A")) continue;
        if (typeof cell.value === "string" && cell.value.startsWith(label)) {
          seenCount += 1;
          if (seenCount === occurrence) return Number(address.slice(1));
        }
      }
      throw new Error(`No row labelled "${label}" (#${occurrence}) on ${sheet}`);
    },
  };
}

/* -------------------------------------------------------------------------- */

export function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function splitAddress(address: string): [number, number] {
  const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address);
  if (!match) throw new Error(`Bad address: ${address}`);
  return [colIndex(match[1]!), Number(match[2])];
}

type Value = number | string | boolean;

class Parser {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly sheet: string,
    private readonly cell: (sheet: string, address: string) => number,
    private readonly range: (sheet: string, from: string, to: string) => number[],
  ) {}

  parse(): Value {
    const value = this.comparison();
    this.skip();
    if (this.pos < this.src.length) {
      throw new Error(`Unparsed tail in "${this.src}" at ${this.pos}`);
    }
    return value;
  }

  private skip() {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++;
  }

  private eat(token: string): boolean {
    this.skip();
    if (this.src.startsWith(token, this.pos)) {
      this.pos += token.length;
      return true;
    }
    return false;
  }

  private comparison(): Value {
    let left = this.additive();
    for (;;) {
      this.skip();
      const op = ["<=", ">=", "<>", "<", ">", "="].find((o) => this.src.startsWith(o, this.pos));
      if (!op) return left;
      this.pos += op.length;
      const right = this.additive();
      const a = left as number;
      const b = right as number;
      left =
        op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b :
        op === ">=" ? a >= b : op === "=" ? a === b : a !== b;
    }
  }

  private additive(): Value {
    let left = this.multiplicative();
    for (;;) {
      this.skip();
      if (this.eat("+")) left = num(left) + num(this.multiplicative());
      else if (this.eat("-")) left = num(left) - num(this.multiplicative());
      else return left;
    }
  }

  private multiplicative(): Value {
    let left = this.power();
    for (;;) {
      this.skip();
      if (this.eat("*")) left = num(left) * num(this.power());
      else if (this.eat("/")) {
        const divisor = num(this.power());
        left = divisor === 0 ? 0 : num(left) / divisor;
      } else return left;
    }
  }

  private power(): Value {
    const base = this.unary();
    this.skip();
    if (this.eat("^")) return Math.pow(num(base), num(this.power()));
    return base;
  }

  private unary(): Value {
    this.skip();
    if (this.eat("-")) return -num(this.unary());
    if (this.eat("+")) return this.unary();
    return this.primary();
  }

  private primary(): Value {
    this.skip();
    if (this.eat("(")) {
      const value = this.comparison();
      this.eat(")");
      return value;
    }

    if (this.src[this.pos] === '"') {
      this.pos++;
      const end = this.src.indexOf('"', this.pos);
      const text = this.src.slice(this.pos, end);
      this.pos = end + 1;
      return text;
    }

    const number = /^\d+(\.\d+)?/.exec(this.src.slice(this.pos));
    if (number && !/^[A-Za-z$']/.test(this.src.slice(this.pos))) {
      this.pos += number[0].length;
      return Number(number[0]);
    }

    // A quoted or bare sheet prefix, then a function call, range or cell.
    const sheetMatch = /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _]*))!/.exec(this.src.slice(this.pos));
    let sheet = this.sheet;
    if (sheetMatch) {
      sheet = sheetMatch[1] ?? sheetMatch[2]!;
      this.pos += sheetMatch[0].length;
    }

    const fn = /^([A-Z][A-Z0-9.]*)\(/i.exec(this.src.slice(this.pos));
    if (fn && !sheetMatch) {
      this.pos += fn[0].length;
      const args: Value[][] = [];
      if (!this.eat(")")) {
        for (;;) {
          args.push(this.argument());
          if (this.eat(",")) continue;
          this.eat(")");
          break;
        }
      }
      return callFunction(fn[1]!.toUpperCase(), args);
    }

    const rangeMatch = /^(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/i.exec(this.src.slice(this.pos));
    if (rangeMatch) {
      this.pos += rangeMatch[0].length;
      throw new RangeMarker(sheet, rangeMatch[1]!, rangeMatch[2]!);
    }

    const cellMatch = /^(\$?[A-Z]+\$?\d+)/i.exec(this.src.slice(this.pos));
    if (cellMatch) {
      this.pos += cellMatch[0].length;
      return this.cell(sheet, cellMatch[1]!.replace(/\$/g, ""));
    }

    throw new Error(`Cannot parse "${this.src}" at ${this.pos}: ${this.src.slice(this.pos, this.pos + 20)}`);
  }

  /** An argument may be a range, which is only legal inside a function. */
  private argument(): Value[] {
    const start = this.pos;
    try {
      return [this.comparison()];
    } catch (error) {
      if (error instanceof RangeMarker) {
        this.pos = start;
        this.skip();
        const sheetMatch = /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _]*))!/.exec(this.src.slice(this.pos));
        let sheet = this.sheet;
        if (sheetMatch) {
          sheet = sheetMatch[1] ?? sheetMatch[2]!;
          this.pos += sheetMatch[0].length;
        }
        const rangeMatch = /^(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/i.exec(this.src.slice(this.pos));
        if (!rangeMatch) throw error;
        this.pos += rangeMatch[0].length;
        return this.range(
          sheet,
          rangeMatch[1]!.replace(/\$/g, ""),
          rangeMatch[2]!.replace(/\$/g, ""),
        );
      }
      throw error;
    }
  }
}

class RangeMarker extends Error {
  constructor(readonly sheet: string, readonly from: string, readonly to: string) {
    super("range");
  }
}

function num(value: Value): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return 0;
}

function callFunction(name: string, args: Value[][]): Value {
  const flat = args.flat();
  const n = (i: number) => num(flat[i] ?? 0);

  switch (name) {
    case "IF":
      return truthy(args[0]?.[0]) ? (args[1]?.[0] ?? 0) : (args[2]?.[0] ?? 0);
    case "AND":
      return flat.every(truthy);
    case "OR":
      return flat.some(truthy);
    case "NOT":
      return !truthy(flat[0]);
    case "MAX":
      return Math.max(...flat.map(num));
    case "MIN":
      return Math.min(...flat.map(num));
    case "SUM":
      return flat.reduce((sum: number, v) => sum + num(v), 0);
    case "ABS":
      return Math.abs(n(0));
    case "POWER":
      return Math.pow(n(0), n(1));
    case "MOD":
      return n(0) % n(1);
    case "ROUNDDOWN":
      return Math.trunc(n(0) * Math.pow(10, n(1))) / Math.pow(10, n(1));
    case "ROUND":
      return Math.round(n(0) * Math.pow(10, n(1))) / Math.pow(10, n(1));
    case "INDEX": {
      const array = args[0] ?? [];
      // INDEX(range, row, col) over a single-row range.
      const col = args[2] ? num(args[2][0] ?? 1) : num(args[1]?.[0] ?? 1);
      return num(array[col - 1] ?? 0);
    }
    case "PMT": {
      const rate = n(0);
      const periods = n(1);
      const present = n(2);
      if (periods <= 0) return 0;
      if (rate === 0) return -present / periods;
      return (-present * rate) / (1 - Math.pow(1 + rate, -periods));
    }
    default:
      throw new Error(`Unsupported function in export: ${name}`);
  }
}

function truthy(value: Value | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}
