// Three computer players play one hand of Dou Dizhu; prints the bidding and every play.
// node examples/doudizhu-bots.mjs
import { deal, bid, play, RANK_LABEL, rankOf } from '../doudizhu/rules.js';
import { chooseMove } from '../doudizhu/ai.js';

const show = (cards) => cards.map((id) => RANK_LABEL[rankOf(id)] === 'JOKER' ? (id === 53 ? 'BJ' : 'SJ') : RANK_LABEL[rankOf(id)]).join(' ');
let s = deal(0);
while (s.phase === 'redeal' || s.phase === 'bid') {
  if (s.phase === 'redeal') { console.log('nobody called, dealing again'); s = deal((s.first + 1) % 3); continue; }
  const seat = s.turn, yes = chooseMove(s, seat).bid;
  const stage = s.bid.stage;
  bid(s, seat, yes);
  console.log(`seat ${seat}: ${stage === 'call' ? (yes ? 'call' : 'pass') : yes ? 'rob' : 'no rob'}`);
}
console.log(`landlord: seat ${s.landlord}, bottom cards ${show(s.bottom)}, multiplier x${s.multiplier}\n`);
while (s.phase === 'play') {
  const seat = s.turn, m = chooseMove(s, seat).play;
  const combo = play(s, seat, m);
  console.log(`seat ${seat}${seat === s.landlord ? ' (landlord)' : '           '}: ${m === 'pass' ? 'pass' : `${show(m)}  [${combo.type}]`}`);
}
console.log(`\nwinner: seat ${s.winner} (${s.winner === s.landlord ? 'landlord' : 'farmers'}), multiplier x${s.multiplier}${s.spring ? ', spring' : ''}, scores ${s.scores.join(' / ')}`);
