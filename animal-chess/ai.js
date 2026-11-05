// Computer opponent: negamax alpha-beta with iterative deepening, a transposition table and a capture-only quiescence search.
// Works on a mutable copy of the board; the rules come from rules.js so the AI can never play an illegal move.
import { N, W, DEN, WATER, TRAP_OWNER, RAT, ELEPHANT, targetsFrom, sideOf, rankOf, xOf, yOf, legalMoves } from './rules.js';

const VALUE = [0, 500, 200, 300, 350, 500, 800, 900, 1000];
const ADV = [0, 7, 6, 7, 7, 9, 12, 12, 9];
const WIN = 100000;
const INF = 1e9;

export const LEVELS = {
  easy: { maxDepth: 2, timeMs: 150, margin: 160, blunder: 0.25 },
  normal: { maxDepth: 5, timeMs: 450, margin: 45, blunder: 0.03 },
  hard: { maxDepth: 14, timeMs: 1400, margin: 0, blunder: 0 },
};

// Zobrist keys (32-bit) for every (square, piece code) and the side to move.
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const Z = Array.from({ length: N }, () => { const a = new Uint32Array(19); for (let c = 0; c < 19; c++) a[c] = rnd(); return a; });
const ZSIDE = rnd();

export function hashBoard(b, turn) {
  let h = turn ? ZSIDE : 0;
  for (let i = 0; i < N; i++) if (b[i]) h ^= Z[i][b[i]];
  return h >>> 0;
}

function denDistance(i, side) {
  const d = DEN[1 - side];
  return Math.abs(xOf(i) - xOf(d)) + Math.abs(yOf(i) - yOf(d));
}

/** Static evaluation from `side`'s point of view. */
export function evaluate(b, side) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const c = b[i];
    if (!c) continue;
    const own = sideOf(c), r = rankOf(c);
    let v = VALUE[r];
    const dist = denDistance(i, own);
    v += ADV[r] * (13 - dist);
    if (dist === 1) v += 160; // standing next to the enemy den
    if (TRAP_OWNER[i] !== -1 && TRAP_OWNER[i] !== own) v -= VALUE[r] / 4; // powerless in an enemy trap
    if (r === RAT && WATER[i]) v += 20;
    s += own === side ? v : -v;
  }
  return s;
}

function genMoves(b, side) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const c = b[i];
    if (c && sideOf(c) === side) for (const to of targetsFrom(b, i)) out.push(i * 64 + to);
  }
  return out;
}

function hasPieces(b, side) {
  for (let i = 0; i < N; i++) if (b[i] && sideOf(b[i]) === side) return true;
  return false;
}

/**
 * Pick a move.
 * state: { b, turn }  options: { level, history: [hash,...] recent positions (for avoiding repetition), random }
 * Returns { from, to, depth, score, nodes }.
 */
export function chooseMove(state, options = {}) {
  const cfg = LEVELS[options.level] || LEVELS.normal;
  const random = options.random || Math.random;
  const b = state.b.slice();
  const root = state.turn;
  const legal = legalMoves({ ...state, winner: null });
  if (!legal.length) return null;
  if (legal.length === 1) return { ...legal[0], depth: 0, score: 0, nodes: 0 };

  // Immediate den entry always wins.
  const winning = legal.find((m) => m.to === DEN[1 - root]);
  if (winning) return { ...winning, depth: 1, score: WIN, nodes: 1 };

  const seen = new Map();
  for (const h of options.history || []) seen.set(h, (seen.get(h) || 0) + 1);
  const tt = new Map();
  const deadline = Date.now() + cfg.timeMs;
  let nodes = 0, stop = false;
  const path = [];

  function order(moves, side, ttMove) {
    const scored = moves.map((m) => {
      const from = (m / 64) | 0, to = m % 64;
      let k = 0;
      if (m === ttMove) k = 1e7;
      else if (to === DEN[1 - side]) k = 1e6;
      else if (b[to]) k = 1e4 + VALUE[rankOf(b[to])] * 10 - VALUE[rankOf(b[from])];
      else k = (denDistance(from, side) - denDistance(to, side)) * 10;
      return [k, m];
    });
    scored.sort((a, c) => c[0] - a[0]);
    return scored.map((x) => x[1]);
  }

  function quiesce(side, alpha, beta, qdepth) {
    nodes++;
    let stand = evaluate(b, side);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qdepth <= 0) return stand;
    const moves = genMoves(b, side).filter((m) => b[m % 64] || m % 64 === DEN[1 - side]);
    for (const m of order(moves, side, -1)) {
      const from = (m / 64) | 0, to = m % 64;
      if (to === DEN[1 - side]) return WIN - path.length;
      const cap = b[to];
      b[to] = b[from]; b[from] = 0;
      let score;
      if (!hasPieces(b, 1 - side)) score = WIN - path.length - 1;
      else score = -quiesce(1 - side, -beta, -alpha, qdepth - 1);
      b[from] = b[to]; b[to] = cap;
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(side, depth, alpha, beta) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    const h = hashBoard(b, side);
    if (path.length && (path.includes(h) || (seen.get(h) || 0) >= 1)) return 0; // repetition counts as a draw
    if (depth <= 0) return quiesce(side, alpha, beta, 4);
    const entry = tt.get(h);
    if (entry && entry.depth >= depth) {
      if (entry.flag === 0) return entry.score;
      if (entry.flag === 1 && entry.score >= beta) return entry.score;
      if (entry.flag === -1 && entry.score <= alpha) return entry.score;
    }
    const moves = genMoves(b, side);
    if (!moves.length) return -(WIN - path.length);
    const a0 = alpha;
    let best = -INF, bestMove = -1;
    path.push(h);
    for (const m of order(moves, side, entry ? entry.move : -1)) {
      const from = (m / 64) | 0, to = m % 64;
      let score;
      if (to === DEN[1 - side]) score = WIN - path.length;
      else {
        const cap = b[to];
        b[to] = b[from]; b[from] = 0;
        score = hasPieces(b, 1 - side) ? -search(1 - side, depth - 1, -beta, -alpha) : WIN - path.length;
        b[from] = b[to]; b[to] = cap;
      }
      if (stop) break;
      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    path.pop();
    if (!stop) tt.set(h, { depth, score: best, move: bestMove, flag: best <= a0 ? -1 : best >= beta ? 1 : 0 });
    return best;
  }

  let rootMoves = legal.map((m) => m.from * 64 + m.to);
  let result = null;
  for (let depth = 1; depth <= cfg.maxDepth; depth++) {
    const scores = new Map();
    let best = -INF;
    const h0 = hashBoard(b, root);
    path.push(h0);
    for (const m of order(rootMoves, root, result ? result.move : -1)) {
      const from = (m / 64) | 0, to = m % 64;
      const cap = b[to];
      b[to] = b[from]; b[from] = 0;
      // Exact scores for every move within `margin` of the best so far; bounds are enough for the rest.
      const floor = best === -INF ? -INF : best - cfg.margin - 1;
      const score = hasPieces(b, 1 - root) ? -search(1 - root, depth - 1, -INF, -floor) : WIN;
      b[from] = b[to]; b[to] = cap;
      if (stop) break;
      scores.set(m, score);
      if (score > best) best = score;
    }
    path.pop();
    if (stop && result) break;
    const ranked = [...scores.entries()].sort((a, c) => c[1] - a[1]);
    if (!ranked.length) break;
    const top = ranked[0][1];
    // Never soften a forced win or walk into a forced loss.
    const margin = Math.abs(top) > WIN / 2 ? 0 : cfg.margin;
    const pool = ranked.filter(([, s]) => s >= top - margin);
    const pick = pool[Math.floor(random() * pool.length)];
    result = { move: pick[0], score: pick[1], depth, ranked };
    rootMoves = ranked.map((x) => x[0]);
    if (stop || Math.abs(top) > WIN / 2) break;
  }

  let move = result.move;
  // Occasional human-like slip on easier levels: a random move that does not lose immediately.
  if (cfg.blunder && random() < cfg.blunder) {
    const safe = result.ranked.filter(([, s]) => s > -WIN / 2).map((x) => x[0]);
    if (safe.length) move = safe[Math.floor(random() * safe.length)];
  }
  return { from: (move / 64) | 0, to: move % 64, depth: result.depth, score: result.score, nodes };
}

export { WIN, ELEPHANT };
