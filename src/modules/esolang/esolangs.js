// Text -> programs in esoteric languages that print that text, plus small
// interpreters for each language. The interpreters drive the on-screen machine
// and also check every generated program: it runs, and must print the input.

import { withHidden, reveal, stripHidden } from '../../core/hidden.js';

const utf8 = (text) => Array.from(new TextEncoder().encode(String(text)));

// ================================================================ Brainfuck
// One working cell. Big jumps between characters use a multiplication loop on
// the cell to the right (">+++++[<++++++++>-]<") when that is shorter.
function bfMove(d) {
  if (d === 0) return '';
  const up = d > 0 ? '+' : '-';
  const down = d > 0 ? '-' : '+';
  const n = Math.abs(d);
  let best = up.repeat(n);
  for (let q = 2; q <= 16; q++) {
    for (let r = 2; r <= 16; r++) {
      const rem = n - q * r;
      const tail = rem >= 0 ? up.repeat(rem) : down.repeat(-rem);
      const cand = `>${'+'.repeat(q)}[<${up.repeat(r)}>-]<${tail}`;
      if (cand.length < best.length) best = cand;
    }
  }
  return best;
}

export function toBrainfuck(text) {
  let code = '';
  let v = 0;
  for (const b of utf8(text)) {
    code += `${bfMove(b - v)}.`;
    v = b;
  }
  return code;
}

/** Step-by-step Brainfuck machine (8-bit cells that wrap, 30,000-cell tape). */
export function bfMachine(code) {
  const ops = [];
  const pos = []; // index in `code` of each op
  for (let i = 0; i < code.length; i++) if ('+-<>[].,'.includes(code[i])) ops.push(code[i]), pos.push(i);
  const jump = new Int32Array(ops.length);
  const stack = [];
  ops.forEach((op, i) => {
    if (op === '[') stack.push(i);
    if (op === ']') {
      const j = stack.pop();
      if (j === undefined) throw new Error('Unmatched ]');
      jump[i] = j;
      jump[j] = i;
    }
  });
  if (stack.length) throw new Error('Unmatched [');
  const tape = new Uint8Array(30000);
  const s = { ip: 0, ptr: 0, out: [], steps: 0, done: ops.length === 0, tape };
  return {
    state: s,
    pos: () => pos[s.ip] ?? -1,
    step() {
      if (s.done) return false;
      const op = ops[s.ip];
      if (op === '+') tape[s.ptr]++;
      else if (op === '-') tape[s.ptr]--;
      else if (op === '>') s.ptr = (s.ptr + 1) % 30000;
      else if (op === '<') s.ptr = (s.ptr + 29999) % 30000;
      else if (op === '.') s.out.push(tape[s.ptr]);
      else if (op === '[' && tape[s.ptr] === 0) s.ip = jump[s.ip];
      else if (op === ']' && tape[s.ptr] !== 0) s.ip = jump[s.ip];
      s.ip++;
      s.steps++;
      if (s.ip >= ops.length) s.done = true;
      return !s.done;
    },
  };
}

// ==================================================================== Ook!
// Ook! is Brainfuck with each command spelled as two "Ook" words.
export const OOK = {
  '>': 'Ook. Ook?', '<': 'Ook? Ook.', '+': 'Ook. Ook.', '-': 'Ook! Ook!',
  '.': 'Ook! Ook.', ',': 'Ook. Ook!', '[': 'Ook! Ook?', ']': 'Ook? Ook!',
};
const OOK_BACK = Object.fromEntries(Object.entries(OOK).map(([k, v]) => [v, k]));

export function toOok(text) {
  return Array.from(toBrainfuck(text), (c) => OOK[c]).join(' ');
}
export function ookToBrainfuck(ook) {
  const words = ook.trim().split(/\s+/);
  let bf = '';
  for (let i = 0; i + 1 < words.length; i += 2) {
    const c = OOK_BACK[`${words[i]} ${words[i + 1]}`];
    if (!c) throw new Error(`Not an Ook! command: ${words[i]} ${words[i + 1]}`);
    bf += c;
  }
  return bf;
}

// ============================================================== Whitespace
// Only space, tab and line feed matter. For each character: push its code
// point (S S, sign, binary digits with S=0 T=1, L), then print it (T L S S).
// The program ends with L L L.
const S = ' ';
const T = '\t';
const L = '\n';

export function toWhitespace(text) {
  let code = '';
  for (const ch of String(text)) {
    const bits = ch.codePointAt(0).toString(2).replace(/0/g, S).replace(/1/g, T);
    code += `${S}${S}${S}${bits}${L}${T}${L}${S}${S}`;
  }
  return `${code}${L}${L}${L}`;
}

// Every Whitespace command: [instruction-modification parameter + command] -> op.
// Commands marked with `num` take a number, `label` a label (both end with L).
const WS_COMMANDS = [
  ['SS', 'push', 'num'], ['SLS', 'dup'], ['STS', 'copy', 'num'], ['SLT', 'swap'], ['SLL', 'drop'], ['STL', 'slide', 'num'],
  ['TSSS', 'add'], ['TSST', 'sub'], ['TSSL', 'mul'], ['TSTS', 'div'], ['TSTT', 'mod'],
  ['TTS', 'store'], ['TTT', 'load'],
  ['LSS', 'label', 'label'], ['LST', 'call', 'label'], ['LSL', 'jump', 'label'], ['LTS', 'jz', 'label'], ['LTT', 'jn', 'label'],
  ['LTL', 'ret'], ['LLL', 'end'],
  ['TLSS', 'outc'], ['TLST', 'outn'], ['TLTS', 'readc'], ['TLTT', 'readn'],
];

/** A full Whitespace machine. Programs have no input here, so reads give -1. */
export function wsMachine(code) {
  const src = Array.from(code).map((c, i) => [c === S ? 'S' : c === T ? 'T' : c === L ? 'L' : '', i]).filter(([c]) => c);
  const ins = [];
  const labels = new Map();
  let k = 0;
  while (k < src.length) {
    const at = src[k][1];
    let cmd = null;
    for (const [seq, op, arg] of WS_COMMANDS) {
      if (src.slice(k, k + seq.length).map(([c]) => c).join('') === seq) {
        cmd = { op, arg, at };
        k += seq.length;
        break;
      }
    }
    if (!cmd) throw new Error(`Unknown Whitespace command at position ${at}`);
    if (cmd.arg) {
      let bits = '';
      for (; k < src.length && src[k][0] !== 'L'; k++) bits += src[k][0];
      k++; // the closing L
      if (cmd.arg === 'num') {
        const digits = bits.slice(1).replace(/S/g, '0').replace(/T/g, '1') || '0';
        cmd.value = (bits[0] === 'T' ? -1 : 1) * parseInt(digits, 2);
      } else cmd.value = bits;
    }
    if (cmd.op === 'label') labels.set(cmd.value, ins.length);
    ins.push(cmd);
  }
  const s = { ip: 0, stack: [], out: [], steps: 0, done: !ins.length, calls: [], heap: new Map() };
  const pop = () => {
    if (!s.stack.length) throw new Error('Whitespace: stack is empty');
    return s.stack.pop();
  };
  const goto = (label) => {
    if (!labels.has(label)) throw new Error('Whitespace: jump to a missing label');
    s.ip = labels.get(label);
  };
  return {
    state: s,
    pos: () => ins[s.ip]?.at ?? -1,
    step() {
      if (s.done) return false;
      const i = ins[s.ip++];
      s.steps++;
      switch (i.op) {
        case 'push': s.stack.push(i.value); break;
        case 'dup': s.stack.push(s.stack.at(-1) ?? 0); break;
        case 'copy': s.stack.push(s.stack.at(-1 - i.value) ?? 0); break;
        case 'swap': { const a = pop(); const b = pop(); s.stack.push(a, b); break; }
        case 'drop': pop(); break;
        case 'slide': { const top = pop(); s.stack.splice(Math.max(0, s.stack.length - i.value)); s.stack.push(top); break; }
        case 'add': case 'sub': case 'mul': case 'div': case 'mod': {
          const b = pop();
          const a = pop();
          if ((i.op === 'div' || i.op === 'mod') && b === 0) throw new Error('Whitespace: division by zero');
          s.stack.push(i.op === 'add' ? a + b : i.op === 'sub' ? a - b : i.op === 'mul' ? a * b : i.op === 'div' ? Math.floor(a / b) : a - b * Math.floor(a / b));
          break;
        }
        case 'store': { const v = pop(); s.heap.set(pop(), v); break; }
        case 'load': s.stack.push(s.heap.get(pop()) ?? 0); break;
        case 'label': break;
        case 'call': s.calls.push(s.ip); goto(i.value); break;
        case 'jump': goto(i.value); break;
        case 'jz': if (pop() === 0) goto(i.value); break;
        case 'jn': if (pop() < 0) goto(i.value); break;
        case 'ret': if (!s.calls.length) throw new Error('Whitespace: return without call'); s.ip = s.calls.pop(); break;
        case 'end': s.done = true; break;
        case 'outc': s.out.push(...utf8(String.fromCodePoint(Math.max(0, pop())))); break;
        case 'outn': s.out.push(...utf8(String(pop()))); break;
        case 'readc': case 'readn': s.heap.set(pop(), -1); break;
      }
      if (s.ip >= ins.length) s.done = true;
      return !s.done;
    },
  };
}

// ================================================================ Malbolge
// Reference semantics (Ben Olmstead, 1998): ternary machine, 3^10 cells,
// registers a, c, d; each instruction is decoded from (cell + c) mod 94 and
// the cell is "encrypted" right after it runs.
const MB_SIZE = 59049;
const XLAT1 = '+b(29e*j1VMEKLyC})8&m#~W>qxdRp0wkrUo[D7,XTcA"lI.v%{gJh4G\\-=O@5`_3i<?Z\';FNQuY]szf$!BS/|t:Pn6^Ha';
const XLAT2 = '5z]&gqtyfr$(we4{WP)H-Zn,[%\\3dL+Q;>U!pJS72FhOA1CB6v^=I_0/8|jsb9m<.TVac`uY*MK\'X~xDl}REokN:#?G"i@';
const CRZ = [
  [1, 0, 0],
  [1, 0, 2],
  [2, 2, 1],
]; // CRZ[trit of d-cell][trit of a]

export function crazy(a, dval) {
  let out = 0;
  let p = 1;
  for (let i = 0; i < 10; i++) {
    out += CRZ[dval % 3][a % 3] * p;
    a = Math.floor(a / 3);
    dval = Math.floor(dval / 3);
    p *= 3;
  }
  return out;
}
// Long enough to try every one of the 94 position-dependent instruction encodings.
const MB_MAX_DEPTH = 200;
const rotr = (x) => Math.floor(x / 3) + (x % 3) * 19683;
export const toTernary = (n) => n.toString(3).padStart(10, '0');

/** The program character that decodes to instruction `op` at position `i`. */
const charFor = (op, i) => String.fromCharCode(((((XLAT1.indexOf(op) - i) % 94) + 94) % 94) + 33);

/**
 * Generates Malbolge by searching, character by character, for the shortest
 * run of rotate (*), crazy (p) and no-op (o) instructions that leaves the low
 * byte of register a equal to the next byte, then prints it (<). The program
 * runs straight through without jumps, so cell d always equals c and each
 * instruction only ever reads its own cell. It ends with halt (v).
 */
export function toMalbolge(text) {
  let code = '';
  let a = 0;
  for (const target of utf8(text)) {
    const start = code.length;
    let level = new Map([[a, null]]);
    const history = [];
    let found = null;
    for (let depth = 0; depth < MB_MAX_DEPTH && !found; depth++) {
      for (const [value] of level) {
        if (value % 256 === target) {
          found = { value, depth };
          break;
        }
      }
      if (found) break;
      history.push(level);
      const next = new Map();
      const i = start + depth;
      const rotCell = charFor('*', i).charCodeAt(0);
      const crzCell = charFor('p', i).charCodeAt(0);
      for (const [value] of level) {
        const rot = rotr(rotCell);
        if (!next.has(rot)) next.set(rot, [value, '*']);
        const cz = crazy(value, crzCell);
        if (!next.has(cz)) next.set(cz, [value, 'p']);
        if (!next.has(value)) next.set(value, [value, 'o']);
      }
      level = next;
    }
    if (!found) throw new Error('No Malbolge path found');
    // Walk back through the levels to recover the instructions.
    const opsRev = [];
    let v = found.value;
    for (let d = found.depth; d > 0; d--) {
      const [prev, op] = (d === found.depth ? level : history[d]).get(v);
      opsRev.push(op);
      v = prev;
    }
    const ops = opsRev.reverse();
    ops.forEach((op) => (code += charFor(op, code.length)));
    code += charFor('<', code.length);
    a = found.value;
  }
  return code + charFor('v', code.length);
}

/** Step-by-step Malbolge machine. */
export function mbMachine(code) {
  const prog = code.replace(/\s/g, '');
  if (prog.length < 2) throw new Error('Malbolge programs need at least 2 characters');
  const mem = new Uint16Array(MB_SIZE);
  for (let i = 0; i < prog.length; i++) {
    const x = prog.charCodeAt(i);
    if (x < 33 || x > 126 || !'ji*p</vo'.includes(XLAT1[(x - 33 + i) % 94])) throw new Error(`Invalid character at ${i}`);
    mem[i] = x;
  }
  for (let i = prog.length; i < MB_SIZE; i++) mem[i] = crazy(mem[i - 1], mem[i - 2]);
  const s = { a: 0, c: 0, d: 0, out: [], steps: 0, done: false, op: '' };
  return {
    state: s,
    pos: () => (s.c < prog.length ? s.c : -1),
    step() {
      if (s.done) return false;
      const cell = mem[s.c];
      if (cell < 33 || cell > 126) {
        s.done = true;
        return false;
      }
      const op = XLAT1[(cell - 33 + s.c) % 94];
      s.op = op;
      if (op === 'j') s.d = mem[s.d];
      else if (op === 'i') s.c = mem[s.d];
      else if (op === '*') s.a = mem[s.d] = rotr(mem[s.d]);
      else if (op === 'p') s.a = mem[s.d] = crazy(s.a, mem[s.d]);
      else if (op === '<') s.out.push(s.a % 256);
      else if (op === 'v') {
        s.done = true;
        s.steps++;
        return false;
      }
      mem[s.c] = XLAT2.charCodeAt(mem[s.c] - 33);
      s.c = (s.c + 1) % MB_SIZE;
      s.d = (s.d + 1) % MB_SIZE;
      s.steps++;
      return true;
    },
  };
}

// ================================================================= Befunge
// A one-line Befunge-93 program: push the text backwards in string mode, then
// ">:#,_@" prints characters until the stack is empty. Quotes and non-ASCII
// bytes can't go in string mode, so they are pushed as small arithmetic.
function bfgNumber(n) {
  if (n <= 9) return String(n);
  for (let q = 2; q <= 9; q++) for (let r = q; r <= 9; r++) if (q * r === n) return `${q}${r}*`;
  for (let q = 2; q <= 9; q++) for (let r = q; r <= 9; r++) for (let s = 1; s <= 9; s++) if (q * r + s === n) return `${q}${r}*${s}+`;
  for (let q = 2; q <= 9; q++) for (let r = 2; r <= 9; r++) for (let t = 2; t <= 9; t++) for (let s = 0; s <= 9; s++) {
    if (q * r * t + s === n) return `${q}${r}*${t}*${s ? `${s}+` : ''}`;
  }
  throw new Error(`Cannot build ${n}`);
}

export function toBefunge(text) {
  const bytes = utf8(text).reverse();
  let code = '';
  let inString = false;
  for (const b of bytes) {
    const plain = b >= 32 && b < 127 && b !== 34;
    if (plain && !inString) (code += '"'), (inString = true);
    if (!plain && inString) (code += '"'), (inString = false);
    code += plain ? String.fromCharCode(b) : bfgNumber(b);
  }
  if (inString) code += '"';
  return `${code}>:#,_@`;
}

/**
 * A full Befunge-93 machine: the whole command set, a playfield programs can
 * rewrite (p/g), and multi-line programs. There is no input, so & and ~ give -1.
 */
export function bfgMachine(code) {
  const lines = code.replace(/\r/g, '').split('\n');
  const width = Math.max(80, ...lines.map((r) => r.length));
  const height = Math.max(25, lines.length);
  const grid = Array.from({ length: height }, (_, y) => Array.from((lines[y] || '').padEnd(width, ' '), (c) => c.charCodeAt(0)));
  const lineStart = [];
  lines.reduce((off, line, y) => ((lineStart[y] = off), off + line.length + 1), 0);
  const s = { x: 0, y: 0, dx: 1, dy: 0, stack: [], out: [], steps: 0, done: false, str: false };
  const pop = () => (s.stack.length ? s.stack.pop() : 0);
  const move = () => {
    s.x = (s.x + s.dx + width) % width;
    s.y = (s.y + s.dy + height) % height;
  };
  const go = (dx, dy) => ((s.dx = dx), (s.dy = dy));
  return {
    state: s,
    grid,
    row: (y) => String.fromCharCode(...grid[y]),
    pos: () => (s.y < lines.length && s.x < lines[s.y].length ? lineStart[s.y] + s.x : -1),
    step() {
      if (s.done) return false;
      const c = String.fromCharCode(grid[s.y][s.x]);
      s.steps++;
      if (s.str) {
        if (c === '"') s.str = false;
        else s.stack.push(c.charCodeAt(0));
        move();
        return true;
      }
      switch (c) {
        case '+': s.stack.push(pop() + pop()); break;
        case '-': { const b = pop(); s.stack.push(pop() - b); break; }
        case '*': s.stack.push(pop() * pop()); break;
        case '/': { const b = pop(); const a = pop(); s.stack.push(b ? Math.trunc(a / b) : 0); break; }
        case '%': { const b = pop(); const a = pop(); s.stack.push(b ? a % b : 0); break; }
        case '!': s.stack.push(pop() ? 0 : 1); break;
        case '`': { const b = pop(); s.stack.push(pop() > b ? 1 : 0); break; }
        case '>': go(1, 0); break;
        case '<': go(-1, 0); break;
        case '^': go(0, -1); break;
        case 'v': go(0, 1); break;
        case '?': [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)].forEach((v, k) => (k ? (s.dy = v) : (s.dx = v))); break;
        case '_': pop() ? go(-1, 0) : go(1, 0); break;
        case '|': pop() ? go(0, -1) : go(0, 1); break;
        case '"': s.str = true; break;
        case ':': { const v = pop(); s.stack.push(v, v); break; }
        case '\\': { const b = pop(); const a = pop(); s.stack.push(b, a); break; }
        case '$': pop(); break;
        case '.': s.out.push(...utf8(`${pop()} `)); break;
        case ',': s.out.push(pop() & 255); break;
        case '#': move(); break;
        case 'p': { const y = pop(); const x = pop(); const v = pop(); if (grid[y]?.[x] !== undefined) grid[y][x] = v & 255; break; }
        case 'g': { const y = pop(); const x = pop(); s.stack.push(grid[y]?.[x] ?? 0); break; }
        case '&': case '~': s.stack.push(-1); break;
        case '@': s.done = true; return false;
        case ' ': break;
        default:
          if (c >= '0' && c <= '9') s.stack.push(Number(c));
          else throw new Error(`Befunge: unknown command "${c}" at line ${s.y + 1}, column ${s.x + 1}`);
      }
      move();
      return true;
    },
  };
}

// =================================================================== Unary
// A Unary program is a single character repeated N times, where N is the
// Brainfuck program written in binary (3 bits per command, after a leading 1).
const UNARY_BITS = { '>': '000', '<': '001', '+': '010', '-': '011', '.': '100', ',': '101', '[': '110', ']': '111' };

export function toUnary(text) {
  const bf = toBrainfuck(text);
  const bits = `1${Array.from(bf, (c) => UNARY_BITS[c]).join('')}`;
  const n = BigInt(`0b${bits}`);
  const digits = n.toString();
  return { bf, bits, n, digits, length: digits.length };
}

// ============================================================ convenience
export const LANGS = [
  {
    id: 'brainfuck',
    name: 'Brainfuck',
    year: 'Urban Müller, 1993',
    blurb: 'Eight commands, one tape of bytes and a pointer. Tiny but Turing-complete.',
    how: '+ and - change the current cell, > and < move along the tape, [ ] loop while the cell isn’t 0, and . prints it. Big jumps use a multiplication loop on the next cell.',
  },
  {
    id: 'ook',
    name: 'Ook!',
    year: 'David Morgan-Mar, 2001',
    blurb: 'Brainfuck for orangutans. Every command is two “Ook” words.',
    how: 'The same program as Brainfuck, with each command spelled as a pair: “Ook. Ook.” is +, “Ook! Ook.” prints, and so on.',
  },
  {
    id: 'whitespace',
    name: 'Whitespace',
    year: 'Edwin Brady & Chris Morris, 2003',
    blurb: 'Only spaces, tabs and line breaks mean anything. Everything else is a comment, so the program is invisible.',
    how: 'For each character: push its code (binary, space = 0, tab = 1), then print it. Shown here as · for space, → for tab and ↵ for line break; copying gives the real invisible program.',
  },
  {
    id: 'malbolge',
    name: 'Malbolge',
    year: 'Ben Olmstead, 1998',
    blurb: 'Designed to be nearly impossible to program. It works in base 3, and its code rewrites itself after every instruction.',
    how: 'Generated by searching for short runs of rotate and “crazy” ternary operations that leave each next character in register a, then printing it. Every program is checked by running it.',
  },
  {
    id: 'befunge',
    name: 'Befunge',
    year: 'Chris Pressey, 1993',
    blurb: 'A two-dimensional language: the instruction pointer moves around a grid in any direction.',
    how: 'Pushes your text backwards in string mode, then >:#,_@ loops printing until the stack is empty. Lines over 80 columns need a Befunge-98 interpreter.',
  },
  {
    id: 'unary',
    name: 'Unary',
    year: 'Lahey, 2007',
    blurb: 'A program is one character repeated over and over. Only the length matters.',
    how: 'The Brainfuck program is written in binary (3 bits per command, after a leading 1); a Unary program is that many zeros. It’s far too long to ever store, so you get its exact length instead.',
  },
];

/**
 * Straight-line Malbolge can only reach 201 of the 256 byte values (a register
 * that is never jumped over only takes 355 distinct values), which covers all
 * of ASCII but not the high bytes UTF-8 needs. So accents are dropped (é -> e)
 * and any other non-ASCII character becomes "?".
 */
export function asciiOnly(text) {
  const replaced = new Set();
  const out = Array.from(String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, ''), (c) => {
    if (c.codePointAt(0) < 128) return c;
    replaced.add(c);
    return '?';
  }).join('');
  return { text: out, replaced: [...replaced] };
}

/**
 * Build the program for a language.
 * @returns {{ code: string, prints: string, note?: string, unary?: object }}
 *   prints: exactly what the program outputs when run
 */
export function compile(text, lang) {
  if (lang === 'brainfuck') return { code: toBrainfuck(text), prints: text };
  if (lang === 'ook') return { code: toOok(text), prints: text };
  if (lang === 'whitespace') return { code: toWhitespace(text), prints: text };
  if (lang === 'befunge') return { code: toBefunge(text), prints: text };
  if (lang === 'malbolge') {
    const safe = asciiOnly(text);
    const note = safe.replaced.length
      ? `Malbolge here can only print plain ASCII, so ${safe.replaced.join(' ')} became “?” when it runs (accents are dropped). The copied program carries your exact text invisibly, so Program → text gives it back.`
      : '';
    const code = toMalbolge(safe.text);
    // `copy` is what Copy program puts on the clipboard: the program plus an
    // invisible copy of the original text when Malbolge can't print all of it.
    return { code, prints: safe.text, note, copy: safe.text !== text ? withHidden(code, text) : code };
  }
  if (lang === 'unary') {
    const u = toUnary(text);
    return { code: u.digits, prints: text, unary: u };
  }
  throw new Error(`Unknown language ${lang}`);
}

/** A machine that runs a compiled program step by step. */
export function machineFor(lang, compiled) {
  if (lang === 'brainfuck') return bfMachine(compiled.code);
  if (lang === 'ook') return bfMachine(ookToBrainfuck(compiled.code));
  if (lang === 'unary') return bfMachine(compiled.unary.bf);
  if (lang === 'whitespace') return wsMachine(compiled.code);
  if (lang === 'malbolge') return mbMachine(compiled.code);
  if (lang === 'befunge') return bfgMachine(compiled.code);
  throw new Error(`Unknown language ${lang}`);
}

// ======================================================= running pasted code
const UNARY_BACK = Object.fromEntries(Object.entries(UNARY_BITS).map(([k, v]) => [v, k]));

/** A Unary program's length (or the zeros themselves) -> the Brainfuck it encodes. */
export function unaryToBrainfuck(code) {
  const t = String(code).trim();
  const n = /^0+$/.test(t) ? BigInt(t.length) : BigInt(t);
  const bits = n.toString(2);
  if (bits[0] !== '1' || (bits.length - 1) % 3) throw new Error('That length is not a valid Unary program');
  let bf = '';
  for (let i = 1; i < bits.length; i += 3) bf += UNARY_BACK[bits.slice(i, i + 3)];
  return bf;
}

/** Guess which language a pasted program is written in (or null). */
export function detectLanguage(code) {
  const t = stripHidden(String(code));
  if (!t.trim()) return /[ \t]/.test(t) && t.includes('\n') ? 'whitespace' : null;
  if (/[·→↵]/.test(t) && !t.replace(/[·→↵\s]/g, '')) return 'whitespace';
  if (/\bOok[.!?]/.test(t)) return 'ook';
  if (/^\s*\d+\s*$/.test(t)) return 'unary';
  const body = t.trim();
  if (body.length >= 20 && !/\s/.test(body)) {
    try {
      mbMachine(body);
      return 'malbolge';
    } catch {
      /* not Malbolge */
    }
  }
  if (body.includes('@') && /[v^<>_|]/.test(body) && /["0-9,.]/.test(body)) return 'befunge';
  if ((body.match(/[+\-<>[\].,]/g) || []).length >= 3) return 'brainfuck';
  return null;
}

/** Turn pasted code into the object the machines and code view use. */
export function loadProgram(raw, lang) {
  const code = stripHidden(String(raw));
  if (lang === 'unary') {
    const t = String(code).trim();
    const bf = unaryToBrainfuck(t);
    const digits = /^0+$/.test(t) ? String(t.length) : BigInt(t).toString();
    return { code: digits, unary: { bf, digits, length: digits.length } };
  }
  if (lang === 'whitespace' && /[·→↵]/.test(code)) {
    // The app's visible form: · space, → tab, ↵ line break.
    return { code: code.replace(/[ \t\n\r]/g, '').replace(/·/g, ' ').replace(/→/g, '\t').replace(/↵/g, '\n') };
  }
  if (lang === 'malbolge') return { code: String(code).trim() };
  // Pasted Ook! often has line breaks or extra spaces; keep just the words, one space apart.
  if (lang === 'ook') return { code: (String(code).match(/Ook[.!?]/g) || []).join(' ') };
  return { code: String(code) };
}

/** Run to the end (with a step limit) and return the printed text. */
/**
 * The exact text a pasted program was made from, when it carries an invisible
 * copy (Malbolge programs for non-ASCII text) and compiling that copy gives
 * this very program; otherwise null.
 */
export function hiddenText(raw, lang) {
  const { visible, original } = reveal(String(raw));
  if (original === null || lang !== 'malbolge') return null;
  return compile(original, 'malbolge').code === visible.trim() ? original : null;
}

export function runToEnd(lang, compiled, limit = 20_000_000) {
  const m = machineFor(lang, compiled);
  while (m.step()) if (m.state.steps > limit) throw new Error('Step limit reached');
  return new TextDecoder().decode(new Uint8Array(m.state.out));
}
