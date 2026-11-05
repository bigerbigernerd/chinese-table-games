// Computer player and hints for Dou Dizhu. Works in a browser (computer opponents, a Hint button) and on a server
// (fill-in players, timeouts). Uses only what that seat could know: its own hand, card counts and the table.
import { rankOf, counts, readPlay, leading } from './rules.js';

const byRank = (hand) => {
  const g = new Map();
  for (const id of hand) { const r = rankOf(id); if (!g.has(r)) g.set(r, []); g.get(r).push(id); }
  return g;
};

// ---------------------------------------------------------------- plays that beat the table
// Kickers: the smallest cards that are already loose (a lone single / a lone pair) first, then broken from bigger sets.
function kickers(c, g, exclude, k, pair) {
  const tiers = pair ? [2, 3] : [1, 2, 3];
  const picks = [];
  for (const tier of tiers) {
    for (let r = 3; r <= 17 && picks.length < k; r++) {
      if (exclude.has(r) || c[r] !== tier) continue;
      if (pair && r >= 16) continue;
      if (!pair && r >= 16 && picks.some((p) => p[0] >= 52)) continue; // never both jokers as kickers
      picks.push(g.get(r).slice(0, pair ? 2 : 1));
    }
  }
  return picks.length === k ? picks.flat() : null;
}

/** Every reasonable play that beats `last` (a combination), cheapest first; bombs and the rocket at the end. */
export function candidates(hand, last) {
  const g = byRank(hand), c = counts(hand), plain = [], broken = [], power = [];
  const add = (list, cards) => { if (!cards) return; const combo = readPlay(cards, last); if (combo) list.push({ cards, combo }); };
  const take = (r, k) => g.get(r).slice(0, k);
  const t = last ? last.type : null, above = last ? last.main : 0, len = last ? last.len : 1;
  const run = (k, kick, pairKick) => {
    for (let hi = above + 1; hi <= 14; hi++) {
      const lo = hi - len + 1;
      if (lo < 3) continue;
      let ok = true, exact = true;
      for (let r = lo; r <= hi; r++) { if (c[r] < k) { ok = false; break; } if (c[r] !== k) exact = false; }
      if (!ok) continue;
      let cards = [];
      for (let r = lo; r <= hi; r++) cards.push(...take(r, k));
      if (kick) { const ks = kickers(c, g, new Set(Array.from({ length: len }, (_, i) => lo + i)), len, pairKick); if (!ks) continue; cards = cards.concat(ks); }
      add(exact ? plain : broken, cards);
    }
  };
  if (t === 'single') {
    const both = c[16] && c[17];
    for (let r = above + 1; r <= 17; r++) if (c[r]) add(c[r] === 1 && !(both && r >= 16) ? plain : broken, take(r, 1));
  } else if (t === 'pair') {
    for (let r = above + 1; r <= 15; r++) if (c[r] >= 2) add(c[r] === 2 ? plain : broken, take(r, 2));
  } else if (t === 'triple') {
    for (let r = above + 1; r <= 15; r++) if (c[r] >= 3) add(c[r] === 3 ? plain : broken, take(r, 3));
  } else if (t === 'triple1' || t === 'triple2') {
    for (let r = above + 1; r <= 15; r++) if (c[r] >= 3) { const ks = kickers(c, g, new Set([r]), 1, t === 'triple2'); if (ks) add(c[r] === 3 ? plain : broken, [...take(r, 3), ...ks]); }
  } else if (t === 'straight') run(1, false);
  else if (t === 'pairs') run(2, false);
  else if (t === 'plane') run(3, false);
  else if (t === 'plane1' || t === 'plane2') run(3, true, t === 'plane2');
  else if (t === 'four2' || t === 'four2p') {
    for (let r = above + 1; r <= 15; r++) if (c[r] === 4) { const ks = kickers(c, g, new Set([r]), 2, t === 'four2p'); if (ks) add(broken, [...take(r, 4), ...ks]); }
  }
  for (let r = 3; r <= 15; r++) if (c[r] === 4 && (t !== 'bomb' || r > above) && t !== 'rocket') add(power, take(r, 4));
  if (c[16] && c[17]) add(power, [g.get(16)[0], g.get(17)[0]]);
  const byMain = (a, b) => a.combo.main - b.combo.main;
  return [...plain.sort(byMain), ...broken.sort(byMain), ...power.sort(byMain)];
}

// ---------------------------------------------------------------- planning a hand
// Split a hand into combinations needing as few plays as possible. Bombs and the rocket stay whole; straights are
// chosen by a small search; then planes, pair runs, triples (taking the lowest loose cards as kickers), pairs, singles.
function rest(c0) {
  const c = c0.slice(), groups = [];
  const runs = (k, min, type) => {
    for (let r = 3; r <= 14;) {
      if (c[r] !== k) { r++; continue; }
      let e = r;
      while (e + 1 <= 14 && c[e + 1] === k) e++;
      if (e - r + 1 >= min) { groups.push({ type, lo: r, hi: e, k }); for (let q = r; q <= e; q++) c[q] = 0; }
      r = e + 1;
    }
  };
  runs(3, 2, 'plane');
  runs(2, 3, 'pairs');
  for (let r = 3; r <= 15; r++) if (c[r] === 3) { groups.push({ type: 'triple', lo: r, hi: r, k: 3 }); c[r] = 0; }
  const singles = [], pairs = [];
  for (let r = 3; r <= 17; r++) { if (c[r] === 2 && r <= 15) pairs.push(r); else if (c[r] === 1) singles.push(r); }
  // kickers: triples and planes take the lowest singles (below A), else the lowest pairs (below Q)
  for (const grp of groups) {
    if (grp.type !== 'plane' && grp.type !== 'triple') continue;
    const need = grp.hi - grp.lo + 1;
    const s = singles.filter((r) => r < 14 && (r < grp.lo || r > grp.hi));
    const p = pairs.filter((r) => r < 12 && (r < grp.lo || r > grp.hi));
    if (s.length >= need) { grp.kick = s.slice(0, need); grp.pairKick = false; for (const r of grp.kick) singles.splice(singles.indexOf(r), 1); }
    else if (p.length >= need) { grp.kick = p.slice(0, need); grp.pairKick = true; for (const r of grp.kick) pairs.splice(pairs.indexOf(r), 1); }
  }
  for (const r of pairs) groups.push({ type: 'pair', lo: r, hi: r, k: 2 });
  for (const r of singles) groups.push({ type: 'single', lo: r, hi: r, k: 1 });
  return groups;
}
// lower is better: plays needed, then a penalty for small loose cards that will be hard to get rid of
function scorePlan(groups) {
  let s = groups.length * 10;
  for (const g of groups) if ((g.type === 'single' || g.type === 'pair') && g.lo < 11) s += (11 - g.lo) * 0.3;
  return s;
}
export function plan(hand) {
  const c = counts(hand), fixed = [];
  if (c[16] && c[17]) { fixed.push({ type: 'rocket', lo: 16, hi: 17, k: 1 }); c[16] = c[17] = 0; }
  for (let r = 3; r <= 15; r++) if (c[r] === 4) { fixed.push({ type: 'bomb', lo: r, hi: r, k: 4 }); c[r] = 0; }
  let best = null, budget = 4000;
  const search = (cc, chosen, minStart) => {
    if (budget-- <= 0) return;
    const groups = [...fixed, ...chosen, ...rest(cc)], score = scorePlan(groups);
    if (!best || score < best.score) best = { groups, score };
    if (chosen.length >= 3) return;
    for (let s = minStart; s <= 10; s++) {
      for (let e = s; e <= 14; e++) {
        if (!cc[e]) break;
        if (e - s + 1 < 5) continue;
        const c2 = cc.slice();
        for (let r = s; r <= e; r++) c2[r]--;
        search(c2, [...chosen, { type: 'straight', lo: s, hi: e, k: 1 }], s);
      }
    }
  };
  search(c, [], 3);
  return { groups: best.groups, moves: best.groups.length, score: best.score };
}
/** Real cards for a planned group, taken from the hand. */
function cardsOf(grp, g) {
  const out = [], take = (r, k) => out.push(...g.get(r).splice(0, k));
  if (grp.type === 'rocket') { take(16, 1); take(17, 1); return out; }
  for (let r = grp.lo; r <= grp.hi; r++) take(r, grp.k);
  for (const r of grp.kick || []) take(r, grp.pairKick ? 2 : 1);
  return out;
}
export function planPlays(hand) {
  const p = plan(hand), g = byRank(hand);
  return p.groups.map((grp) => { const cards = cardsOf(grp, g); return { cards, combo: readPlay(cards, null), grp }; }).filter((x) => x.combo);
}

// ---------------------------------------------------------------- decisions
const isPower = (combo) => combo.type === 'bomb' || combo.type === 'rocket';
const others = (s, seat) => [0, 1, 2].filter((x) => x !== seat);
const enemiesOf = (s, seat) => (seat === s.landlord ? others(s, seat) : [s.landlord]);
const fewestEnemyCards = (s, seat) => Math.min(...enemiesOf(s, seat).map((x) => s.hands[x].length));

/** Bidding: call when the hand is strong, rob only when it is stronger. */
export function chooseBid(s, seat, random = Math.random) {
  const hand = s.hands[seat], c = counts(hand);
  let score = c[16] && c[17] ? 8 : c[17] * 4 + c[16] * 3;
  score += c[15] * 2 + c[14] * 0.7;
  for (let r = 3; r <= 15; r++) if (c[r] === 4) score += 5;
  score += Math.max(0, 10 - plan(hand).moves) * 1.1;
  const threshold = s.bid.stage === 'call' ? 6 : 10;
  return score + (random() - 0.5) * 2 >= threshold;
}

/** The lead: finish if possible, keep top cards for control, and mind opponents (and a teammate) about to go out. */
export function chooseLead(s, seat) {
  const hand = s.hands[seat];
  if (readPlay(hand, null)) return hand;
  const plays = planPlays(hand);
  const normal = plays.filter((x) => !isPower(x.combo));
  // two plays left and one is a bomb or unbeatable: play the other first, the bomb wins the lead back
  if (!normal.length) return plays.sort((a, b) => a.combo.main - b.combo.main)[0].cards;
  const enemyMin = fewestEnemyCards(s, seat);
  const farmer = seat !== s.landlord, mate = farmer ? others(s, seat).find((x) => x !== s.landlord) : -1;
  // help a teammate who is down to one or two cards: lead small singles / pairs
  if (farmer && s.hands[mate].length <= 2) {
    const want = s.hands[mate].length === 1 ? 'single' : 'pair';
    const low = hand.slice().sort((a, b) => rankOf(a) - rankOf(b));
    if (want === 'single') return [low[0]];
    const g = byRank(hand);
    for (const [r, ids] of [...g].sort((a, b) => a[0] - b[0])) if (ids.length >= 2 && r <= 15) return ids.slice(0, 2);
  }
  const risky = (x) => (enemyMin === 1 && x.combo.type === 'single') || (enemyMin === 2 && x.combo.type === 'pair');
  let pool = normal.filter((x) => !risky(x));
  if (!pool.length) {
    // only risky plays left: play the biggest single / pair so the opponent cannot follow cheaply
    return normal.sort((a, b) => b.combo.main - a.combo.main)[0].cards;
  }
  // low first; at the same height prefer the play that sheds more cards; top singles/pairs (2, jokers) last
  const lowRank = (x) => Math.min(...x.cards.map(rankOf));
  const control = (x) => (x.combo.type === 'single' || x.combo.type === 'pair') && x.combo.main >= 15;
  pool.sort((a, b) => control(a) - control(b) || lowRank(a) - lowRank(b) || b.cards.length - a.cards.length);
  // a farmer leading straight into the landlord avoids feeding it cheap singles: lead a set, or a middling single
  if (farmer && (seat + 1) % 3 === s.landlord) {
    const sets = pool.filter((x) => x.combo.type !== 'single' && !control(x));
    if (sets.length) return sets[0].cards;
    const mid = pool.filter((x) => x.combo.type === 'single' && x.combo.main >= 9 && !control(x));
    if (mid.length) return mid[0].cards;
  }
  return pool[0].cards;
}

/** Following: play what the plan already holds, break sets or bomb only when the other side is close to winning. */
export function chooseFollow(s, seat, random = Math.random) {
  const hand = s.hands[seat], last = s.last;
  const cands = candidates(hand, last.combo);
  if (!cands.length) return 'pass';
  const out = cands.find((x) => x.cards.length === hand.length);
  if (out) return out.cards;
  const farmer = seat !== s.landlord, mateLed = farmer && last.seat !== s.landlord;
  const enemyMin = fewestEnemyCards(s, seat);
  if (mateLed) {
    // let the teammate keep the lead; only take over a tiny lead when the landlord is next and nearly out
    const landlordNext = (seat + 1) % 3 === s.landlord;
    if (landlordNext && s.hands[s.landlord].length <= 2 && (last.combo.type === 'single' || last.combo.type === 'pair') && last.combo.main < 13) {
      const top = cands.filter((x) => !isPower(x.combo)).at(-1);
      if (top) return top.cards;
    }
    return 'pass';
  }
  // a farmer answering the landlord plays harder; the farmer right after the landlord blocks cheap singles and pairs
  const vsLandlord = farmer && last.seat === s.landlord, llCards = s.hands[s.landlord].length;
  if (vsLandlord && seat === (s.landlord + 1) % 3 && (last.combo.type === 'single' || last.combo.type === 'pair') && last.combo.main < 13) {
    const strong = cands.filter((x) => !isPower(x.combo) && x.combo.main >= Math.min(14, last.combo.main + 4));
    if (strong.length && (llCards <= 10 || random() < 0.5)) return strong[0].cards;
  }
  // the farmer just before the landlord is the last one who can stop it taking the lead back
  const lastChance = vsLandlord && seat === (s.landlord + 2) % 3;
  const base = plan(hand).moves;
  let best = null;
  for (const x of cands) {
    if (isPower(x.combo)) continue;
    const left = hand.filter((id) => !x.cards.includes(id));
    const cost = plan(left).moves - (base - 1); // 0: the play was one of the planned groups
    const v = cost * 100 + x.combo.main;
    if (!best || v < best.v) best = { x, v, cost };
  }
  const urgent = enemyMin <= (vsLandlord ? 4 : 3) || (s.last.cards.length >= 4 && enemyMin <= 6);
  if (best) {
    const pricey = best.x.combo.main >= 15 && last.combo.main <= 10 && hand.length > 8;
    if (best.cost <= 0 && !(pricey && !urgent && random() < 0.6)) return best.x.cards;
    if (urgent || (best.cost <= 1 && (enemyMin <= 8 || vsLandlord)) || (vsLandlord && best.cost <= 2 && (llCards <= 10 || lastChance)) || (best.cost <= 1 && random() < 0.35)) return best.x.cards;
  }
  const power = cands.filter((x) => isPower(x.combo));
  if (power.length) {
    const p = power[0], after = plan(hand.filter((id) => !p.cards.includes(id))).moves;
    if (urgent || after <= 2 || (vsLandlord && llCards <= (lastChance ? 8 : 6))) return p.cards;
  }
  if (urgent && best) return best.x.cards;
  return 'pass';
}

/** One decision for the seat whose turn it is: { bid: yes } or { play: cards | 'pass' }. */
export function chooseMove(s, seat, random = Math.random) {
  if (s.phase === 'bid') return { bid: chooseBid(s, seat, random) };
  if (s.phase !== 'play') return null;
  return { play: leading(s) ? chooseLead(s, seat) : chooseFollow(s, seat, random) };
}

/** Hint button: the computer's own choice first, then every other play that works. Only this seat's knowledge. */
export function hints(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return [];
  const hand = s.hands[seat], list = [], seen = new Set();
  const push = (cards) => { if (!cards || cards === 'pass') return; const key = cards.slice().sort((a, b) => a - b).join(','); if (!seen.has(key)) { seen.add(key); list.push(cards); } };
  if (leading(s)) { push(chooseLead(s, seat)); for (const x of planPlays(hand)) push(x.cards); }
  else { const pick = chooseFollow(s, seat, () => 0.99); push(pick); for (const x of candidates(hand, s.last.combo)) push(x.cards); }
  return list;
}
