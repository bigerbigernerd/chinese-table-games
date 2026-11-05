// Flying Chess rules: pure functions on a plain state object, usable in a browser, on a server and in tests.
// Solo mode only: four players, four planes each, first to bring all four home wins.
//  - Take off on 2, 4 or 6 (the common "evens" rule); only a 6 earns another roll; a third 6 in a row forfeits the turn.
//  - Landing on your colour jumps 4 ahead; landing on your fly-over square flies across (12) and then jumps 4;
//    jumping onto the fly-over square flies 12.
//  - Enemy planes on any square where you stop, and on the crossed home-lane square under the fly-over, go back to base.
//  - Enter the six-square home lane after the shared track; reach the centre exactly, extra steps bounce back.
import { BOARD, cell, isRing, movement } from './board.js';
export { cell } from './board.js';

export const TAKEOFF_DICE = [2, 4, 6];
export const SEATS = 4;

export function createState(names = ['', '', '', '']) {
  return {
    phase: 'lobby', players: names.map((name, seat) => ({ seat, name, pieces: [-1, -1, -1, -1] })),
    turn: 0, dice: 0, rollId: 0, sixes: 0, choices: [], turnNumber: 1, winners: [], lastMove: null, event: null, rev: 0,
  };
}

const note = (s, key, vars) => { s.event = vars ? { key, vars } : { key }; };

export function start(s, first = 0) {
  if (s.phase !== 'lobby' && s.phase !== 'finished') return false;
  s.players.forEach((p) => p.pieces.fill(-1));
  Object.assign(s, { phase: 'roll', turn: first, dice: 0, sixes: 0, choices: [], turnNumber: 1, winners: [], lastMove: null });
  note(s, 'ready', { seat: s.turn });
  return true;
}

export function movable(s) {
  return s.players[s.turn].pieces.flatMap((p, i) => (p < BOARD.finish && (p >= 0 || TAKEOFF_DICE.includes(s.dice)) ? [i] : []));
}

export function beginRoll(s) {
  if (s.phase !== 'roll') return false;
  s.phase = 'rolling'; s.dice = 0; s.choices = []; s.rollId++;
  note(s, 'rolling', { seat: s.turn });
  return true;
}

export function reveal(s, dice) {
  if (s.phase !== 'rolling' || !Number.isInteger(dice) || dice < 1 || dice > 6) return false;
  s.dice = dice; s.sixes = dice === 6 ? s.sixes + 1 : 0;
  if (s.sixes >= 3) { s.choices = []; s.phase = 'moving'; s.lastMove = null; note(s, 'tripleSix', { seat: s.turn }); return true; }
  s.choices = movable(s);
  s.phase = s.choices.length ? 'choose' : 'moving';
  if (!s.choices.length) s.lastMove = null;
  note(s, s.choices.length ? (dice === 6 ? 'rolledSix' : 'rolledChoose') : 'rolledWait', { seat: s.turn, dice });
  return true;
}

export function destination(progress, dice) { return movement(progress, dice).travel.at(-1); }

export function moveRoute(s, piece) {
  const route = movement(s.players[s.turn].pieces[piece], s.dice);
  return { ...route, yielded: 0 };
}

/** Enemy planes the move would send home (for hints and the AI), without changing the state. */
export function wouldCapture(s, piece) {
  const p = s.players[s.turn], route = moveRoute(s, piece);
  let n = 0;
  for (const enemy of s.players) {
    if (enemy.seat === p.seat) continue;
    for (const pos of enemy.pieces) {
      const landed = isRing(pos) && route.stops.some((stop) => isRing(stop) && cell(enemy.seat, pos) === cell(p.seat, stop));
      const crossed = route.flight && enemy.seat === (p.seat + 2) % 4 && pos === BOARD.crossedHome;
      if (landed || crossed) n++;
    }
  }
  return n;
}

export function move(s, piece) {
  if (s.phase !== 'choose' || !s.choices.includes(piece)) return false;
  const p = s.players[s.turn], from = p.pieces[piece], route = moveRoute(s, piece), to = route.travel.at(-1);
  p.pieces[piece] = to;
  let captured = 0;
  const victims = [];
  for (const enemy of s.players) {
    if (enemy.seat === p.seat) continue;
    enemy.pieces = enemy.pieces.map((pos, k) => {
      const landed = isRing(pos) && route.stops.some((stop) => isRing(stop) && cell(enemy.seat, pos) === cell(p.seat, stop));
      const crossed = route.flight && enemy.seat === (p.seat + 2) % 4 && pos === BOARD.crossedHome;
      if (landed || crossed) { captured++; victims.push({ seat: enemy.seat, piece: k, from: pos }); return -1; }
      return pos;
    });
  }
  const jump = from >= 0 && to - from > s.dice;
  s.lastMove = { rollId: s.rollId, seat: p.seat, piece, from, to, captured, victims, jump, travel: route.travel, flight: route.flight, dice: s.dice };
  s.choices = []; s.phase = 'moving';
  const seat = p.seat, plane = piece + 1;
  if (to === BOARD.finish) note(s, 'home', { seat, plane });
  else if (captured) note(s, 'captured', { seat, count: captured });
  else if (route.flight) note(s, 'flight', { seat });
  else if (jump) note(s, 'jump', { seat });
  else if (from < 0) note(s, 'takeoff', { seat, plane });
  else note(s, 'step', { seat, count: s.dice });
  if (p.pieces.every((pos) => pos === BOARD.finish)) finish(s, [p.seat]);
  return true;
}

export function advance(s) {
  if (s.phase !== 'moving') return;
  if (s.dice !== 6 || s.sixes >= 3 || s.players[s.turn].pieces.every((p) => p === BOARD.finish)) {
    // seats count anticlockwise round the board (board.js mirrors it), so turns pass clockwise by stepping down
    do { s.turn = (s.turn + 3) % 4; } while (s.players[s.turn].pieces.every((p) => p === BOARD.finish));
    s.sixes = 0;
  }
  s.phase = 'roll'; s.turnNumber++;
}

export function finish(s, winners) {
  s.winners = winners; s.phase = 'finished'; s.choices = [];
  note(s, 'winners', { seats: winners.join(',') });
}

/** Planes home per seat, for the scoreboard and final ranking. */
export const homeCount = (s, seat) => s.players[seat].pieces.filter((p) => p === BOARD.finish).length;
