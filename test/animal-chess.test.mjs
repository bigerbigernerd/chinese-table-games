import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idx, initialState, legalMoves, applyMove, isLegal, targetsFrom, canCapture, pieceCode, DEN, DRAW_PLIES,
  RAT, CAT, DOG, WOLF, LEOPARD, TIGER, LION, ELEPHANT, N,
} from '../animal-chess/rules.js';
import { chooseMove } from '../animal-chess/ai.js';

const empty = () => new Array(N).fill(0);
const st = (b, turn = 0) => ({ b, turn, ply: 0, quiet: 0, winner: null, reason: null, last: null });
const P = (side, rank) => pieceCode(side, rank);
const sorted = (a) => [...a].sort((x, y) => x - y);

test('initial position matches the standard layout', () => {
  const s = initialState();
  assert.equal(s.b[idx(0, 8)], P(0, TIGER));
  assert.equal(s.b[idx(6, 8)], P(0, LION));
  assert.equal(s.b[idx(6, 6)], P(0, RAT));
  assert.equal(s.b[idx(0, 6)], P(0, ELEPHANT));
  assert.equal(s.b[idx(0, 0)], P(1, LION));
  assert.equal(s.b[idx(6, 0)], P(1, TIGER));
  assert.equal(s.b[idx(0, 2)], P(1, RAT));
  assert.equal(s.b[idx(6, 2)], P(1, ELEPHANT));
  assert.equal(s.b.filter(Boolean).length, 16);
  assert.equal(s.turn, 0);
  assert.equal(legalMoves(s).length, 24);
});

test('only the rat swims', () => {
  const b = empty();
  b[idx(0, 4)] = P(0, RAT); b[idx(3, 4)] = P(0, DOG);
  assert.deepEqual(sorted(targetsFrom(b, idx(0, 4))), sorted([idx(1, 4), idx(0, 3), idx(0, 5)]));
  assert.deepEqual(sorted(targetsFrom(b, idx(3, 4))), sorted([idx(3, 3), idx(3, 5)]));
});

test('lion and tiger jump rivers both ways; a rat in the water blocks', () => {
  const b = empty();
  b[idx(0, 4)] = P(0, LION);
  assert.ok(targetsFrom(b, idx(0, 4)).includes(idx(3, 4)), 'horizontal jump');
  b[idx(1, 6)] = P(0, TIGER);
  assert.ok(targetsFrom(b, idx(1, 6)).includes(idx(1, 2)), 'vertical jump');
  b[idx(1, 4)] = P(1, RAT);
  assert.ok(!targetsFrom(b, idx(1, 6)).includes(idx(1, 2)), 'blocked by enemy rat');
  assert.ok(!targetsFrom(b, idx(0, 4)).includes(idx(3, 4)), 'horizontal blocked too');
  b[idx(1, 4)] = P(0, RAT);
  assert.ok(!targetsFrom(b, idx(1, 6)).includes(idx(1, 2)), 'blocked by own rat');
  b[idx(2, 6)] = P(0, LEOPARD);
  assert.ok(!targetsFrom(b, idx(2, 6)).includes(idx(2, 2)), 'leopard cannot jump');
});

test('jump landing captures by rank', () => {
  const b = empty();
  b[idx(1, 6)] = P(0, TIGER); b[idx(1, 2)] = P(1, LION);
  assert.ok(!targetsFrom(b, idx(1, 6)).includes(idx(1, 2)), 'tiger cannot take lion');
  b[idx(1, 2)] = P(1, WOLF);
  assert.ok(targetsFrom(b, idx(1, 6)).includes(idx(1, 2)), 'tiger takes wolf');
});

test('rank captures, rat and elephant', () => {
  const b = empty();
  b[idx(3, 4)] = P(0, CAT); b[idx(3, 3)] = P(1, DOG);
  assert.equal(canCapture(b, idx(3, 4), idx(3, 3)), false);
  assert.equal(canCapture(b, idx(3, 3), idx(3, 4)), true);
  b[idx(0, 2)] = P(0, RAT); b[idx(0, 1)] = P(1, ELEPHANT);
  assert.equal(canCapture(b, idx(0, 2), idx(0, 1)), true, 'rat takes elephant');
  assert.equal(canCapture(b, idx(0, 1), idx(0, 2)), false, 'elephant cannot take rat');
  b[idx(6, 0)] = P(1, CAT); b[idx(5, 0)] = P(0, CAT);
  assert.equal(canCapture(b, idx(5, 0), idx(6, 0)), true, 'equal rank');
});

test('rat cannot capture across the water edge, and is safe in water', () => {
  const b = empty();
  b[idx(1, 3)] = P(0, RAT); b[idx(1, 2)] = P(1, ELEPHANT);
  assert.equal(canCapture(b, idx(1, 3), idx(1, 2)), false, 'from water onto land');
  b[idx(2, 3)] = P(1, RAT);
  assert.equal(canCapture(b, idx(1, 3), idx(2, 3)), true, 'rat in water takes rat in water');
  b[idx(0, 3)] = P(1, RAT);
  assert.equal(canCapture(b, idx(0, 3), idx(1, 3)), false, 'rat on land cannot take rat in water');
});

test('traps: rank 0 for the trapped animal, both ways', () => {
  const b = empty();
  // Blue lion in Red's trap at (3,1); Red rat next to it.
  b[idx(3, 1)] = P(0, LION); b[idx(3, 2)] = P(1, RAT);
  assert.equal(canCapture(b, idx(3, 2), idx(3, 1)), true, 'rat takes trapped lion');
  assert.equal(canCapture(b, idx(3, 1), idx(3, 2)), false, 'trapped lion is powerless');
  // A defender standing in its own trap keeps its rank.
  const c = empty();
  c[idx(3, 1)] = P(1, CAT); c[idx(3, 2)] = P(0, LION);
  assert.equal(canCapture(c, idx(3, 2), idx(3, 1)), true, 'lion takes cat in its own trap');
  c[idx(3, 1)] = P(1, ELEPHANT); c[idx(3, 2)] = P(0, DOG);
  assert.equal(canCapture(c, idx(3, 2), idx(3, 1)), false, 'dog cannot take elephant in its own trap');
  // Elephant may take a rat that sits in the elephant's trap.
  const d = empty();
  d[idx(3, 7)] = P(1, RAT); d[idx(3, 6)] = P(0, ELEPHANT);
  assert.equal(canCapture(d, idx(3, 6), idx(3, 7)), true);
});

test('never into your own den; entering the enemy den wins', () => {
  const b = empty();
  b[idx(3, 7)] = P(0, DOG); b[idx(3, 1)] = P(0, CAT); b[idx(0, 0)] = P(1, RAT);
  assert.ok(!targetsFrom(b, idx(3, 7)).includes(DEN[0]));
  const s = st(b, 0);
  assert.ok(isLegal(s, { from: idx(3, 1), to: DEN[1] }));
  const n = applyMove(s, { from: idx(3, 1), to: DEN[1] });
  assert.equal(n.winner, 0);
  assert.equal(n.reason, 'den');
});

test('capturing the last animal wins; quiet plies draw', () => {
  const b = empty();
  b[idx(3, 4)] = P(0, LION); b[idx(3, 3)] = P(1, DOG);
  const n = applyMove(st(b), { from: idx(3, 4), to: idx(3, 3) });
  assert.equal(n.winner, 0);
  assert.equal(n.reason, 'wipeout');
  const c = empty();
  c[idx(0, 4)] = P(0, CAT); c[idx(6, 4)] = P(1, CAT);
  const q = { ...st(c), quiet: DRAW_PLIES - 1 };
  const m = applyMove(q, { from: idx(0, 4), to: idx(0, 3) });
  assert.equal(m.winner, 'draw');
});

test('move description flags capture, jump, swim and trap', () => {
  const b = empty();
  b[idx(0, 4)] = P(0, LION); b[idx(3, 4)] = P(1, DOG); b[idx(6, 0)] = P(1, CAT);
  const n = applyMove(st(b), { from: idx(0, 4), to: idx(3, 4) });
  assert.equal(n.last.jumped, true);
  assert.equal(n.last.captured, P(1, DOG));
  const c = empty();
  c[idx(0, 3)] = P(0, RAT); c[idx(6, 0)] = P(1, CAT);
  assert.equal(applyMove(st(c), { from: idx(0, 3), to: idx(1, 3) }).last.swim, true);
  const d = empty();
  d[idx(2, 1)] = P(0, DOG); d[idx(6, 0)] = P(1, CAT);
  assert.equal(applyMove(st(d), { from: idx(2, 1), to: idx(2, 0) }).last.trapped, true);
});

test('AI takes a winning den entry and a free capture', () => {
  const b = empty();
  b[idx(3, 1)] = P(1, CAT); // Blue to move: dog next to Red den? use (2,0)->(3,0)
  b[idx(2, 0)] = P(0, DOG); b[idx(6, 8)] = P(0, CAT); b[idx(0, 0)] = P(1, RAT);
  const m = chooseMove(st(b, 0), { level: 'hard' });
  assert.deepEqual([m.from, m.to], [idx(2, 0), DEN[1]]);
  const c = empty();
  c[idx(3, 4)] = P(0, LION); c[idx(3, 3)] = P(1, WOLF); c[idx(0, 0)] = P(1, RAT); c[idx(6, 8)] = P(0, CAT);
  const m2 = chooseMove(st(c, 0), { level: 'normal', random: () => 0 });
  assert.deepEqual([m2.from, m2.to], [idx(3, 4), idx(3, 3)]);
});

test('AI blocks an immediate den threat', () => {
  // Red cat stands next to Blue's den at (2,8)-> no, cat in Blue trap (3,7) threatens to enter den (3,8). Blue dog at (4,7) can take it (trapped = rank 0).
  const b = empty();
  b[idx(3, 7)] = P(1, CAT); b[idx(4, 7)] = P(0, DOG); b[idx(0, 0)] = P(1, RAT); b[idx(6, 0)] = P(1, TIGER);
  const m = chooseMove(st(b, 0), { level: 'normal', random: () => 0 });
  assert.deepEqual([m.from, m.to], [idx(4, 7), idx(3, 7)]);
});

test('AI self-play games finish with legal moves only', () => {
  let s = initialState();
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const m = chooseMove(s, { level: i % 2 ? 'easy' : 'normal', random });
    assert.ok(m && isLegal(s, m), `illegal AI move at ply ${s.ply}`);
    s = applyMove(s, m);
  }
  assert.notEqual(s.winner, null, 'game should end (den, wipeout, stuck or quiet draw)');
});
