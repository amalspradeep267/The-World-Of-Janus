# The World of Janus: Design

A hidden-identity trading game for 3–8 friends on Discord, tuned for 4–5 players and about 35 minutes.

## The core idea

| | Surface (public) | Board (hidden) |
|---|---|---|
| Who you are | Your player name | A city on the map: 🗽 New York, 💂 London, 🗼 Paris, 🏖️ Rio, 🏯 Tokyo, 🐪 Cairo, 🏛️ Rome, 🦘 Sydney |
| What others see | Everything you do by day: trades, sales, votes | Each city's 3 resources and everything it does at night |
| What's secret | Which city you rule, and your faction | Who rules each city |

Day actions are signed with your name. Night actions are reported by city only. **Identity is worked out by matching the two**, mostly through day-time trading and sales.

## Factions

| Faction | How many | Starts knowing | Wins when |
|---|---|---|---|
| 🔴 **The Syndicate** | 1 (2 with 6+ players) | Every Syndicate member's city | Any Syndicate member is still unexposed at the end of round 6 |
| 🔵 **Concord** | Everyone else | Nothing, or one trusted partner (5+ players) | Every Syndicate member has been exposed at the Tribunal |

The Syndicate alone can use the 🕶️ black market.

### 🟡 Free Trader: a title, not a faction
Anyone, Syndicate or Concord, whose city reaches **7 supply lines** (goods opened on its connections; the maximum is 8) earns the **Free Trader** title at the end of that night. It's permanent and **secret**: only the holder is told, because supply lines are visible on the map and naming the holder would point at their city. The title grants the **Tribunal veto**. It doesn't change your faction or how you win. A big trade empire is expensive and conspicuous, so whoever builds one starts to look like the Syndicate. Unruled **bot cities** fill out the map so small groups still have plenty to work out:

| Players | Syndicate | Concord | Cities on map | Concord pairs |
|---|---|---|---|---|
| 3 | 1 | 2 | 6 | 0 |
| 4 | 1 | 3 | 6 | 0 |
| 5 | 1 | 4 | 7 | 1 |
| 6 | 2 | 4 | 7 | 1 |
| 7 | 2 | 5 | 8 | 2 |
| 8 | 2 | 6 | 8 | 2 |

## A round (6 rounds)

1. **☀️ Harvest.** Every city gets +1 of each of its 3 resources. One **12-sided die** is rolled, so every number from 1 to 12 is equally likely, and each tile with that number yields 2 more. Each city's three tiles get three different numbers. Trade routes add a share of partners' harvests.
2. **☀️ Day (public, signed with your name).** Talk on Discord.
   - **🔁 Trade** cards with other players. Every completed trade is in the public record.
   - **💰 Sell** cards at the market for gold. Every sale is public, including how much it earned.
   - **⚖️ Tribunal** (from round 3): see below.
3. **🌙 Night (secret, by city).**
   - **✉️ Envoy** (🌾 Grain + 🐑 Wool, plus travel gold): ask another city for a connection. If they accept, they alone learn who sent it. Unanswered envoys expire after a day and a night.
   - **🤝 Open a supply line** (🪵 Timber + 🪨 Stone, plus travel gold): pick a good on an existing connection. From then on, whenever either city produces it, the other gets 1 too. *(Not to be confused with day-time trades, which are free one-off swaps between players.)*
   - **🏭 Build a factory** (⛏️ Ore + 🔥 Coal, on one of your own tiles): that tile makes **+1 of its resource every dawn**, regardless of the dice, from the next morning. That's 2 per dawn instead of 1, plus the usual +2 when the die hits. One per tile, so at most 3 per city. Use the surplus to trade in bulk or sell. Factories show on the map and in the news, and their output flows down supply lines too. (`FACTORY.tiles` in constants.ts can restrict factories to e.g. ⛏️ 🔥 🧵 tiles.)
   - **🕵️ Spies** (12 gold): report one city's **total gold received and total gold spent** that round. No breakdown and no identities: players do the maths against the public sales.
   - **🕶️ Black market (Syndicate only):** **Smuggle** one card for 1.5× its price, or **Pump** a resource's price for 6 gold.
   - **🗡️ Kidnap (Syndicate only, 15 gold, one per night):** see below.
   - **🛡️ Hired security (Syndicate only, 8 gold, day or night):** bribes spies sent to your city that night. Their report leaves out illegal gold (ransoms, black market, kidnapping, security), while legal sales and spending still show.
4. **📰 Morning news.** Every night action, listed by city in shuffled order, plus market moves. Everyone gets the newspaper.

### Limits and distance
- Each city can have at most **4 connections**, and each connection at most **2 supply lines** (goods).
- **Distance costs gold.** Envoys and supply lines cost 2 gold per hex between the two capitals beyond the first 2 hexes, up to about 8 gold across the map. Travel gold shows up in spy reports.
- Everyone's **card count** (not which cards) is public. It updates at dawn and after public trades or sales, never mid-night.

## Money and markets
- **Prices start at 10 gold per card** and are always whole numbers. A sale pays exactly the listed price.
- **Prices move on relative supply and demand.** Supply is units harvested plus units sold. Demand is units spent on recipes, smuggled or pumped. Each resource is compared with the average of all seven, so only goods that are scarcer or more plentiful than the rest move. Prices don't all slide down just because every city harvests each morning. Moves are capped at 30% per night, and a price never falls below 2.
- **Gold** starts at 15. It comes from sales and pays for spies, the black market and tariffs. It will also matter in War.

## The Tribunal (from round 3)

| Step | Rule |
|---|---|
| Enter | Pay 4 gold to join today's Tribunal, or abstain |
| Convene | It sits at dusk only if **3+ players** entered; otherwise every fee is refunded |
| Vote | Only entrants vote, for free; votes can change until dusk. Anyone can be accused, entrant or not |
| Verdict | A **majority of entrants** exposes the accused: their city is revealed, and they pay a 🚫 **tariff** from then on (5 gold per trade, 25% less from sales) |
| Innocent exposed | Everyone who voted for them is fined **8 gold** |
| 🟡 Veto | A Free Trader (title holder), if inside, can secretly arm a veto (10 gold, refunded if there's no verdict). It strikes the verdict down; the news says only "a secret veto" |
| Host setting | By default an exposure also reveals the **faction**. The host can switch that off when creating the room, like Among Us's anonymous ejects |

Exposing every Syndicate member wins the game for the Concord immediately. All Tribunal fees and fines appear in spy reports.

## 🗡️ Kidnapping: why you keep your city secret

Without a reason to hide, the Concord could simply announce their cities to each other and corner the Syndicate. Kidnapping makes a known location dangerous.

- **Order:** a Syndicate member seizes a citizen of a city, naming the player they think rules it (15 gold).
- **Right guess:** that city's ruler pays the kidnapper **5 gold every dawn** to keep the citizen safe, starting that same dawn. They're told, but not by whom. The news reports "Citizen kidnapped!" with the city only.
- **Wrong guess**, including a bot city: the kidnapper is **exposed in the morning newspaper** with their name, city and faction, and is tariffed. That counts toward the Concord's win.
- **Ends** when the kidnapper is exposed by any means. A player can only be held by one kidnapper, and the Syndicate can't kidnap its own members.
- **Leaves a trail:** ransom is gold received without any public sale behind it. Spies see the total, and players can do the maths, unless the kidnapper hired security.

## How identity gets worked out
1. **Recipes force public trading.** Most cities lack 🌾 + 🐑 or 🪵 + 🪨, so whoever traded for Grain and Wool today probably sent tonight's envoy.
2. **Each city's 3 resources are public.** Whatever someone gives away in trades points to a few possible cities.
3. **Spies plus public sales.** "Sydney received 44 gold and spent 12" can be checked against who sold what by day; gold that doesn't add up points at illegal income.
4. **Card counts** show who's hoarding.
5. **Market moves** hint at what was spent or pumped. Only the Syndicate can pump.
6. **Accepted envoys** tell the receiver who sent them. **The Tribunal** reveals someone to everyone.

## Decisions log
- Factions are fictional. Players are shown by their own names; personas were removed as redundant.
- Envoys reveal the sender to the receiver only, on accept. *This is the one remaining non-trading way to learn an identity. Revisit after playtests.*
- Spies reveal treasuries, not identities.
- The black market and kidnapping are Syndicate-only.
- Accepting a bot's envoy reveals "no player rules this city", and spies on a bot city find an empty treasury. Both are real clues.
- Session length is about 35 minutes.
- Hosting: static site on GitHub Pages plus peer-to-peer (the host's browser runs the game). No server.

## Known issues
- **Watch whether the Tribunal is still brute-forceable.** Entry fees and 8-gold fines for wrong accusations make guessing expensive, but a rich table might still cycle through suspects. Tune `TRIBUNAL` in constants.ts after playtests.
- **The Syndicate is passive until War.** It wins by staying hidden.

## Roadmap
- [x] **M1: Diplomacy loop.** Map, harvest, trade, market, envoys, routes, news, Tribunal, bots, P2P rooms
- [x] **M1.5: Economy.** Recipes, black market, route caps, card counts, sound cues, quit to home
- [x] **M1.6:** Relative pricing, whole-number gold, treasury spies, the Syndicate, tariffs, player names, map panning
- [x] **M1.7:** Distance costs, paid Tribunal with fines, host setting for anonymous exposure
- [x] **M1.8:** Free Trader becomes a secret title (7 supply lines) that grants the veto; two factions only
- [x] **M1.9:** One d12 for harvests (equal odds); clearer "You" marker
- [x] **M1.10:** Kidnapping (Syndicate); clearer trade card picker
- [x] **M1.11:** Spy reports show totals only; hired security for the Syndicate; kidnapping takes a citizen
- [x] **M1.12:** "Trade routes" renamed **supply lines**; 🏭 factories on your own tiles (+1 per dawn, one per tile)
- [ ] **M2: Arms and War.** Weapons need ⛏️ Ore + 🔥 Coal **and gold** (money pays for armies); forts need stone and timber; attacks are dice plus weapons vs forts plus secret ally support. Hoarding war materials is a tell. The Syndicate's active win becomes conquest.
- [ ] **M3: Nobody sits out.** A conquered player becomes a *Government in Exile*: still wins with their faction, still votes, and can sabotage occupiers.
- [ ] Phase timers, host reconnect and saved state.
