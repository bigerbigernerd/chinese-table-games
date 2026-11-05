// Animal Chess (Jungle, Dou Shou Qi) rules. Pure functions shared by the browser, the AI worker and the server.
//
// Board: 7 columns x 9 rows, index = y * 7 + x, y = 0 is the top row. Side 0 (Blue) starts at the bottom and moves first.
// Piece code: 0 empty, side 0 = rank (1..8), side 1 = 10 + rank. Ranks: 1 rat, 2 cat, 3 dog, 4 wolf, 5 leopard, 6 tiger, 7 lion, 8 elephant.
// Rules used here (the common Chinese set, see the page text):
//  - one square orthogonally; never into your own den; only the rat enters water;
//  - lion and tiger jump straight across a river (both directions), blocked by any rat in the water they cross;
//  - capture equal or lower rank; the rat takes the elephant, the elephant cannot take the rat;
//  - a rat cannot capture while moving between water and land;
//  - an animal standing in an opponent's trap has rank 0 (it can be taken by anything and cannot capture);
//  - win by entering the opponent's den, capturing every enemy animal, or leaving the opponent without a legal move;
//  - this site's draw rule: 100 plies in a row without a capture.

export const W = 7, H = 9, N = W * H;
export const RAT = 1, CAT = 2, DOG = 3, WOLF = 4, LEOPARD = 5, TIGER = 6, LION = 7, ELEPHANT = 8;
export const NAMES = ['', 'rat', 'cat', 'dog', 'wolf', 'leopard', 'tiger', 'lion', 'elephant'];
export const DRAW_PLIES = 100;

export const idx = (x, y) => y * W + x;
export const xOf = (i) => i % W;
export const yOf = (i) => (i / W) | 0;
export const sideOf = (code) => (code > 10 ? 1 : 0);
export const rankOf = (code) => code % 10;
export const pieceCode = (side, rank) => side * 10 + rank;

export const DEN = [idx(3, 8), idx(3, 0)];
export const TRAPS = [[idx(2, 8), idx(4, 8), idx(3, 7)], [idx(2, 0), idx(4, 0), idx(3, 1)]];
export const WATER = new Uint8Array(N);
for (const x of [1, 2, 4, 5]) for (const y of [3, 4, 5]) WATER[idx(x, y)] = 1;
// TRAP_OWNER[i] = side owning the trap at i, or -1
export const TRAP_OWNER = new Int8Array(N).fill(-1);
TRAPS.forEach((list, side) => list.forEach((i) => { TRAP_OWNER[i] = side; }));

// Blue (side 0) at the bottom: tiger left corner, lion right corner (from Blue's view).
const SETUP_BLUE = [[0, 8, TIGER], [6, 8, LION], [1, 7, CAT], [5, 7, DOG], [0, 6, ELEPHANT], [2, 6, WOLF], [4, 6, LEOPARD], [6, 6, RAT]];

export function initialBoard() {
  const b = new Array(N).fill(0);
  for (const [x, y, r] of SETUP_BLUE) {
    b[idx(x, y)] = pieceCode(0, r);
    b[idx(W - 1 - x, H - 1 - y)] = pieceCode(1, r);
  }
  return b;
}

export function initialState() {
  return { b: initialBoard(), turn: 0, ply: 0, quiet: 0, winner: null, reason: null, last: null };
}

/** Effective rank of the piece standing on square i (0 inside an opponent's trap). */
export function effectiveRank(b, i) {
  const c = b[i];
  if (!c) return 0;
  const owner = TRAP_OWNER[i];
  return owner !== -1 && owner !== sideOf(c) ? 0 : rankOf(c);
}

/** Can the piece on `from` capture the piece on `to`? (Assumes `to` holds an enemy piece and the step is geometrically legal.) */
export function canCapture(b, from, to) {
  const a = b[from], d = b[to];
  const ra = rankOf(a), rd = rankOf(d);
  if (ra === RAT && WATER[from] !== WATER[to]) return false; // no capture while entering or leaving water
  const ea = effectiveRank(b, from);
  if (ea === 0) return false; // powerless inside an enemy trap
  const ed = effectiveRank(b, to);
  if (ed === 0) return true; // anything takes an animal in its opponent's trap
  if (ra === RAT && rd === ELEPHANT) return true;
  if (ra === ELEPHANT && rd === RAT) return false;
  return ea >= ed;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Destination squares for the piece on square i (ignores whose turn it is). */
export function targetsFrom(b, i) {
  const c = b[i];
  if (!c) return [];
  const side = sideOf(c), r = rankOf(c), out = [];
  const x0 = xOf(i), y0 = yOf(i);
  for (const [dx, dy] of DIRS) {
    let x = x0 + dx, y = y0 + dy;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    let to = idx(x, y);
    if (WATER[to] && r !== RAT) {
      if (r !== LION && r !== TIGER) continue;
      let blocked = false;
      while (x >= 0 && x < W && y >= 0 && y < H && WATER[idx(x, y)]) {
        if (rankOf(b[idx(x, y)]) === RAT) { blocked = true; break; }
        x += dx; y += dy;
      }
      if (blocked || x < 0 || x >= W || y < 0 || y >= H) continue;
      to = idx(x, y);
    }
    if (to === DEN[side]) continue;
    const t = b[to];
    if (t) {
      if (sideOf(t) === side) continue;
      if (!canCapture(b, i, to)) continue;
    }
    out.push(to);
  }
  return out;
}

export function legalMoves(s) {
  if (s.winner !== null) return [];
  const out = [];
  for (let i = 0; i < N; i++) {
    const c = s.b[i];
    if (c && sideOf(c) === s.turn) for (const to of targetsFrom(s.b, i)) out.push({ from: i, to });
  }
  return out;
}

export function isLegal(s, m) {
  if (!m || s.winner !== null) return false;
  const c = s.b[m.from];
  if (!c || sideOf(c) !== s.turn) return false;
  return targetsFrom(s.b, m.from).includes(m.to);
}

function hasMove(b, side) {
  for (let i = 0; i < N; i++) if (b[i] && sideOf(b[i]) === side && targetsFrom(b, i).length) return true;
  return false;
}

/** Apply a legal move and return the next state. Describes what happened in `last` for effects and sounds. */
export function applyMove(s, m) {
  const b = s.b.slice();
  const mover = b[m.from], captured = b[m.to];
  const side = sideOf(mover);
  const jumped = Math.abs(xOf(m.from) - xOf(m.to)) + Math.abs(yOf(m.from) - yOf(m.to)) > 1;
  b[m.to] = mover;
  b[m.from] = 0;
  const next = {
    b, turn: 1 - side, ply: s.ply + 1, quiet: captured ? 0 : s.quiet + 1, winner: null, reason: null,
    last: {
      from: m.from, to: m.to, piece: mover, captured: captured || 0, jumped,
      swim: rankOf(mover) === RAT && WATER[m.to] === 1 && WATER[m.from] === 0,
      trapped: TRAP_OWNER[m.to] !== -1 && TRAP_OWNER[m.to] !== side,
    },
  };
  if (m.to === DEN[1 - side]) { next.winner = side; next.reason = 'den'; return next; }
  if (!b.some((c) => c && sideOf(c) === 1 - side)) { next.winner = side; next.reason = 'wipeout'; return next; }
  if (!hasMove(b, 1 - side)) { next.winner = side; next.reason = 'stuck'; return next; }
  if (next.quiet >= DRAW_PLIES) { next.winner = 'draw'; next.reason = 'quiet'; }
  return next;
}

/** End the game for a reason outside the board (resign, time, left). */
export function finish(s, winner, reason) {
  return { ...s, winner, reason };
}

/** View helpers: flip a square for the player sitting on side 1 (they see their own pieces at the bottom). */
export const flip = (i) => N - 1 - i;
