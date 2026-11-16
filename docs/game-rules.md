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
- **Rating** (`packages/shared/rating.js`, Glicko-2) is the public highscore. Only matches on
  the server change it: between two humans, and against the server AI, whose rating per ladder
  step is fixed (`engine.AI_LADDER`, 900 for Tom Toffee on 6×6 up to 1700 for Gustav Ganache at
  full strength). Challenge-link matches and offline matches never count. The highscore shows
  **stars**: the rating minus twice its deviation (never below 0), so they grow with strength and
  with the number of matches. A match against the AI lifts the stars at most 200 above that AI's
  rating; beyond that only matches against people count.
- **Ingredients** (`packages/shared/ingredients.js`, `progression.js`) drop after matches and
  pay for equipment in the Choclab.

## Items

Items are the equipment of the Choclab (`packages/shared/equipment.js`). The recipes are the
server's and stay private until a player discovers them; the server keeps the items
(`apps/api/src/lab/`). The numbers of minting are in `packages/shared/chain.js`, except the
battlechoc fee, which the on-chain config sets.

**Crafting.** Once anyone has discovered a recipe, every player can craft its item: the recipe's
ingredients plus a price in cocoa beans by tier, 50 for a common item, 100 for a rare one and 200
for an epic one. No ADA and no other fee. Each item gets the next serial number of its item type
(No. 1, No. 2, …); a number is never given twice, also after a salvage.

**Equipping.** Each building type has two slots. An item goes only on its own building, the same
item type at most once per building, and the whole loadout within a budget of 10 points: a common
item costs 2, a rare one 3, an epic one 5. A match uses the loadout the player had when it
started, whatever happens to the items during the match.

**The shelf and the card.** "Your items" in the Choclab shows every item the player has; a tap
opens its card with the name, tier, effects and serial and the actions Equip, Salvage and, where
minting is on, Mint.

**Salvaging** needs the server. It destroys the item, takes it off its slot and gives back
ingredients from the item's recipe as the recipe is at the salvage. They come back fresh: their
whole shelf life starts when they are credited. The cocoa price of crafting never comes back, and
battlechoc charges nothing for salvaging. An item whose recipe is no longer in the Choclab cannot
be salvaged.

- A **plain item** gives back half of each ingredient amount of its recipe, rounded down
  (`packages/shared/salvage.js`), at once.
- A **minted item** gives back its rare and legendary ingredients in full and the common and
  uncommon ones as a plain item does. Salvaging it burns its token, so the game offers it only
  where minting shows (below), never in the Android app: the holder's wallet signs and pays the
  network fee (about 0.4 ADA), and the part of the deposit that was locked with the item (about
  2.4 ADA) comes back with the same transaction. Once the burn is signed and sent, or a burn of
  its token is seen on the chain, the item is out of the loadout: it cannot be used in new
  matches while it is being salvaged, and a match already running keeps it. The ingredients
  follow once the burn is `CHAIN_K_FINAL` blocks deep (a few minutes with the 10 blocks
  recommended on the test network), credited once, to the player the wallet that held the token
  is linked to when the credit is made, and only once that wallet's hop wait (below) for them is
  over. A token burned outside the game is credited the same way, with nothing if its recipe is
  gone; if no player's wallet held it, nobody is credited. Through the game a player can salvage
  only a minted item that is theirs, so not one in a wallet whose hop wait runs; a wallet linked
  by its payment key alone may first have to send the item to its own receiving address.

So a round of craft, mint and salvage loses at least half of the common and uncommon
ingredients, the cocoa price, two network fees and the battlechoc fee, and keeps the rare and
legendary ones, which come back fresh.

**Minting** turns an item into a CIP-68 token in the player's own Cardano wallet. It is opt-in,
one item at a time, and final: a minted item never becomes a plain one again; the only way out is
salvaging. It shows in the web game while the server has its chain features on, never in the
Android app, where minted items still work in matches.

- **Who and how often.** The first mint needs 10 verified online matches
  (`MINT_MIN_ONLINE_MATCHES`). A player mints at most 3 items per UTC day (`MINTS_PER_DAY`; a mint
  counts once it was signed, unless it expired) and runs one chain operation at a time: the next
  mint or salvage of a minted item waits until the last one is final.
- **Signing.** The wallet must sign within 10 minutes (`SIGN_WINDOW_MS`); the transaction is valid
  for 20 (`TX_VALIDITY_MS`). Until the mint is in a block the item stays usable and equipped but
  cannot be salvaged or minted again; a mint that is cancelled, not signed in time or expired leaves
  it a plain item, and nothing was spent.
- **What it costs**, paid in ADA from the player's wallet:
  - the network fee, to the Cardano network: about 0.5 ADA;
  - the battlechoc fee, into the battlechoc treasury: 1, 2 or 4 ADA for a common, rare or epic item
    (the on-chain config's fee option);
  - the deposit, which Cardano requires and which stays with the item: about 3.7 ADA, of which
    about 1.3 ADA travel with the token in the holder's wallet and about 2.4 ADA are locked with the
    item and come back on salvage.

  The amounts before the wallet opens are estimates ("about"); the wallet shows the exact ones.
  The wallet also needs some ADA for the change and the collateral of the transaction, which is
  not spent; the checklist says how much a wallet needs in all.

**Ownership by wallet.** A minted item belongs to the player whose linked wallet holds its token:
the wallet's stake key, else its payment key. A token at a script address (a marketplace listing)
belongs to nobody.

- **Departure** counts at once: when a transaction that moves the token away is in a block, the
  item leaves the player and its slot is ignored (the slot keeps it, so it is back in its slot if
  it returns).
- **Arrival** counts once one more block is on top (depth 1).
- **The hop wait.** The items of a wallet that was linked to another player before count for the
  new player 24 hours after the link (`WALLET_HOP_WAIT_MS`); unlinking and linking again does not
  shorten it. Until then the game also refuses to mint into that wallet.
- The player gets a notice when an item arrives in or leaves one of their wallets, and when the
  ingredients of a salvaged minted item are credited.

## The AI opponents

- **Tom Toffee** decides every 2.5 to 4 s, builds trees and truffle cannons, hides under cream
  that is already there and shoots at random visible targets. He never rushes a weapon.
- **Gustav Ganache** plays with a handicap from 0 (strong) to 4 and one of three temperaments
  (defensive, aggressive, balanced). He remembers what a shot revealed.
- **Mimi Marzipan** guides the tutorial; her moves are scripted.

Below 800 experience the opponent is Tom, from then on Gustav, with less handicap as the
player's experience grows (`engine/setup.js`).
