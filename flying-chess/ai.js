// Plane choice for computer players: finish > capture > fly/jump > take off > progress, and avoid stopping right in
// front of an enemy plane. `random` adds a little human-like variety.
import { BOARD, cell, isRing } from './board.js';
import { moveRoute, wouldCapture } from './game.js';

function threatenedAt(s, seat, progress) {
  if (!isRing(progress)) return 0;
  const target = cell(seat, progress);
  let n = 0;
  for (const enemy of s.players) {
    if (enemy.seat === seat) continue;
    for (const pos of enemy.pieces) {
      if (!isRing(pos)) continue;
      // enemy cells advance by decreasing index: an enemy 1..6 squares behind can land on us
      const d = (cell(enemy.seat, pos) - target + 52) % 52;
      if (d >= 1 && d <= 6) n++;
    }
  }
  return n;
}

export function scoreChoice(s, piece) {
  const seat = s.turn, from = s.players[seat].pieces[piece];
  const route = moveRoute(s, piece), to = route.travel.at(-1);
  let v = to;
  if (to === BOARD.finish) v += 500;
  v += wouldCapture(s, piece) * 120;
  if (route.flight) v += 30;
  if (from >= 0 && to - from > s.dice) v += 15;
  if (from < 0) v += 40;
  if (to >= BOARD.homeFirst && from < BOARD.homeFirst) v += 25; // safe in the home lane
  v -= threatenedAt(s, seat, to) * 22;
  v += threatenedAt(s, seat, from) * 18; // moving a plane out of danger
  return v;
}

export function chooseChoice(s, { random = Math.random, noise = 12 } = {}) {
  if (!s.choices.length) return null;
  let best = s.choices[0], bestV = -Infinity;
  for (const k of s.choices) {
    const v = scoreChoice(s, k) + (noise ? (random() - 0.5) * noise : 0);
    if (v > bestV) { bestV = v; best = k; }
  }
  return best;
}
