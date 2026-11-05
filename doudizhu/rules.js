// Dou Dizhu (斗地主, "Fight the Landlord"): classic 54-card rules for three players, with the call-and-rob bidding
// (叫地主 / 抢地主) that most popular apps use. Pure functions on plain objects, shared by the page (computer mode,
// hints) and the server (online tables, the authoritative copy).
//
// Cards are ids 0..53. id = (rank - 3) * 4 + suit for ranks 3..15 (11 J, 12 Q, 13 K, 14 A, 15 the 2);
// suits 0 spade, 1 heart, 2 club, 3 diamond. 52 is the small joker (rank 16), 53 the big joker (rank 17).
export const SMALL = 52, BIG = 53;
export const rankOf = (id) => (id < 52 ? 3 + (id >> 2) : id === SMALL ? 16 : 17);
export const suitOf = (id) => (id < 52 ? id & 3 : -1);
export const RANK_LABEL = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JOKER', 17: 'JOKER' };
/** Highest first, as players hold them: jokers, 2s, aces ... threes. */
export const sortHand = (cards) => cards.slice().sort((a, b) => rankOf(b) - rankOf(a) || a - b);

export function counts(cards) {
  const c = new Array(18).fill(0);
  for (const id of cards) c[rankOf(id)]++;
  return c;
}

// ---------------------------------------------------------------- combinations
// A combination: { type, main, len, n }. main is the rank that decides who is bigger (highest rank of a run, the
// triple of a triple-with-kicker, the four of a four-with-two); len is the run length (1 for non-runs); n the cards.
export const TYPES = ['single', 'pair', 'triple', 'triple1', 'triple2', 'straight', 'pairs', 'plane', 'plane1', 'plane2', 'four2', 'four2p', 'bomb', 'rocket'];

/** Every way to read these cards as one combination (a few hands read two ways, e.g. 333444555666). */
export function combos(cards) {
  const n = cards.length;
  if (!n || new Set(cards).size !== n || cards.some((id) => !(id >= 0 && id <= 53))) return [];
  const c = counts(cards), out = [];
  const add = (type, main, len = 1) => out.push({ type, main, len, n });
  const ranks = [];
  for (let r = 3; r <= 17; r++) if (c[r]) ranks.push(r);
  if (n === 2 && c[16] && c[17]) { add('rocket', 17); return out; }
  if (ranks.length === 1) {
    const r = ranks[0];
    if (n === 1) add('single', r); else if (r <= 15 && n === 2) add('pair', r); else if (n === 3) add('triple', r); else if (n === 4) add('bomb', r);
    return out;
  }
  // runs: every rank the same count, consecutive, no 2s or jokers
  const run = (k, min, type) => {
    if (n % k || ranks.length !== n / k || n / k < min) return;
    if (ranks.some((r) => c[r] !== k) || ranks.at(-1) > 14 || ranks.at(-1) - ranks[0] !== ranks.length - 1) return;
    add(type, ranks.at(-1), ranks.length);
  };
  run(1, 5, 'straight'); run(2, 3, 'pairs'); run(3, 2, 'plane');
  // triples (or a run of triples) with one single or one pair per triple
  for (let len = 1; len <= 6; len++) {
    for (const wing of [1, 2]) {
      if (n !== len * (3 + wing)) continue;
      for (let hi = len === 1 ? 15 : 14; hi - len + 1 >= 3; hi--) {
        const lo = hi - len + 1;
        let ok = true;
        for (let r = lo; r <= hi; r++) if (c[r] !== 3) { ok = false; break; }
        if (!ok) continue;
        const rest = c.slice();
        for (let r = lo; r <= hi; r++) rest[r] = 0;
        if (wing === 1) { if (rest[16] && rest[17]) continue; } // the rocket is never a kicker
        else if (!pairsOnly(rest, len)) continue;
        add(len === 1 ? (wing === 1 ? 'triple1' : 'triple2') : (wing === 1 ? 'plane1' : 'plane2'), hi, len);
        break;
      }
    }
  }
  // four with two singles, or four with two pairs
  if (n === 6 || n === 8) {
    for (let r = 3; r <= 15; r++) {
      if (c[r] !== 4) continue;
      const rest = c.slice(); rest[r] = 0;
      if (n === 6 && !(rest[16] && rest[17])) add('four2', r);
      if (n === 8 && pairsOnly(rest, 2)) add('four2p', r);
    }
  }
  return out;
}
function pairsOnly(rest, want) {
  let pairs = 0;
  for (let r = 3; r <= 17; r++) {
    if (!rest[r]) continue;
    if (r >= 16 || rest[r] % 2) return false;
    pairs += rest[r] / 2;
  }
  return pairs === want;
}

/** Does combination a beat b (b = the play on the table, null when leading)? */
export function beats(a, b) {
  if (!b) return true;
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb') return b.type !== 'bomb' || a.main > b.main;
  if (b.type === 'bomb') return false;
  return a.type === b.type && a.len === b.len && a.n === b.n && a.main > b.main;
}

const LEAD_ORDER = ['rocket', 'bomb', 'plane', 'plane2', 'plane1', 'pairs', 'straight', 'four2p', 'four2', 'triple2', 'triple1', 'triple', 'pair', 'single'];
/** The reading to use for a play: one that beats the table, preferring the natural reading when leading. */
export function readPlay(cards, last) {
  const all = combos(cards).filter((x) => beats(x, last));
  all.sort((a, b) => LEAD_ORDER.indexOf(a.type) - LEAD_ORDER.indexOf(b.type));
  return all[0] || null;
}

// ---------------------------------------------------------------- deals and the game state
export function shuffledDeck(random = Math.random) {
  const d = Array.from({ length: 54 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

/** A new deal: 17 cards each, 3 face down for the landlord; `first` is asked to call first. */
export function deal(first = 0, random = Math.random, base = 1) {
  const deck = shuffledDeck(random);
  return {
    phase: 'bid', base, multiplier: 1,
    hands: [0, 1, 2].map((s) => sortHand(deck.slice(s * 17, s * 17 + 17))),
    bottom: deck.slice(51),
    turn: first, first,
    bid: { stage: 'call', caller: -1, declined: [false, false, false], queue: [], robs: 0, log: [] },
    landlord: -1,
    last: null,            // { seat, cards, combo } — the play to beat; null when the turn player leads
    passes: 0,
    table: [null, null, null], // what each seat did most recently this round: { cards, combo } or { pass: true } / { bid: 'call' }
    plays: [0, 0, 0],      // plays each seat has made (for spring)
    bombs: 0,
    winner: -1, spring: false, scores: [0, 0, 0],
    seq: 0,                // bumps on every change, so clients can tell states apart
    event: null,           // what just happened: { kind, seat, ... } for effects and sounds
  };
}

const next = (seat) => (seat + 1) % 3; // play passes to the right (下家), as at a real table

/** Bidding: { t: 'call', yes } while nobody has called, then { t: 'rob', yes }. Returns false if not allowed. */
export function bid(s, seat, yes) {
  if (s.phase !== 'bid' || s.turn !== seat) return false;
  const b = s.bid;
  s.seq++;
  if (b.stage === 'call') {
    b.log.push({ seat, act: yes ? 'call' : 'nocall' });
    s.table[seat] = { bid: yes ? 'call' : 'nocall' };
    if (!yes) {
      b.declined[seat] = true;
      s.event = { kind: 'nocall', seat };
      if (b.declined.every(Boolean)) { s.phase = 'redeal'; s.event = { kind: 'redeal' }; return true; }
      s.turn = next(seat);
      return true;
    }
    b.caller = seat; s.landlord = seat; b.stage = 'rob';
    s.event = { kind: 'call', seat };
    b.queue = [next(seat), next(next(seat))].filter((x) => !b.declined[x]);
    return advanceRob(s);
  }
  // rob stage: each other player once, then the caller once more if someone robbed
  b.log.push({ seat, act: yes ? 'rob' : 'norob' });
  s.table[seat] = { bid: yes ? 'rob' : 'norob' };
  if (yes) { s.landlord = seat; b.robs++; s.multiplier *= 2; s.event = { kind: 'rob', seat, multiplier: s.multiplier }; }
  else { b.declined[seat] = true; s.event = { kind: 'norob', seat }; }
  if (b.stage === 'final') return finishBid(s);
  return advanceRob(s);
}
function advanceRob(s) {
  const b = s.bid;
  if (b.queue.length) { s.turn = b.queue.shift(); return true; }
  if (b.robs > 0 && b.stage === 'rob' && !b.declined[b.caller] && s.landlord !== b.caller) { b.stage = 'final'; s.turn = b.caller; return true; }
  return finishBid(s);
}
function finishBid(s) {
  s.phase = 'play';
  s.hands[s.landlord] = sortHand([...s.hands[s.landlord], ...s.bottom]);
  s.turn = s.landlord;
  s.last = null; s.passes = 0; s.table = [null, null, null];
  s.event = { kind: 'landlord', seat: s.landlord, multiplier: s.multiplier };
  return true;
}

export const leading = (s) => !s.last || s.last.seat === s.turn;

/** Play cards (or { pass: true }). Returns the combination played, true for a pass, false if not allowed. */
export function play(s, seat, cards) {
  if (s.phase !== 'play' || s.turn !== seat) return false;
  if (cards === 'pass' || cards == null) {
    if (leading(s)) return false;
    s.seq++;
    s.passes++;
    s.table[seat] = { pass: true };
    s.event = { kind: 'pass', seat };
    s.turn = next(seat);
    if (s.passes >= 2) { s.last = null; s.passes = 0; s.table = [null, null, null]; s.event = { kind: 'pass', seat, newRound: true }; }
    return true;
  }
  const hand = s.hands[seat];
  if (!Array.isArray(cards) || !cards.length || cards.some((id) => !hand.includes(id)) || new Set(cards).size !== cards.length) return false;
  const combo = readPlay(cards, leading(s) ? null : s.last.combo);
  if (!combo) return false;
  s.seq++;
  s.hands[seat] = hand.filter((id) => !cards.includes(id));
  s.plays[seat]++;
  const played = sortHand(cards);
  s.last = { seat, cards: played, combo };
  s.passes = 0;
  s.table[seat] = { cards: played, combo };
  if (combo.type === 'bomb' || combo.type === 'rocket') { s.multiplier *= 2; s.bombs++; }
  s.event = { kind: 'play', seat, combo, left: s.hands[seat].length, multiplier: s.multiplier };
  if (!s.hands[seat].length) finish(s, seat);
  else s.turn = next(seat);
  return combo;
}

function finish(s, seat) {
  s.phase = 'over';
  s.winner = seat;
  const landlordWon = seat === s.landlord;
  const farmers = [0, 1, 2].filter((x) => x !== s.landlord);
  s.spring = landlordWon ? farmers.every((f) => s.plays[f] === 0) : s.plays[s.landlord] === 1;
  if (s.spring) s.multiplier *= 2;
  const unit = s.base * s.multiplier;
  s.scores = [0, 1, 2].map((x) => (x === s.landlord ? (landlordWon ? 2 : -2) : landlordWon ? -1 : 1) * unit);
  s.event = { ...s.event, finished: true, landlordWon, spring: s.spring };
}

/** Which side won: the winners' seats. */
export const winners = (s) => (s.phase !== 'over' ? [] : s.winner === s.landlord ? [s.landlord] : [0, 1, 2].filter((x) => x !== s.landlord));

/** What one seat may see: own hand, others' card counts, the public table. Everything after the game ends. */
export function viewFor(s, seat) {
  const over = s.phase === 'over';
  return {
    phase: s.phase, base: s.base, multiplier: s.multiplier, turn: s.turn, landlord: s.landlord, seq: s.seq,
    hand: seat >= 0 ? s.hands[seat] : [],
    counts: s.hands.map((h) => h.length),
    hands: over ? s.hands : null,
    bottom: s.landlord >= 0 && s.phase !== 'bid' ? s.bottom : null,
    bid: { stage: s.bid.stage, caller: s.bid.caller, robs: s.bid.robs, declined: s.bid.declined },
    last: s.last, table: s.table, plays: s.plays, bombs: s.bombs,
    winner: s.winner, spring: s.spring, scores: s.scores, event: s.event,
  };
}
