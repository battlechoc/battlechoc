# Game rules

How a match of battlechoc works, as the rules engine plays it. The engine is
`packages/shared/engine/`, every number is in `packages/shared/balance.js` (`DefaultBalance`),
and what a player may see of the opponent is decided in `engine/view.js`. The game, the server,
the AI opponents and the tutorial all run this one engine.

The numbers below are the base values. A player's equipment from the Choclab
(`packages/shared/equipment.js`) changes some of them for that player.

## A match in four phases

1. **Field choice** (10 s). The board has two fields. One player picks theirs: against an AI
   the human, otherwise a random player. About 70 % of a field's cells start under cream.
2. **Placement** (20 s). Both players put their factory on a cell that is not molten and holds
   nothing but cream. A factory that is missing at the deadline is placed for the player.
3. **Countdown** (3 s) once both factories stand.
4. **Running.** There are no turns: both players build and attack whenever they can afford to.

A match ends in one of three ways:

- **Elimination.** A player who has no weapon that does damage (truffle or hot chocolate)
  loses when they have neither a factory nor a factory extension left, or when they have no
  income and less cacao than a tree costs. If both lose at the same moment, the one with more
  cacao wins, then the one with more trees, otherwise it is a draw.
- **Surrender.**
- **Time limit** (10 minutes). The higher board value wins: cacao plus the build costs of the
  buildings, the factory counting 100. Equal values are a draw.

## Cells

| Cell | Effect |
| --- | --- |
| Brown | none (four in six cells) |
| White | a factory or tree on it yields 1.5 times the cacao |
| Black | a factory or extension on it holds one more build slot and refills in 0.75 of the time |

A cell that hot chocolate has hit is **molten**: nothing can be built there again.

## Economy

- **Cacao** pays for buildings and for rushing a weapon. A player starts with 100. Every
  10 s the factory yields 5 and each cacao tree 10.
- **Build slots.** Every build takes one slot. The factory holds 2, each extension adds 2, and
  slots start full. The factory refills one slot every 15 s, an extension one every 20 s; a
  full storage wastes the refill.

## Buildings

| Building | Costs | Hit points | What it does |
| --- | --- | --- | --- |
| Factory | placed at the start | 11 | cacao and build slots |
| Cream | 0 (one slot) | 1 | covers the 3×3 area around the tapped cell and hides what stands there |
| Cacao tree | 20 | 5 | cacao |
| Rum truffle cannon | 40 | 12 | shoots truffles |
| Fruit cannon | 40 | 12 | built on a truffle cannon; keeps the truffle and adds fruit |
| Factory extension | 120 | 11 | more build slots; must touch the factory |
| Spying Easter bunny | 120 | 7 | removes cream; one per field |
| Xmas factory | 80 | 11 | catches a bunny that spies on it and turns into a hot chocolate ballista |
| Chocolate fountain | 120 | 18 | shields the 3×3 area around it |
| Donut factory | 240 | 8 | makes donuts (traps); one per field |
| Hot chocolate ballista | not buildable | 11 | comes from an Xmas factory; shoots hot chocolate |

A cream build fails only when every cell of its area that is not molten already has cream.

## Weapons

| Weapon | Reload | Rush (from half loaded) | Effect |
| --- | --- | --- | --- |
| Truffle | 20 s | 10 cacao | 9 damage (±20 %) to everything in the cell; the cell must not be empty |
| Fruit | 30 s | 15 cacao | the same damage, but only a tenth against buildings; full against a shield |
| Bunny | 60 s | 30 cacao | removes the cream of a 3×3 area, which shows what stands there |
| Hot chocolate | 30 s, ready at once | none | destroys everything in the cell and melts it |

- A shot on a cell that a **fountain** shields hits the fountain instead; a truffle then does
  only a tenth of its damage.
- A bunny that spies on an **Xmas factory** is caught: the Xmas factory becomes the
  defender's ballista.

## Donuts

Every 30 s a donut factory makes one of the five sets below with a chance of two in three, as
long as its owner holds none. The owner places them on their own cells; the opponent never sees them. A
projectile that hits the cell sets them off, unless a shield takes the shot:

| Donut | Effect |
| --- | --- |
| Portal pair (blue and red) | swaps the hit cell with the cell of the red portal |
| Green | heals the 5×5 area around it |
| Pink | stuns the attacker: no attacks for 15 s |
| White | covers the 5×5 area around it with cream |
| Yellow | one of the above at random, or turns an Xmas factory into a ballista or a fountain |

Hot chocolate sets them off and removes them.

## What a player sees

Their own field completely. Of the opponent's field: the cell types, which cells are molten,
which cells have cream, and the buildings on cells without cream, without their timers and
weapons. Never the opponent's donuts. A shield shows only where a visible fountain covers the
cell, or where a shot revealed it.

The engine is deterministic: the whole state, including the random generator, lives in the
match, so a match can be replayed from its seed and its actions. The server keeps the seed
and everything a player may not see to itself.

## After a match

- **Awards** (`engine/awards.js`): each achievement has an experience value; the five most
  valuable count. A draw makes both players winners.
- **Experience** decides the size of the board (6×6, 8×8 from 200, 10×10 from 500), the AI
  opponent and what is unlocked.
- **Rating** (`packages/shared/rating.js`, Glicko-2) is the public highscore. Only matches
  between two humans on the server change it.
- **Ingredients** (`packages/shared/ingredients.js`, `progression.js`) drop after matches and
  pay for equipment in the Choclab.

## The AI opponents

- **Tom Toffee** decides every 2.5 to 4 s, builds trees and truffle cannons, hides under cream
  that is already there and shoots at random visible targets. He never rushes a weapon.
- **Gustav Ganache** plays with a handicap from 0 (strong) to 4 and one of three temperaments
  (defensive, aggressive, balanced). He remembers what a shot revealed.
- **Mimi Marzipan** guides the tutorial; her moves are scripted.

Below 800 experience the opponent is Tom, from then on Gustav, with less handicap as the
player's experience grows (`engine/setup.js`).
