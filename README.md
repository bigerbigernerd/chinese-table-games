# Chinese table games in JavaScript

Rules engines and computer players for three classic Chinese games. They are written in plain JavaScript (ES
modules) with no dependencies, and run in the browser and in Node.

| Game | Play it online | What is here |
| --- | --- | --- |
| **Dou Dizhu** 斗地主 (Fight the Landlord) | [doudizhu.pocketplay.win](https://doudizhu.pocketplay.win/) · [中文](https://doudizhu.pocketplay.win/zh/) | 54-card rules with call-and-rob bidding (叫地主 / 抢地主), all 14 combination types, spring, scoring, and a computer player that plans its hand |
| **Flying Chess** 飞行棋 (Aeroplane Chess) | [flyingchess.pocketplay.win](https://flyingchess.pocketplay.win/) · [中文](https://flyingchess.pocketplay.win/zh/) | Four-player race: board geometry, colour jumps, the shortcut flight, bumping and exact finish, plus a computer player |
| **Animal Chess** 斗兽棋 (Jungle, Dou Shou Qi) | [animalchess.pocketplay.win](https://animalchess.pocketplay.win/) · [中文](https://animalchess.pocketplay.win/zh/) | 7×9 board with rivers, traps and dens, lion and tiger river jumps, and a negamax alpha-beta computer with three levels |

The live sites use these exact files for computer opponents, hints, online tables (where the server is the authority)
and tests. Each online site also has room codes for friends.

## Features

- Pure functions on plain state objects: easy to test, to save, and to run on a server that sends each player only what
  they may see.
- Dou Dizhu: every combination type, call-and-rob bidding, spring and scoring. The computer plays as landlord or as a
  farmer cooperating with its partner, and there is a Hint function.
- Flying Chess: four players, take-off on 2/4/6, colour jumps, the shortcut flight, bumping, and three sixes in a row.
- Animal Chess: the full Jungle rules and a three-level search computer.
- 34 tests, including 500 complete computer games.

## Quick start

```js
import { deal, bid, play, readPlay } from './doudizhu/rules.js';
import { chooseMove, hints } from './doudizhu/ai.js';

let s = deal(0);                         // 17 cards each, 3 face down, seat 0 is asked to call first
while (s.phase === 'bid') bid(s, s.turn, chooseMove(s, s.turn).bid);
while (s.phase === 'play') play(s, s.turn, chooseMove(s, s.turn).play);   // cards or 'pass'
console.log(s.winner, s.scores);
```

Run `npm run example` to watch three computer players play a full hand.

The engines are pure functions on plain objects, so a server can keep the real state and send each player only what
they may see (`viewFor(state, seat)` in Dou Dizhu).

## Dou Dizhu details

- **Cards:** card ids 0–53. Ranks run 3 … K, A, 2, then the small and the big joker.
- **Combinations:** `combos(cards)` returns every way a set of cards can be read, because 333444555666 is both an
  airplane and an airplane with wings. `readPlay` picks the reading that beats the table.
- **Bidding:** the first caller can rob back, and every rob doubles the multiplier. Bombs, the rocket and spring
  double it too. The landlord wins or loses twice the stake.
- **Computer player:**
  - It splits its hand into the fewest plays, searching over straights before planes, pair runs and triples with
    kickers.
  - Farmers cooperate: they don't overtake their partner. The farmer after the landlord blocks cheap singles, and the
    one before it plays harder as the last chance.
  - It keeps bombs for when the other side is close to winning.
  - `hints()` offers its own choice first, then every other legal play.
- **Balance:** in 1,000 computer-only games the landlord wins about 68% (51% with a random landlord). The extra edge
  comes from the strongest hand winning the bidding, as at a real table.

## Tests

```sh
npm test    # 34 tests: every combination type, bidding paths, scoring and spring, 500 full computer games
            # (every move legal, cards conserved, zero-sum), Flying Chess rules, Animal Chess rules and AI
```

## 中文说明

斗地主、飞行棋、斗兽棋的规则引擎和电脑玩家，纯 JavaScript，没有依赖，浏览器和 Node 都能用。

快速开始：`git clone` 之后运行 `npm test` 跑全部测试，运行 `npm run example` 看三个电脑打一局斗地主。在自己的项目里直接 `import` 对应目录下的 `rules.js` 和 `ai.js` 就能用。

- **斗地主：** 叫地主、抢地主，14 种牌型，春天和反春，计分规则齐全；电脑会规划手牌，农民之间会配合。
- **飞行棋：** 起飞、同色跳格、飞跃捷径、撞机，进终点要点数正好。
- **斗兽棋：** 河、陷阱和兽穴，狮虎跳河，老鼠可以挡住跳河；电脑分三档难度。

在线试玩：[斗地主](https://doudizhu.pocketplay.win/zh/) · [飞行棋](https://flyingchess.pocketplay.win/zh/) · [斗兽棋](https://animalchess.pocketplay.win/zh/)

## License

MIT
