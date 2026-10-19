# The World of Janus: Design

A hidden-identity diplomacy game for 3–8 friends on Discord, tuned for 4–5 players and about 35 minutes.

## The core idea

There are two layers, and the game lives in the gap between them.

| | Surface layer (public) | Board layer (hidden) |
|---|---|---|
| Who you are | Your name and historic persona (Napoleon, Cleopatra…) | A nation icon on the map (🦁 🦅 🐉…) |
| What others know | Everything | The icon, its location and its 3 resources |
| What's secret | Which icon you rule, and your faction | Who rules each icon |

Day actions are signed with your persona. Night actions are reported by icon only. Players have to connect the two.

## Factions

| Faction | Knows | Wins when (placeholder until War) |
|---|---|---|
| **Iron Pact** | Each other's icons | Any Pact player is still hidden at the end, **or** the Tribunal exposes an innocent |
| **Concord** | Possibly one trusted partner (5+ players) | Every Pact player is exposed without exposing an innocent |
| **Free Trader** | Nobody | ≥ 4 goods flowing through their trade routes (wins alongside whoever else wins) |

### Player counts

Bot nations ("no ruler") fill the map so small groups still have plenty to deduce.

| Players | Pact | Concord | Trader | Nations on map | Concord pairs |
|---|---|---|---|---|---|
| 3 | 1 | 2 | 0 | 6 | 0 |
| 4 | 1 | 2 | 1 | 6 | 0 |
| 5 | 1 | 3 | 1 | 7 | 1 |
| 6 | 2 | 3 | 1 | 7 | 1 |
| 7 | 2 | 4 | 1 | 8 | 1 |
| 8 | 2 | 5 | 1 | 8 | 2 |

## Round structure (6 rounds)

1. **☀️ Harvest.** Every city gets +1 of each of its 3 resources. Then one pair of dice is rolled, and each matching tile yields 2. Trade routes add a bonus (see below).
2. **☀️ Day: Diplomacy (public, by persona).** Talk on Discord.
   - **Trade** cards with other players. Trades are logged publicly.
   - **Sell** at the market for gold. Sales are public and push the price down.
   - **Tribunal** (from round 3): a majority vote exposes a player's city and faction.
3. **🌙 Night: Under the Table (secret, by city).**
   - **✉️ Envoy** (🌾 Grain + 🐑 Wool): ask another city for a connection. **If they accept, they alone learn the sender's persona.** Unanswered envoys expire after a day and a night.
   - **🤝 Open trade** (🪵 Timber + 🪨 Stone) in one good with a connected city. From then on, whenever either city harvests that good, the other gets 1 too.
   - **🕵️ Spy** (4 gold): ask whether a specific player rules a specific city. Only you get the answer, but the news reports "spies spotted".
   - **🕶️ Smuggle** (market price × 1.5 in gold): buy one card, delivered at dawn. Nobody sees who bought it.
   - **🕶️ Pump** (2 gold): fake demand for a resource so its price jumps in the morning. Sell high the next day, but selling right after a spike looks suspicious.
4. **📰 Morning news.** All night activity, listed by city icon in shuffled order, plus market moves. Spending, smuggling and pumping all push prices up.

### Limits
- Each city can have at most **3 connections**, and each connection can carry at most **2 traded goods**.
- Everyone's **card count** (not which cards) is public. It updates at dawn and after public trades or sales, never in the middle of the night, so spending can't be watched as it happens. Hoarding shows.

## Trading is cover

Each city produces only 3 of the 7 resources, and the recipes need specific cards. So most players **can't act at night without getting cards from someone**:
- **Trade by day:** cheap, but public. Asking for 🌾 Grain hints that you're planning an envoy.
- **Smuggle by night:** secret, but expensive.
- **Decoy trades:** trading for cards you don't need muddies what you're really up to.

## How deduction works
1. Public trades and sales reveal which resources a persona holds and wants.
2. Each city's 3 resources are public, so holdings point to a small set of cities.
3. The recipes tie night actions to specific cards: whoever just traded for 🌾 + 🐑 probably sent that envoy.
4. The news reports city-to-city activity. Market moves show what was spent, smuggled or pumped.
5. Card counts show who is hoarding.
6. Accepted envoys and spies give hard facts privately; the Tribunal gives them publicly.

## Decisions log
- Factions are fictional; historic figures are cosmetic personas.
- Envoys: the sender's persona is revealed to the receiver only, and only on accept. The news reports the connection by icon. *Revisit after playtests.*
- Accepting a bot's envoy reveals "no player rules this city". That's a real clue, and intentional for now.
- Session length is about 35 minutes. Multi-day play is parked for now.
- Hosting: static site on GitHub Pages plus peer-to-peer (the host's browser runs the game). No server.

## Roadmap
- [x] **M1: Diplomacy loop.** Map, harvest, trade, market, envoys, routes, spies, news, Tribunal, bots, P2P rooms
- [x] **M1.5: Economy.** Specific recipes, black market (smuggle, pump), route caps, public card counts, sound cues, quit to home
- [ ] **M2: Arms and War.** Weapons need ⛏️ Ore + 🔥 Coal **and gold** (money pays for armies); forts need stone and timber; attacks are dice plus weapons vs forts plus secret ally support. Hoarding war materials is a tell. The Pact's real win becomes conquest.
- [ ] **M3: Nobody sits out.** A conquered player becomes a *Government in Exile*: still wins with their faction, still votes, earns Unrest to sabotage occupiers, and can plant one rumor in the news each round.
- [ ] **M4: Persona abilities** that leave fingerprints, e.g. Spymaster envoys show as ❓ in the news.
- [ ] Phase timers (2 min day / 60 s night), host reconnect and saved state.
