# battlechoc Whitepaper

**Draft.** Version 0.1, October 2026. This document describes a planned extension of battlechoc. Nothing described in sections 4 to 6 exists yet. Open parameters are marked **[TBD]**, and every part of it may change after playtesting and legal review. It is not an offer of any kind, and it does not promise any financial return.

## Contents

1. [Abstract](#1-abstract)
2. [The game](#2-the-game)
3. [Competitive play](#3-competitive-play)
4. [Economy](#4-economy)
5. [Technical architecture](#5-technical-architecture)
6. [Team, fees and transparency](#6-team-fees-and-transparency)
7. [Roadmap](#7-roadmap)
8. [Risks](#8-risks)
9. [Open parameters](#9-open-parameters)

## 1. Abstract

battlechoc is an open-source real-time strategy game for two players. Each player builds a chocolate economy, hides it under cream and fires rum truffles at the opponent's buildings. The game is playable today in the browser against AI opponents. Online play against other players is implemented and goes live with battlechoc's own servers.

This whitepaper describes a competitive layer on top of the game:

- **Monthly tournaments** ranked by a skill rating, with prizes paid in a **chocolate coin**, a native token on Cardano with a fixed supply.
- **Ingredients** that players find after verified matches. They cannot be traded and they spoil after a while, like real food.
- **Recipes** that turn ingredients into **equipment**: tradable items on Cardano that change how a player's units behave, always with a trade-off and within the same budget for every player.

Coins spent in the game flow back into the tournament pots. Over time the issuance of new coins ends, and the tournaments are funded by the players who take part.

## 2. The game

Two players face each other on boards of chocolate fields. A match lasts at most ten minutes, and both players act at the same time.

- **Factory:** produces building slots and some cacao. Dark chocolate fields make it faster.
- **Cacao trees:** produce cacao, the resource for buildings. White chocolate fields make them more productive.
- **Cannons, bunnies and ballistas:** reload over time. A shot can be fired early for a cacao price, or for free once the weapon is fully loaded.
- **Cream:** hides whatever is under it from the opponent. Information is a central resource.
- **Specials:** chocolate fountains shield their surroundings, and donut traps punish attacks on the field they guard.

A player loses when the opponent has destroyed their ability to keep playing, or when the time runs out with the lower board value.

**Skill and chance.** Decisions dominate: where to build, what to hide, when to fire early and what to attack. The game also contains random elements: the generated boards, a damage spread of ±20 % per shot, and surprise donuts. Section 8 discusses why this matters.

The game code is open source under AGPL-3.0-or-later. Art and music are licensed under CC BY-NC-SA 4.0.

## 3. Competitive play

### 3.1 Seasons and tournaments

A **season** lasts one month and ends with the payout of its tournament pot. **[TBD]** decides between two formats:

- a continuous ranked ladder over the whole season;
- fixed tournament days with brackets.

Tournament matches are played online against other players, through matchmaking by rating.

### 3.2 Rating

Players are ranked by a skill rating. Glicko-2 is proposed, because it also models how certain a rating is, which matters for new and returning players.

- A win against a stronger player raises the rating a lot. A win against an equal or weaker player raises it a little.
- A loss works the same way in reverse: losing to a weaker player costs a lot.
- The **final rating** at the end of the season decides the rank, not a sum of points. Playing more games therefore does not inflate a rank by itself.
- A minimum number of matches is required to be ranked **[TBD]**.

### 3.3 Payouts

At the end of a season the tournament pot is paid out to all eligible players:

- a **participation share** of the pot, split evenly among all eligible players **[TBD, e.g. 10–20 %]**;
- a **rank share** with a curve that favours the top. Proposed: weights proportional to 1/rank^s **[TBD: s]**.

This way everyone who takes part gets something, and the best players get the most.

### 3.4 Fair play

- **Only server-hosted matches count.** The server runs every online match: it receives the players' actions, applies the rules, rolls all random numbers from a secret seed and sends each player only what they are allowed to see. Matches played offline on a device do not count for tournaments or drops.
- **Same budget for everyone.** Equipment is limited by a loadout budget that is equal for all players (section 4.5).
- **Against multi-accounting and collusion:**
  - a wallet-linked identity is required for tournaments;
  - a minimum number of matches and a rating threshold apply for the participation share **[TBD]**;
  - repeated pairings between the same two accounts are detected;
  - automated play is detected server-side.

## 4. Economy

### 4.1 Overview

```
server-verified match ─────────► ingredients   (off-chain, not tradable, spoil)
season rank ───────────────────► chocolate coins (on-chain, fixed supply)
recipe + ingredients + coins ──► equipment      (on-chain NFT, tradable)
                                 coins spent: 90 % to the next pot, 10 % to the team
equipment ──► loadout (same budget for all) · trade · salvage back into ingredients
```

### 4.2 The chocolate coin

- A **native token on Cardano** with a **fixed maximum supply [TBD]**. The minting rules are enforced on-chain (section 5.2). Nobody, including the team, can mint beyond them.
- **Issuance through tournaments only.** Each season mints a defined amount of new coins into its pot **[TBD: amount per season and its curve over time, e.g. constant, decaying or halving]**.
- **Phase 1, free entry:** registration for tournaments is free while issuance is high.
- **Phase 2, registration fee:** once **[TBD: y %]** of the supply has been issued, tournaments charge a registration fee **[TBD: amount, and whether it is fixed in coins or in a USD equivalent]**.
- **Phase 3, no issuance:** once the supply is fully issued, no new coins are minted. The pots are funded by registration fees and by the coins players spend in the game.

**Uses of the coin:**
- entering tournaments (phase 2 onward);
- paying the crafting fee for equipment;
- experimenting in the kitchen, if a fee applies there **[TBD]**.

**Initial liquidity:** whether there is an allocation for a liquidity pool or a treasury is **[TBD]**.

### 4.3 Ingredients

- After an online match verified by the server, against another player or the server-hosted AI, a player may **find ingredients**: cacao beans, sugar, cream, fruit, hazelnuts, rum and rarer ones.
- Ingredients are **game items stored by the server, not tokens**. They **cannot be traded**.
- Ingredients **spoil.** Each one has a shelf life, after which it disappears. Examples **[TBD]**:

  | Ingredient | Shelf life (example) |
  | --- | --- |
  | Cream, milk | 2–3 days |
  | Fruit, hazelnuts | 7 days |
  | Cacao beans | 30 days |
  | Sugar, rum | very long |

  The rarer and more powerful an ingredient, the shorter it lasts.

- **Drops reward good play, not volume [TBD in detail]:**
  - the first matches of a day yield more than later ones;
  - wins against stronger opponents yield more;
  - matches ended within seconds yield nothing;
  - matches against players yield more than matches against the AI;
  - repeated matches between the same two accounts yield less.
- **No drops in tournaments with a registration fee.** A paid entry should never be combined with a chance-based reward.

### 4.4 Recipes and the kitchen

- **Recipes** turn ingredients and a coin fee into equipment.
- **Recipes are discovered, not published.** Players experiment in the kitchen by combining ingredients. A combination that matches a recipe reveals it; one that does not consumes the ingredients.
- The first player to discover a recipe gets a **first-discoverer bonus [TBD, e.g. their name on the recipe or a stronger first edition]**. Rare **recipe fragments** found as drops can give hints.
- Each season brings **new recipes [TBD]**. Once discovered, a recipe is known to everyone.
- **Provably unchanged recipes.** At the start of a season the server publishes on Cardano a cryptographic commitment to all of the season's recipes: the salted root of a Merkle Patricia Forestry. Whenever a recipe is discovered, the server reveals it together with a proof that it was part of that commitment. Anyone can verify that recipes were neither changed nor added during the season.
- The game code is open source. The recipe data is game content and is kept on the server, outside the public repository, so that discovering recipes remains possible **[TBD: legal review of this separation]**.

### 4.5 Equipment

- Equipment is an **NFT on Cardano** (CIP-68). It is **tradable** on secondary markets **[TBD: royalties on secondary sales, and whether they go to the pot or the team]**.
- **Every item has a gameplay effect.** An item may also change how a unit looks. That also shows the opponent what a player is using, unless the unit is hidden under cream. There are no purely cosmetic items.
- **Side-grades, not upgrades.** Items come with a trade-off. Examples:

  | Item | Effect | Trade-off |
  | --- | --- | --- |
  | Heavy rum barrel (truffle cannon) | +25 % damage | +30 % reload time |
  | Light barrel (truffle cannon) | −20 % reload time | −15 % damage |
  | Dark chocolate walls (factory) | +40 % hit points | building slots 10 % slower |
  | Turbo conveyor (factory) | building slots 15 % faster | one storage space less |

- **Loadout budget.** Every item costs loadout points according to its strength. Every player has the **same budget [TBD]**, so a loadout is a strategic choice, not a matter of how much a player spent.
- **Balance updates.** Item effects are stored in metadata that the team can update once per season. Item holders should expect effects to change when the game is rebalanced.
- **Rotation.** Items are tournament-legal for **[TBD, e.g. two seasons]** after their season and remain usable in normal matches afterwards.
- **Salvaging.** Any holder can burn an item to get back part of its ingredients **[TBD, e.g. 50–60 %]**:
  - the crafting fee is not refunded;
  - returned ingredients come back with a short shelf life, so crafting cannot be used to preserve ingredients from spoiling;
  - salvaging is the natural way out for rotated items, and it gives every item a lower bound for its value.

### 4.6 Where coins go

| Coins spent on | To the next tournament pot | To the battlechoc team |
| --- | --- | --- |
| Crafting fees, kitchen fees [TBD] | 90 % | 10 % |
| Tournament registration (phase 2 onward) | 95 % | 5 % |

The team converts its share into USDCx on Cardano (section 6).

### 4.7 Sustainability

After issuance ends, the system relies on players who enjoy competing and are willing to pay entry fees and crafting fees. The team's share leaves the circular flow, so the economy needs a steady flow of players who value the game. battlechoc does not promise that coins or items will have or keep any market value. The coin is a means to take part in the game.

## 5. Technical architecture

### 5.1 Game server

- The battlechoc server hosts all online matches and is the only authority on their state.
- The rules engine is deterministic: a match can be replayed exactly from its seed and the list of player actions.
- Accounts are device accounts today. For tournaments, players link a Cardano wallet through CIP-30 by signing a challenge from the server.

### 5.2 On Cardano

| Component | Purpose |
| --- | --- |
| Coin minting policy | Enforces the maximum supply, the amount per season and the schedule. |
| Tournament pot | A script address that holds each season's pot and enforces the 90/10 and 95/5 splits on deposits **[TBD]**. |
| Payout claims | The server publishes a Merkle root of the season's results and payouts. Each player claims their share with a proof, so payouts are verifiable and the server never holds players' coins. |
| Equipment minting policy | Allows minting only with the crafting fee paid into the pot and a co-signature of the server confirming the ingredients were used. Burning (salvaging) is always allowed. |
| State anchoring | Ingredient inventories, recipe commitments and season results are kept in a Merkle Patricia Forestry. Its root is published on Cardano twice a week, so the server's records can be audited. |

Players sign all transactions with their own wallets; battlechoc does not keep custody of players' coins or items.

## 6. Team, fees and transparency

- The team's shares (10 % of coins spent in the game, 5 % of registration fees) pay for running costs, infrastructure, development, salaries and marketing.
- The team sells its share for USDCx, a USD stablecoin on Cardano. This keeps accounting simple and returns coins to the market.
- The team publishes regular reports on its income and the use of funds **[TBD: frequency and format]**.
- Governance (who decides balance changes, new recipes and parameter changes) is **[TBD]**.
- **[TBD: legal entity and jurisdiction of the battlechoc team.]**

## 7. Roadmap

1. **Live game:** the real-time game with online play on battlechoc's own servers. Done in code, deployment pending.
2. **Season zero:** tournaments with ratings and payouts in points only, no token. This validates balance, rating, payout curve, anti-cheat and real interest.
3. **Testnet season:** coin, equipment, kitchen and payouts on a Cardano test network.
4. **Mainnet:** after a legal review and an independent audit of the on-chain components.

## 8. Risks

- **Regulation:**
  - A token offered to the public in the EU may fall under MiCA, which has its own white paper and notification rules.
  - Prizes combined with entry fees can fall under gambling law where chance plays a role.
  - Rules on securities and investment contracts may apply.
  - App stores have specific policies for blockchain features and real-money gaming.

  battlechoc will launch the token only after a legal review.
- **Economy:**
  - Demand for the coin and for items may be low or volatile.
  - Farming, multi-accounting and collusion may distort rewards despite the countermeasures.
  - Balance changes can change the usefulness, and with it the market value, of items.
- **Technology:**
  - Smart contracts can contain bugs.
  - The game server is a trusted party for match results, which anchoring makes auditable but not trustless.
  - Wallet keys are the players' responsibility.
- **The game:** a competitive economy only works if the game stays fun and fair. Fairness takes priority over revenue in every design decision.

## 9. Open parameters

| Parameter | Section |
| --- | --- |
| Maximum supply of the coin | 4.2 |
| Coins minted per season, and the issuance curve | 4.2 |
| Issuance threshold y % for the registration fee; fee amount and denomination | 4.2 |
| Liquidity or treasury allocation | 4.2 |
| Tournament format (ladder or event days) | 3.1 |
| Minimum matches and rating threshold for payouts | 3.2, 3.4 |
| Participation share and payout curve exponent | 3.3 |
| Drop rates, daily decay, shelf lives | 4.3 |
| Recipes per season, first-discoverer bonus | 4.4 |
| Loadout budget, rotation length, salvage return, royalties | 4.5 |
| Kitchen fee | 4.2, 4.6 |
| Legal entity, jurisdiction, governance, reporting | 6 |
