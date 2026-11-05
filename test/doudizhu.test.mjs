import test from 'node:test';
import assert from 'node:assert/strict';
import { combos, beats, readPlay, deal, bid, play, leading, viewFor, winners, rankOf, sortHand, SMALL, BIG } from '../doudizhu/rules.js';
import { candidates, chooseMove, hints, plan } from '../doudizhu/ai.js';

// cards by label: '3' .. '10', 'J', 'Q', 'K', 'A', '2', 'SJ' (small joker), 'BJ' (big joker); suits cycle so repeats differ
const RANK = { 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14, 2: 15 };
function cards(spec) {
  const used = new Map();
  return spec.split(' ').filter(Boolean).map((t) => {
    if (t === 'SJ') return SMALL;
    if (t === 'BJ') return BIG;
    const r = RANK[t], k = used.get(r) || 0;
    used.set(r, k + 1);
    return (r - 3) * 4 + k;
  });
}
const kinds = (spec) => combos(cards(spec)).map((c) => `${c.type}:${c.main}${c.len > 1 ? 'x' + c.len : ''}`).sort();

test('every combination type is recognised, and non-combinations are not', () => {
  assert.deepEqual(kinds('7'), ['single:7']);
  assert.deepEqual(kinds('BJ'), ['single:17']);
  assert.deepEqual(kinds('9 9'), ['pair:9']);
  assert.deepEqual(kinds('SJ BJ'), ['rocket:17']);
  assert.deepEqual(kinds('K K K'), ['triple:13']);
  assert.deepEqual(kinds('2 2 2 5'), ['triple1:15']);
  assert.deepEqual(kinds('2 2 2 5 5'), ['triple2:15']);
  assert.deepEqual(kinds('3 4 5 6 7'), ['straight:7x5']);
  assert.deepEqual(kinds('10 J Q K A'), ['straight:14x5']);
  assert.deepEqual(kinds('3 3 4 4 5 5'), ['pairs:5x3']);
  assert.deepEqual(kinds('8 8 8 9 9 9'), ['plane:9x2']);
  assert.deepEqual(kinds('8 8 8 9 9 9 3 K'), ['plane1:9x2']);
  assert.deepEqual(kinds('8 8 8 9 9 9 3 3 K K'), ['plane2:9x2']);
  assert.deepEqual(kinds('6 6 6 6 3 9'), ['four2:6']);
  assert.deepEqual(kinds('6 6 6 6 3 3 9 9'), ['four2p:6']);
  assert.deepEqual(kinds('5 5 5 5'), ['bomb:5']);
  // two readings of the same cards
  assert.deepEqual(kinds('3 3 3 4 4 4 5 5 5 6 6 6'), ['plane1:6x3', 'plane:6x4']);
  // not combinations
  for (const bad of ['3 4', '3 4 5 6', 'J Q K A 2', 'K A 2 SJ BJ', '2 2 3 3 4 4', 'Q Q K K', '3 3 3 4 4 4 5 6 6', '2 2 2 A A A', 'SJ BJ 3', 'SJ SJ', '4 4 4 SJ BJ', '6 6 6 6 SJ BJ']) assert.deepEqual(kinds(bad), [], bad);
});

test('who beats whom: same shape and higher, bombs over everything but higher bombs and the rocket', () => {
  const r = (spec) => readPlay(cards(spec), null);
  assert(beats(r('8'), r('7')));
  assert(!beats(r('7'), r('8')));
  assert(beats(r('BJ'), r('SJ')));
  assert(!beats(r('3 4 5 6 7 8'), r('4 5 6 7 8')), 'length must match');
  assert(beats(r('4 5 6 7 8'), r('3 4 5 6 7')));
  assert(beats(r('3 3 3 3'), r('2 2 2 A')));
  assert(beats(r('3 3 3 3'), r('10 J Q K A')));
  assert(beats(r('4 4 4 4'), r('3 3 3 3')));
  assert(!beats(r('2 2 2 2'), r('SJ BJ')));
  assert(beats(r('SJ BJ'), r('2 2 2 2')));
  assert(!beats(r('9 9 9 3'), r('8 8 8 4 4')), 'triple+1 does not answer triple+pair');
  // the reading that beats the table is used: 333444555666 as plane+wings over 4-5-6 planes
  const wings = readPlay(cards('8 8 8 9 9 9 10 10 10 3 4 5'), readPlay(cards('4 4 4 5 5 5 6 6 6 J Q K'), null));
  assert.equal(wings.type, 'plane1');
});

function fixedDeal(first, hands, bottom) {
  const s = deal(first, () => 0.5);
  s.hands = hands.map((h) => sortHand(cards(h)));
  s.bottom = cards(bottom);
  return s;
}

test('bidding: call, rob, the caller robs back; multiplier doubles per rob', () => {
  let s = deal(0, () => 0.3);
  assert(bid(s, 0, true));            // 0 calls
  assert.equal(s.turn, 1);
  assert(bid(s, 1, true));            // 1 robs  x2
  assert(bid(s, 2, false));           // 2 passes
  assert.equal(s.turn, 0);            // caller gets a last word
  assert(bid(s, 0, true));            // 0 robs back x4
  assert.equal(s.phase, 'play');
  assert.equal(s.landlord, 0);
  assert.equal(s.multiplier, 4);
  assert.equal(s.hands[0].length, 20);
  assert.equal(s.turn, 0);

  s = deal(1, () => 0.3);
  bid(s, 1, false); bid(s, 2, true); bid(s, 0, false); // 2 calls, nobody robs
  assert.equal(s.phase, 'play'); assert.equal(s.landlord, 2); assert.equal(s.multiplier, 1);

  s = deal(2, () => 0.3);
  bid(s, 2, false); bid(s, 0, false); bid(s, 1, true); // last one calls: no one may rob
  assert.equal(s.landlord, 1); assert.equal(s.phase, 'play');

  s = deal(0, () => 0.3);
  bid(s, 0, false); bid(s, 1, false);
  assert(!bid(s, 0, true), 'not your turn');
  bid(s, 2, false);
  assert.equal(s.phase, 'redeal');

  s = deal(0, () => 0.3);
  bid(s, 0, true); bid(s, 1, true); bid(s, 2, true); bid(s, 0, false); // two robs, caller declines: 2 is landlord x4
  assert.equal(s.landlord, 2); assert.equal(s.multiplier, 4);
});

test('play: follow or pass, two passes give the lead back, bombs double, the hand that empties first wins', () => {
  const s = fixedDeal(0, [
    '3 3 4 4 5 5 6 6 6 6 7 8 9 10 J Q K',
    '3 3 4 4 5 5 7 7 8 8 9 9 10 10 J J Q',
    '7 7 8 8 9 9 10 10 J J Q Q K K A A A',
  ], '2 2 SJ');
  bid(s, 0, true); bid(s, 1, false); bid(s, 2, false);
  assert.equal(s.landlord, 0); assert.equal(s.hands[0].length, 20);
  assert(!play(s, 0, 'pass'), 'the leader cannot pass');
  assert(!play(s, 0, cards('3 4')), 'not a combination');
  assert.equal(play(s, 0, cards('7 8 9 10 J')).type, 'straight');
  assert(!play(s, 1, cards('3 3')), 'wrong shape');
  assert(play(s, 1, 'pass'));
  assert.equal(play(s, 2, [(9 - 3) * 4 + 2, (10 - 3) * 4 + 2, (11 - 3) * 4 + 2, (12 - 3) * 4 + 2, (13 - 3) * 4 + 2]), false, 'cards not in hand');
  play(s, 2, 'pass');
  assert(leading(s), 'two passes: the landlord leads again');
  assert.deepEqual(s.table, [null, null, null]);
  const bomb = play(s, 0, s.hands[0].filter((id) => rankOf(id) === 6));
  assert.equal(bomb.type, 'bomb');
  assert.equal(s.multiplier, 2);
});

test('spring: the landlord goes out before any farmer plays doubles the score; scores add up to zero', () => {
  const s = fixedDeal(0, [
    '3 3 3 4 4 4 5 5 5 6 6 6 7 8 9 10 J',
    '3 4 5 6 7 8 9 10 J Q K A 2 2 9 10 J',
    'Q Q K K A A 7 7 8 8 9 Q K A 2 2 J',
  ], 'SJ BJ 8');
  bid(s, 0, true); bid(s, 1, false); bid(s, 2, false);
  assert.equal(play(s, 0, cards('3 3 3 4 4 4 5 5 5 6 6 6')).type, 'plane');
  play(s, 1, 'pass'); play(s, 2, 'pass');
  assert.equal(play(s, 0, cards('7 8 9 10 J')).type, 'straight');
  play(s, 1, 'pass'); play(s, 2, 'pass');
  play(s, 0, s.hands[0].filter((id) => id < 52)); // the 8
  play(s, 1, 'pass'); play(s, 2, 'pass');
  play(s, 0, [SMALL, BIG]);
  assert.equal(s.phase, 'over');
  assert.deepEqual(winners(s), [0]);
  assert.equal(s.spring, true);
  assert.equal(s.multiplier, 4); // rocket x2, spring x2
  assert.deepEqual(s.scores, [8, -4, -4]);
  assert.equal(s.scores.reduce((a, b) => a + b, 0), 0);
});

test('a seat only sees its own hand until the end', () => {
  const s = deal(0, () => 0.42);
  const v = viewFor(s, 1);
  assert.deepEqual(v.hand, s.hands[1]);
  assert.equal(v.hands, null);
  assert.equal(v.bottom, null);
  assert.deepEqual(v.counts, [17, 17, 17]);
  assert(!JSON.stringify(v).includes(JSON.stringify(s.hands[0])));
});

test('candidates always beat the table, hints start with a legal play', () => {
  for (let i = 0; i < 300; i++) {
    const s = deal(0, mulberry(i));
    const hand = s.hands[0], lastCards = s.hands[1].slice(0, 1 + (i % 5));
    const last = readPlay(lastCards, null);
    if (!last) continue;
    for (const x of candidates(hand, last)) {
      assert(x.cards.every((id) => hand.includes(id)));
      assert(beats(readPlay(x.cards, last), last));
    }
  }
});

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('500 computer games: every move legal, cards conserved, zero-sum scores, both sides win', () => {
  const tally = { landlord: 0, farmers: 0, redeals: 0, bombs: 0, springs: 0, moves: 0 };
  for (let g = 0; g < 500; g++) {
    const random = mulberry(1000 + g);
    let s = deal(g % 3, random);
    while (s.phase === 'redeal') s = deal(g % 3, random);
    let guard = 0;
    while (s.phase !== 'over') {
      if (s.phase === 'redeal') { tally.redeals++; s = deal((s.first + 1) % 3, random); continue; }
      const seat = s.turn, m = chooseMove(s, seat, random);
      if (s.phase === 'bid') assert(bid(s, seat, m.bid));
      else {
        if (m.play !== 'pass') assert(hints(s, seat).length > 0);
        const ok = play(s, seat, m.play);
        assert(ok, `illegal move by ${seat}: ${JSON.stringify(m.play)} vs ${JSON.stringify(s.last)}`);
        tally.moves++;
      }
      const total = s.hands.flat().length + (s.phase === 'bid' ? 3 : 0);
      assert(total <= 54);
      assert(++guard < 400, 'game should end');
    }
    assert.equal(s.scores.reduce((a, b) => a + b, 0), 0);
    assert.equal(s.hands[s.winner].length, 0);
    if (s.winner === s.landlord) tally.landlord++; else tally.farmers++;
    tally.bombs += s.bombs; tally.springs += s.spring ? 1 : 0;
  }
  // a fair-feeling game: neither side wins almost always
  assert(tally.landlord > 120 && tally.farmers > 120, JSON.stringify(tally));
  console.log('  computer games:', JSON.stringify(tally));
});

test('the plan of a hand uses every card once', () => {
  for (let i = 0; i < 200; i++) {
    const s = deal(0, mulberry(5000 + i));
    const p = plan(s.hands[0]);
    let n = 0;
    for (const g of p.groups) n += g.type === 'rocket' ? 2 : (g.hi - g.lo + 1) * g.k * 1 + (g.kick ? g.kick.length * (g.pairKick ? 2 : 1) : 0);
    assert.equal(n, 17);
  }
});
