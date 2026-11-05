// Ported from Cloud Hop tests/game.test.ts (solo-mode cases) so the shared rules stay identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, start, beginRoll, reveal, move, advance, destination, cell, wouldCapture } from '../flying-chess/game.js';
import { BOARD, RING_TILES, N, AIRPORT, boardPosition, movement, rotatePoint } from '../flying-chess/board.js';
import { chooseChoice, scoreChoice } from '../flying-chess/ai.js';

const playing = () => { const s = createState(['a', 'b', 'c', 'd']); start(s, 0); return s; };
const roll = (s, n) => { assert.equal(beginRoll(s), true); assert.equal(reveal(s, n), true); };

test('board has 52 connected cells, diagonal corners and 13 cells per colour', () => {
  assert.equal(RING_TILES.length, 52);
  assert.equal(new Set(RING_TILES.map((t) => t.center.join(','))).size, 52);
  for (let color = 0; color < 4; color++) assert.equal(RING_TILES.filter((t) => t.color === color).length, 13);
  assert.equal(RING_TILES.filter((t) => t.polygon.length === 3).length, 16);
  for (let i = 0; i < 52; i++) { const a = RING_TILES[i].center, b = RING_TILES[(i + 1) % 52].center; assert(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5); }
  // every four-sided track tile is a square (owner's request 2026-11-05; Cloud Hop's are 1 x 2)
  for (const t of RING_TILES.filter((x) => x.polygon.length === 4)) {
    const xs = t.polygon.map((p) => p[0]), ys = t.polygon.map((p) => p[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }
});

test('corner order, launch pads, home entries and straight fly-over routes', () => {
  const q = AIRPORT / 4;
  // seat 0 top-right, then anticlockwise in seat numbers; turns go 0 -> 3 -> 2 -> 1, which is clockwise
  assert.deepEqual([0, 1, 2, 3].map((s) => boardPosition(s, 0, -1)), [[N - q, q], [q, q], [q, N - q], [N - q, N - q]]);
  for (let seat = 0; seat < 4; seat++) {
    assert.notDeepEqual(boardPosition(seat, 0, 0), boardPosition(seat, 0, 1));
    assert.equal(cell(seat, 1), seat * 13);
    assert.equal(RING_TILES[cell(seat, 18)].color, seat);
    const a = boardPosition(seat, 0, 18), b = boardPosition(seat, 0, 30);
    assert(seat % 2 === 0 ? Math.abs(a[1] - b[1]) < 0.001 : Math.abs(a[0] - b[0]) < 0.001);
    // the fly-over line passes through the centre of the opposite seat's crossed home square
    const x = boardPosition((seat + 2) % 4, 0, BOARD.crossedHome);
    assert(seat % 2 === 0 ? Math.abs(x[1] - a[1]) < 0.001 : Math.abs(x[0] - a[0]) < 0.001);
  }
  assert.deepEqual(rotatePoint([1, 1], 4), [1, 1]);
  assert.deepEqual(rotatePoint([1, 1], -1), rotatePoint([1, 1], 3));
});

test('2, 4 and 6 take off; only 6 earns another roll', () => {
  for (let dice = 1; dice <= 6; dice++) {
    const s = playing(); roll(s, dice);
    assert.deepEqual(s.choices, dice % 2 === 0 ? [0, 1, 2, 3] : []);
    if (dice % 2 === 0) { assert(move(s, 1)); assert.equal(s.players[0].pieces[1], 0); } else assert.equal(move(s, 1), false);
    advance(s); assert.equal(s.turn, dice === 6 ? 0 : 3); // the next seat clockwise is seat 3
  }
  const s = playing(); s.players[0].pieces = [-1, 0, 5, 56]; roll(s, 3); assert.deepEqual(s.choices, [1, 2]);
});

test('overshoot bounces back from the centre', () => {
  const s = playing(); s.players[0].pieces[0] = 54; roll(s, 4); move(s, 0);
  assert.equal(s.players[0].pieces[0], 54);
  assert.deepEqual(s.lastMove.travel, [55, 56, 55, 54]);
});

test('the third six in a row forfeits the turn', () => {
  const s = playing();
  for (let i = 0; i < 2; i++) { roll(s, 6); move(s, i); advance(s); }
  const before = [...s.players[0].pieces]; roll(s, 6);
  assert.equal(s.phase, 'moving'); assert.equal(move(s, 0), false); assert.deepEqual(s.players[0].pieces, before);
  advance(s); assert.equal(s.turn, 3);
});

test('colour jumps and fly-over', () => {
  assert.equal(destination(0, 1), 1); assert.equal(destination(1, 1), 6);
  assert.equal(destination(13, 1), 30); assert.equal(destination(17, 1), 34);
  assert.deepEqual(movement(13, 1).stops, [14, 18, 30]); assert.deepEqual(movement(17, 1).stops, [18, 30, 34]);
  assert.equal(destination(50, 1), 51); assert.equal(destination(50, 6), 56); assert.equal(destination(55, 3), 54);
  assert.deepEqual(movement(8, 6).travel, [9, 10, 11, 12, 13, 14, 18, 30]);
});

test('captures: landing, colour-jump landing, fly-over crossing; launch pads and home lanes are safe', () => {
  let s = playing(); s.players[0].pieces[0] = 2; s.players[1].pieces = [16, 16, -1, -1];
  roll(s, 1); assert.equal(wouldCapture(s, 0), 2); move(s, 0);
  assert.deepEqual(s.players[1].pieces, [-1, -1, -1, -1]); assert.equal(s.lastMove.captured, 2); assert.equal(s.lastMove.victims.length, 2);
  s = playing(); s.players[0].pieces[0] = 13; s.players[1].pieces[0] = 0; roll(s, 1); move(s, 0); assert.equal(s.players[1].pieces[0], 0);
  s = playing(); s.players[0].pieces[0] = 1; s.players[1].pieces = [15, 19, -1, -1]; roll(s, 1); move(s, 0); assert.equal(s.lastMove.captured, 2);
  s = playing(); s.players[0].pieces[0] = 17; s.players[1].pieces = [31, 43, 47, -1]; s.players[2].pieces[0] = 53;
  roll(s, 1); move(s, 0); assert.equal(s.players[0].pieces[0], 34); assert.equal(s.lastMove.captured, 4); assert.equal(s.players[2].pieces[0], -1);
  s = playing(); s.players[0].pieces[0] = 17; s.players[2].pieces = [51, 52, 54, 55]; roll(s, 1); move(s, 0); assert.deepEqual(s.players[2].pieces, [51, 52, 54, 55]);
});

test('first to bring all four home wins; finished players are skipped', () => {
  const s = playing(); s.players[0].pieces = [56, 56, 56, 55]; roll(s, 1); move(s, 3);
  assert.equal(s.phase, 'finished'); assert.deepEqual(s.winners, [0]);
});

test('invalid and repeated actions do not change the state', () => {
  const s = playing(); const snap = structuredClone(s);
  assert.equal(move(s, 0), false); assert.equal(reveal(s, 7), false); assert.deepEqual(s, snap);
  roll(s, 6); assert.equal(beginRoll(s), false); assert.equal(move(s, 99), false);
});

test('AI prefers finishing and capturing, and avoids danger', () => {
  const s = playing(); s.players[0].pieces = [55, 2, -1, -1]; s.players[1].pieces[0] = 16; roll(s, 1);
  assert.equal(chooseChoice(s, { noise: 0 }), 0);
  s.players[0].pieces[0] = 20; assert.equal(chooseChoice(s, { noise: 0 }), 1);
  // Plane 0 would stop right in front of an enemy; plane 1 moves to a quiet square.
  const t = playing(); t.players[0].pieces = [10, 30, -1, -1];
  t.players[1].pieces = [-1, -1, -1, -1];
  roll(t, 3);
  const enemyBehind = (cell(0, 13) + 3) % 52; // an enemy 3 squares behind plane 0's landing square (13)
  t.players[2].pieces[0] = [...Array(57).keys()].find((p) => p >= 1 && p <= 50 && cell(2, p) === enemyBehind);
  assert(scoreChoice(t, 0) < 13 + 40, 'threat lowers the score');
});

test('complete AI games finish with valid positions', () => {
  let seed = 77;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let g = 0; g < 20; g++) {
    const s = createState(['a', 'b', 'c', 'd']); start(s, g % 4);
    let turns = 0;
    while (s.phase !== 'finished' && turns < 8000) {
      beginRoll(s); reveal(s, Math.floor(random() * 6) + 1);
      if (s.phase === 'choose') move(s, chooseChoice(s, { random }));
      if (s.phase === 'moving') advance(s);
      assert(s.players.every((p) => p.pieces.every((v) => v >= -1 && v <= BOARD.finish)));
      turns++;
    }
    assert.equal(s.phase, 'finished');
  }
});

test('planes travel clockwise and turns pass clockwise (owner request 2026-11-05)', () => {
  // signed area of the path a plane takes round the ring: positive = clockwise on screen (y grows downward)
  for (let seat = 0; seat < 4; seat++) {
    let area = 0;
    for (let p = 1; p < BOARD.ringLast; p++) { const [x1, y1] = boardPosition(seat, 0, p), [x2, y2] = boardPosition(seat, 0, p + 1); area += x1 * y2 - x2 * y1; }
    assert(area > 0, `seat ${seat} should go clockwise`);
  }
  // the seat after s sits one corner further clockwise: airport angle round the centre grows
  const angle = (s) => { const [x, y] = boardPosition(s, 0, -1); return Math.atan2(y - N / 2, x - N / 2); };
  const s = createState(['a', 'b', 'c', 'd']); start(s, 0);
  for (let i = 0; i < 4; i++) {
    const from = s.turn; roll(s, 1); advance(s);
    let d = angle(s.turn) - angle(from); if (d < 0) d += 2 * Math.PI;
    assert(Math.abs(d - Math.PI / 2) < 1e-9, `turn ${from} -> ${s.turn} should move one corner clockwise`);
  }
});
