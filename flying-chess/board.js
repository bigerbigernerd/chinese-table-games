// Flying Chess (Aeroplane Chess, 飞行棋) board geometry and movement. The track is DEPTH units deep with 1-unit tiles;
// DEPTH = 1 draws square tiles on a 13-unit board (DEPTH = 2 gives 1x2 tiles on a 17-unit board).
// Board units: an N x N square; seat 0 airport top-left, then clockwise.
export const BOARD = { ringSize: 52, launch: 0, ringFirst: 1, ringLast: 50, homeFirst: 51, finish: 56, flightFrom: 18, flightTo: 30, crossedHome: 53 };
export const DEPTH = 1;
const t = DEPTH;
export const N = 4 * t + 9;          // 13: track, 2 tiles, bend, 5-tile arm, bend, 2 tiles, track
export const AIRPORT = t + 2;        // airports fill the corners inside the track's notches
export const HOME_STEP = 0.9;        // home-lane spacing; the third lane square stays where the fly-over line crosses
const C = N / 2;

export const rotatePoint = ([x, y], quarter) => {
  for (let i = 0; i < ((quarter % 4) + 4) % 4; i++) [x, y] = [N - y, x];
  return [x, y];
};
// Where a seat's geometry lands: the drawing below is one quarter as seen by seat 0, mirrored left-right and then
// turned one quarter anticlockwise per seat. The mirror makes planes travel clockwise, the standard direction
// (the unmirrored drawing would run anticlockwise); game.js passes turns clockwise to match.
export const seatPoint = ([x, y], seat) => rotatePoint([N - x, y], -seat);
const rectangle = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
// One quarter of the board: corner, outer arm, corner, two tiles inward, diagonal bend, two tiles outward.
const quarter = [
  [[t + 2, t], [2 * t + 2, 0], [2 * t + 2, t]], ...[0, 1, 2, 3, 4].map((i) => rectangle(2 * t + 2 + i, 0, 1, t)),
  [[2 * t + 7, 0], [3 * t + 7, t], [2 * t + 7, t]], rectangle(2 * t + 7, t, t, 1), rectangle(2 * t + 7, t + 1, t, 1),
  [[2 * t + 7, t + 2], [3 * t + 7, t + 2], [2 * t + 7, 2 * t + 2]], [[3 * t + 7, t + 2], [3 * t + 7, 2 * t + 2], [2 * t + 7, 2 * t + 2]],
  rectangle(3 * t + 7, t + 2, 1, t), rectangle(3 * t + 8, t + 2, 1, t),
];
export const RING_TILES = Array.from({ length: 52 }, (_, index) => {
  const polygon = quarter[index % 13].map((p) => seatPoint(p, Math.floor(index / 13)));
  const center = [polygon.reduce((s, p) => s + p[0], 0) / polygon.length, polygon.reduce((s, p) => s + p[1], 0) / polygon.length];
  return { index, polygon, center, color: (index + 1) % 4 };
});
export const TRACK = RING_TILES.map((p) => p.center);
export const LAUNCH_POLYGON = [[t + 2, 0], [2 * t + 2, 0], [t + 2, t]];
// Home lane k (0..4) centre, before rotation; k = 2 is the square the fly-over line crosses.
export const homePoint = (k) => [C, t + 2 + t / 3 + (k - 2) * HOME_STEP]; // t + 2 + t/3: height of the fly-over line
export const HOME_TILE = HOME_STEP - 0.08;
// The centre square (finish), split into four triangles; it starts just past the last home square.
export const CENTER_HALF = C - (homePoint(4)[1] + HOME_TILE / 2) - 0.06;
export const isRing = (progress) => progress >= BOARD.ringFirst && progress <= BOARD.ringLast;
// Progress -> shared ring cell for a seat (the route follows the launch arrows and fly-over arrows).
export const cell = (seat, progress) => (seat * 13 - (progress - 1) + 52) % 52;

export function boardPosition(seat, piece, progress) {
  if (progress < 0) return seatPoint([(piece % 2 === 0 ? 1 : 3) * AIRPORT / 4, (piece < 2 ? 1 : 3) * AIRPORT / 4], seat);
  if (progress === 0) return seatPoint([(4 * t + 6) / 3, t / 3], seat);
  if (isRing(progress)) return TRACK[cell(seat, progress)];
  if (progress >= BOARD.finish) return seatPoint([C, C], seat);
  return seatPoint(homePoint(progress - BOARD.homeFirst), seat);
}

/** Squares visited (travel) and squares where the plane stops (stops: landing, colour jump, fly-over). */
export function movement(progress, dice) {
  if (progress < 0) return { travel: [0], stops: [0], flight: false };
  const travel = []; let direction = 1, current = progress;
  for (let i = 0; i < dice; i++) { if (current === BOARD.finish) direction = -1; current += direction; travel.push(current); }
  const stops = [current]; let flight = false;
  if (current === BOARD.flightFrom) { stops.push(BOARD.flightTo, BOARD.flightTo + 4); flight = true; }
  else if (current < BOARD.ringLast && current % 4 === 2) { stops.push(current + 4); if (current + 4 === BOARD.flightFrom) { stops.push(BOARD.flightTo); flight = true; } }
  travel.push(...stops.slice(1));
  return { travel, stops, flight };
}

export function movementLeg(from, to) {
  if (to < 0) return { kind: 'capture', duration: 380, hold: 0 };
  if (from < 0) return { kind: 'launch', duration: 320, hold: 100 };
  if (Math.abs(to - from) > 4) return { kind: 'flight', duration: 560, hold: 120 };
  if (Math.abs(to - from) > 1) return { kind: 'jump', duration: 380, hold: 110 };
  return { kind: 'step', duration: 140, hold: 40 };
}
export function movementDuration(from, travel) {
  let duration = 200, previous = from;
  for (const to of travel) { const leg = movementLeg(previous, to); duration += leg.duration + leg.hold; previous = to; }
  return duration;
}
