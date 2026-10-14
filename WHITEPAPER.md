# battlechoc Whitepaper

**Draft.** Version 0.2, October 2026. This document describes a planned extension of battlechoc. Nothing described in sections 4 to 8 exists yet. Open parameters are marked **[TBD]**, and every part of it may change after playtesting and legal review. It is not an offer of any kind, and it does not promise any financial return.

## Contents

1. [Abstract](#1-abstract)
2. [The game](#2-the-game)
3. [Competitive play](#3-competitive-play)
4. [Economy](#4-economy)
5. [Technical architecture](#5-technical-architecture)
6. [Privacy](#6-privacy)
7. [Team, fees and transparency](#7-team-fees-and-transparency)
8. [Governance and the transition to the community](#8-governance-and-the-transition-to-the-community)
9. [Roadmap](#9-roadmap)
10. [Risks](#10-risks)
11. [Open parameters](#11-open-parameters)
12. [Glossary](#12-glossary)

## 1. Abstract

battlechoc is an open-source real-time strategy game for two players. Each player builds a chocolate economy, hides it under cream and fires rum truffles at the opponent's buildings. The game is playable today in the browser against AI opponents. Online play against other players is implemented and goes live with battlechoc's own servers.

This whitepaper describes a competitive layer on top of the game:

- **Monthly tournaments** ranked by a skill rating, with prizes paid in **CHOC**, a native token on Cardano with a fixed supply of indivisible coins.
- **Ingredients** that players find after verified matches. They cannot be traded and they spoil after a while, like real food.
- **Recipes** that turn ingredients into **equipment**: tradable items on Cardano that change how a player's units behave, always with a trade-off and within the same budget for every player.

Coins spent in the game flow back into the tournament pots. Over time the issuance of new coins ends, and the tournaments are funded by the players who take part.

**The game stays free and works without crypto.** Single player works offline, without an account or an internet connection, and online play needs no wallet. The competitive layer is optional.

## 2. The game

Two players face each other on boards of chocolate fields. A match lasts at most ten minutes, and both players act at the same time.

- **Factory:** produces building slots and some cacao. Dark chocolate fields make it faster.
- **Cacao trees:** produce cacao, the resource for buildings. White chocolate fields make them more productive.
- **Cannons, bunnies and ballistas:** reload over time. A shot can be fired early for a cacao price, or for free once the weapon is fully loaded.
- **Cream:** hides whatever is under it from the opponent. Information is a central resource.
- **Specials:** chocolate fountains shield their surroundings, and donut traps punish attacks on the field they guard.

A player loses when the opponent has destroyed their ability to keep playing, or when the time runs out with the lower board value.

**Skill and chance.** Decisions dominate: where to build, what to hide, when to fire early and what to attack. The game also contains random elements: the generated boards, a damage spread of ±20 % per shot, and surprise donuts. Section 10 discusses why this matters.

The game code is open source under AGPL-3.0-or-later. Art and music are licensed under CC BY-NC-SA 4.0.

### 2.1 Ways to play

| Mode | Needs | Counts for tournaments and drops |
| --- | --- | --- |
| Single player against the AI on the device | nothing, works offline | no |
| Online against players or the server-hosted AI | internet, a device account | drops only (section 4.3) |
| Tournaments | a linked Cardano wallet **[TBD: and a credential, section 3.5]** | yes |

## 3. Competitive play

### 3.1 Seasons

A **season** lasts one month. Each season goes through the same steps:

1. **Opening:** the season's parameters are published: the coins minted into the pot, the registration fee, the payout curve, the minimum number of matches and the recipe commitment (section 4.4).
2. **Registration:** players register with their wallet. From phase 2 on (section 4.2), registration costs a fee that goes into the pot.
3. **Play:** ranked matches through matchmaking by rating. **[TBD]** decides between a continuous ranked ladder over the whole season and fixed tournament days with brackets.
4. **Closing:** the final ratings decide the ranks. The server computes the payouts and publishes them as a Merkle root on Cardano (section 5.2), together with the full results for anyone to check.
5. **Dispute window [TBD, e.g. 72 hours]:** players can report errors before payouts open.
6. **Claiming:** each player claims their payout from the pot with a proof. Payouts that are not claimed within **[TBD, e.g. 90 days]** go back into the pot of a later season.

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

This way everyone who takes part gets something, and the best players get the most. CHOC has no decimals, so every payout is rounded down to whole coins. The remainder stays in the pot for the next season.

### 3.4 Incidents

- **Server failure:** the server keeps every running match and continues it after a restart. A match that cannot be continued is **void**: no rating change, no points and no drops for either player. Nothing is estimated or adjusted afterwards.
- **Disconnects:** a player who stays disconnected for longer than the grace period **[TBD, currently 60 seconds]** loses the match.
- **Bugs that affect results:** if a bug changed the outcome of matches, the affected matches are voided by the same rule. Ratings are never corrected by hand.

### 3.5 Fair play and eligibility

- **Only server-hosted matches count.** The server runs every online match: it receives the players' actions, applies the rules, rolls all random numbers from a secret seed and sends each player only what they are allowed to see. Matches played offline on a device do not count for tournaments or drops.
- **Same budget for everyone.** Equipment is limited by a loadout budget that is equal for all players (section 4.5).
- **One person, one tournament account.** Multi-accounting would let one person collect several participation shares. **[TBD after legal review]** whether tournaments require a verifiable credential (KERI/ACDC, for example issued through Veridian) that proves only what is needed, such as being a unique person, of legal age and from an eligible country, without battlechoc ever receiving a name, a document or a birth date.
- **Other measures against multi-accounting and collusion:**
  - a minimum number of matches and a rating threshold for the participation share **[TBD]**;
  - repeated pairings between the same two accounts are detected;
  - automated play is detected server-side.
- **Excluded countries [TBD after legal review]:** where prize competitions or the coin are not allowed, players cannot register for tournaments. They can still play everything else.

## 4. Economy

### 4.1 Overview

```
server-verified match ─────────► ingredients   (off-chain, not tradable, spoil)
season rank ───────────────────► CHOC          (on-chain, fixed supply, no decimals)
recipe + ingredients + CHOC ───► equipment     (on-chain NFT, tradable)
                                 CHOC spent: 90 % to the next pot, 10 % to the team
equipment ──► loadout (same budget for all) · trade · salvage back into ingredients
```

### 4.2 CHOC, the chocolate coin

**Token specification:**

| Property | Value |
| --- | --- |
| Ticker | CHOC **[TBD: tickers are not unique on Cardano, final check before minting]** |
| Chain | Cardano, native token |
| Maximum supply | **[TBD, in the millions, e.g. 10,000,000]** |
| Decimals | none; one CHOC is the smallest unit |
| Minting | only by the season schedule, enforced by an on-chain minting policy (section 5.2) |
| Metadata | registered once in the Cardano Token Registry (CIP-26): name, ticker, logo, description; **no updatable on-chain metadata** |
| Team or investor allocation | **none** |
| Sale | **none**: no presale, no ICO, no private round |

**Issuance through tournaments only.** Each season mints a defined amount of new coins into its pot **[TBD: amount per season and the curve over time, e.g. halving every two years]**. Nobody, including the team, can mint beyond the schedule.

- **Phase 1, free entry:** registration for tournaments is free while issuance is high.
- **Phase 2, registration fee:** once **[TBD: y %]** of the supply has been issued, tournaments charge a registration fee in CHOC **[TBD: amount]**.
- **Phase 3, no issuance:** once the supply is fully issued, no new coins are minted. The pots are funded by registration fees and by the coins players spend in the game.

**Uses of the coin:**
- entering tournaments (phase 2 onward);
- paying the crafting fee for equipment;
- experimenting in the kitchen, if a fee applies there **[TBD]**.

**Round amounts.** All fees are multiples of 10 CHOC, so that the 90/10 split is always exact. Registration fees are multiples of 20 CHOC, so that the 95/5 split is exact as well.

**No initial liquidity.** battlechoc does not provide a liquidity pool, does not sell coins and does not pay exchanges or market makers. The first coins exist after the first season's payout. Whether and where CHOC is traded is up to the players: anyone can create a pool on a decentralised exchange. battlechoc may work with decentralised exchanges and marketplaces on technical integration, without paying or receiving money for it.

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

- Equipment is an **NFT on Cardano** (CIP-68). It is **tradable** on secondary markets **[TBD: royalties on secondary sales (CIP-27), and whether they go to the pot or the team]**.
- **Every item has a gameplay effect.** An item may also change how a unit looks. That also shows the opponent what a player is using, unless the unit is hidden under cream. There are no purely cosmetic items.
- **Side-grades, not upgrades.** Items come with a trade-off. Examples:

  | Item | Effect | Trade-off |
  | --- | --- | --- |
  | Heavy rum barrel (truffle cannon) | +25 % damage | +30 % reload time |
  | Light barrel (truffle cannon) | −20 % reload time | −15 % damage |
  | Dark chocolate walls (factory) | +40 % hit points | building slots 10 % slower |
  | Turbo conveyor (factory) | building slots 15 % faster | one storage space less |

- **Loadout budget.** Every item costs loadout points according to its strength. Every player has the **same budget [TBD]**, so a loadout is a strategic choice, not a matter of how much a player spent.
- **Balance updates.** Item effects are stored in CIP-68 reference metadata. The team multisig (section 5.3) can update them at most once per season. Item holders should expect effects to change when the game is rebalanced.
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
| Unclaimed payouts (section 3.1) | 100 % | 0 % |

The team converts its share into USDCx on Cardano (section 7), once a market for CHOC exists.

**Network fees.** Every transaction on Cardano costs a small fee in ADA. Players pay the network fee for the transactions they start: claiming a payout, registering, crafting and salvaging. battlechoc pays the fees for its own transactions, such as minting a season's coins and publishing roots.

### 4.7 Economic model

Coins enter circulation only through season payouts. They leave the circular flow in two ways: the team's share of fees, and coins that holders keep instead of spending. A worked example with placeholder numbers **[TBD, to be replaced by a simulation]**:

- A season mints 100,000 CHOC into the pot. 1,000 players register, and 800 of them are eligible for a payout.
- With a participation share of 15 %, every eligible player receives 18 CHOC (15,000 / 800, rounded down to a whole coin). The remaining 85,000 CHOC are distributed by rank.
- If those players later spend 20,000 CHOC on crafting, 18,000 CHOC flow into the next pot and 2,000 CHOC go to the team.

The parameters will be chosen with a simulation of the issuance curve, drop rates and fees before the testnet season, and the simulation will be published.

### 4.8 Sustainability

After issuance ends, the system relies on players who enjoy competing and are willing to pay entry fees and crafting fees. The team's share leaves the circular flow, so the economy needs a steady flow of players who value the game. battlechoc does not promise that coins or items will have or keep any market value. The coin is a means to take part in the game.

## 5. Technical architecture

### 5.1 Game server

- The battlechoc server hosts all online matches and is the only authority on their state.
- The rules engine is deterministic: a match can be replayed exactly from its seed and the list of player actions.
- Accounts are device accounts today. For tournaments, players link a Cardano wallet through CIP-30 by signing a challenge from the server.

### 5.2 On Cardano

All validators are written in Aiken. Their source code is open, and the deployed scripts are verified on [uplc.link](https://uplc.link), so that anyone can check through explorers such as CardanoScan or Cexplorer that the code on-chain is the published code.

| Component | Type | Purpose |
| --- | --- | --- |
| CHOC minting policy | minting validator | Enforces the maximum supply and the season schedule. Coins can only be minted into the tournament pot. |
| Tournament pot | spending validator | Holds each season's pot. Pays out only against the season's published Merkle Patricia Forestry root of results and payouts: each player claims their share with a proof and pays the network fee. After the claim period, unclaimed coins can only move into a later season's pot. Enforces the 90/10 and 95/5 splits on deposits **[TBD]**. |
| Equipment minting policy | minting validator (CIP-68) | Allows minting only with the crafting fee paid into the pot and a co-signature of the server confirming the ingredients were used. Burning (salvaging) is always allowed. |
| State anchoring | data on-chain | Ingredient inventories, recipe commitments and season results are kept in a Merkle Patricia Forestry. Its root is published on Cardano twice a week, so the server's records can be audited. |

Players sign all transactions with their own wallets; battlechoc does not keep custody of players' coins or items.

### 5.3 Keys

- **Team multisig:** actions that need the team (publishing roots, updating item effects once per season, moving the team share) require a native multisig of the core team members, currently Fabian Bormann and Sebastian Bode **[TBD: threshold and a backup key, e.g. 2 of 3, so that losing one key does not lock the system]**.
- **Server key:** the game server signs match results and co-signs crafting. It cannot move coins out of the pot, mint CHOC or change item effects. If it is compromised, the team multisig replaces it.
- **No admin backdoor** in the CHOC minting policy: once deployed, the supply and the schedule cannot be changed by anyone.

## 6. Privacy

- battlechoc stores **no personal data**: no names, email addresses, phone numbers, birth dates or documents. Accounts are anonymous device accounts, and a wallet address is the only identifier for tournaments.
- If tournaments require a credential (section 3.5), battlechoc receives only a proof of the required facts, never the data behind them.
- Nothing personal is written on-chain. Published results contain wallet addresses, ratings and payouts.
- Player names are chosen freely and should not be real names.
- Single player stores everything on the player's device.

## 7. Team, fees and transparency

### 7.1 The team

battlechoc is developed by Fabian Bormann and Sebastian Bode, together with contributors under a contributor license agreement. **[TBD: legal entity and jurisdiction.]**

### 7.2 Income and spending

- The team receives no coins from minting and holds no allocation. Its only income from the economy is its shares of fees: 10 % of coins spent in the game and 5 % of registration fees.
- These shares pay for running costs, infrastructure, development and marketing. Running costs today are one server and the network fees for battlechoc's own transactions **[TBD: published budget]**.
- The team sells its share for USDCx, a USD stablecoin on Cardano, which keeps accounting simple and returns coins to the market.
- The team publishes regular reports on its income and the use of funds **[TBD: frequency and format]**.

### 7.3 Trademark

The name battlechoc, its logo and its characters are not covered by the open-source license. Forks of the game must use their own name and must not present their tokens or items as battlechoc's **[TBD: trademark registration]**.

## 8. Governance and the transition to the community

battlechoc starts with a small team because decisions need to be fast while the game and the economy are tested. The goal is that the community takes over step by step **[TBD in detail]**:

1. **Team-run (testnet and the first mainnet seasons):** the team decides on balance changes, new recipes and season parameters, and publishes the reasoning with each change.
2. **Advisory:** the community proposes and discusses changes openly. Proposals that reach enough support **[TBD: how support is measured]** are binding for the team, unless legal or security reasons prevent them.
3. **Community-run:** keys move from the team to a council elected by the players **[TBD: election rules]**. That council controls the multisig for item effects, recipes and season parameters, and the team becomes one contributor among others.

Principles for every stage:

- **Voting power should not be bought.** Voting weighted only by coin holdings would hand the game to the richest players. Proposed alternatives: one vote per verified player, or votes weighted by participation over past seasons **[TBD]**.
- **Fixed rules stay fixed.** The supply, the issuance schedule and the absence of a team allocation are enforced on-chain and cannot be changed at any governance stage.
- **The code stays open.** Anyone can run the game, inspect the server and propose changes.

**If the team stops.** If the team can no longer run the servers, it hands the servers, the recipe data and the multisig to the community council. If no council exists yet, it publishes the recipe data and the server configuration so that the community can continue. Coins and items stay in the players' wallets in any case, and unclaimed payouts remain claimable until the end of their claim period.

## 9. Roadmap

1. **Live game:** the real-time game with online play on battlechoc's own servers. Done in code, deployment pending.
2. **Season zero:** tournaments with ratings and payouts in points only, no token. This validates balance, rating, payout curve, anti-cheat and real interest.
3. **Testnet season:** CHOC, equipment, kitchen and payouts on a Cardano test network.
4. **Mainnet:** after a legal review and an independent audit of the on-chain components.
5. **Community transition:** stages 2 and 3 of section 8.

## 10. Risks

- **Regulation:**
  - A token offered to the public in the EU may fall under MiCA, which has its own white paper and notification rules. battlechoc does not sell the token, but a legal review must still confirm how MiCA applies.
  - Prizes combined with entry fees can fall under gambling law where chance plays a role.
  - Rules on securities and investment contracts may apply.
  - App stores have specific policies for blockchain features and real-money gaming.

  battlechoc will launch the token only after a legal review.
- **Economy:**
  - Demand for the coin and for items may be low or volatile.
  - Without initial liquidity there may be no market for CHOC at first, and the first pools will be small, with prices that change quickly.
  - Farming, multi-accounting and collusion may distort rewards despite the countermeasures.
  - Balance changes can change the usefulness, and with it the market value, of items.
- **Technology:**
  - Smart contracts can contain bugs.
  - The game server is a trusted party for match results, which anchoring makes auditable but not trustless.
  - Wallet keys are the players' responsibility. Lost keys mean lost coins and items.
- **The game:** a competitive economy only works if the game stays fun and fair. Fairness takes priority over revenue in every design decision.

## 11. Open parameters

| Parameter | Section |
| --- | --- |
| Maximum supply of CHOC (in the millions) and final ticker check | 4.2 |
| Coins minted per season, and the issuance curve | 4.2 |
| Issuance threshold y % for the registration fee; fee amount (a multiple of 20 CHOC) | 4.2 |
| Tournament format (ladder or event days) | 3.1 |
| Dispute window and claim period | 3.1 |
| Minimum matches and rating threshold for payouts | 3.2, 3.5 |
| Participation share and payout curve exponent | 3.3 |
| Credential requirement and excluded countries | 3.5 |
| Drop rates, daily decay, shelf lives | 4.3 |
| Recipes per season, first-discoverer bonus | 4.4 |
| Loadout budget, rotation length, salvage return, royalties | 4.5 |
| Kitchen fee | 4.2, 4.6 |
| Multisig threshold and backup key | 5.3 |
| Legal entity, jurisdiction, budget, reporting, trademark | 7 |
| Governance stages, voting and election rules | 8 |

## 12. Glossary

| Term | Meaning |
| --- | --- |
| ACDC | Authentic Chained Data Container: a verifiable credential format built on KERI. |
| Aiken | A programming language for Cardano smart contracts. |
| CHOC | The battlechoc coin. |
| CIP | Cardano Improvement Proposal. CIP-26: off-chain token metadata registry. CIP-27: royalties. CIP-30: wallet connection for web apps. CIP-68: NFTs with updatable reference metadata. |
| Glicko-2 | A rating system that tracks a player's skill and how certain that estimate is. |
| KERI | Key Event Receipt Infrastructure: a system for self-managed identifiers and keys. |
| Merkle Patricia Forestry (MPF) | A data structure whose single root value commits to a large set of records; a short proof shows that a record is part of it. |
| Multisig | A key that needs signatures from several people to act. |
| Season | One month of tournament play, ending with a payout. |
| Spending validator | A Cardano script that decides when coins at its address may be spent. |
| USDCx | A USD stablecoin on Cardano. |
| Veridian | An identity wallet and platform for KERI/ACDC credentials. |
