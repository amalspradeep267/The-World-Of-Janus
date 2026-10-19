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

1. **☀️ Harvest.** Everyone's nation gets +1 of each of its 3 resources. Then 2d6 is rolled twice, and each matching tile yields 2. Trade routes add a bonus (see below).
2. **☀️ Day: Diplomacy (public, by persona).** Talk on Discord.
   - **Trade** resources with other players. Trades are logged publicly, so giving away 🧵 Silk hints that you rule a Silk nation.
   - **Sell** at market for gold. Sales are public and push the price down.
   - **Tribunal** (from round 3): a majority vote exposes a player's nation and faction.
3. **🌙 Night: Under the Table (secret, by icon).**
   - **Envoy** (any 2 resources): ask another nation for a connection. The target accepts or declines. **If they accept, they alone learn the sender's persona.** Unanswered envoys expire after a day and a night.
   - **Open trade** (any 3 resources) in one good with a connected nation. From then on, whenever either nation harvests that good, the other gets 1 too. Routes are mutual, so you may be feeding your enemy.
   - **Spy** (4 gold): ask whether a specific player rules a specific nation. Only you get the answer, but the news reports "spies spotted in 🐉".
4. **📰 Morning news.** All night activity is listed by icon in shuffled order, plus market moves ("🌾 Grain ▲ 16%"). Spending pushes prices up, so the markets hint at what was paid.

## How deduction works
1. Public trades and sales reveal which resources a persona holds.
2. Each nation's 3 resources are public, so holdings point to a small set of nations.
3. The news reports icon-to-icon activity.
4. Market moves show which resources were spent.
5. Routes and pending envoys are drawn on the map.
6. Accepted envoys and spies give hard facts privately; the Tribunal gives them publicly.

## Decisions log
- Factions are fictional; historic figures are cosmetic personas.
- Envoys: the sender's persona is revealed to the receiver only, and only on accept. The news reports the connection by icon. *Revisit after playtests.*
- Accepting a bot's envoy reveals "no player rules this nation". That's a real clue, and intentional for now.
- Session length is about 35 minutes. Multi-day play is parked for now.
- Hosting: static site on GitHub Pages plus peer-to-peer (the host's browser runs the game). No server.

## Roadmap
- [x] **M1: Diplomacy loop.** Map, harvest, trade, market, envoys, routes, spies, news, Tribunal, bots, P2P rooms
- [ ] **M2: Arms and War.** Rounds 3–4 unlock borders and weapons (refined goods such as Steel = Ore + Coal, only via routes); rounds 5–7 allow attacks (dice plus weapons vs fortifications plus secret ally support). The Pact's real win becomes conquest: 60% of the map.
- [ ] **M3: Nobody sits out.** A conquered player becomes a *Government in Exile*: still wins with their faction, still votes, earns Unrest to sabotage occupiers, and can plant one rumor in the news each round.
- [ ] **M4: Persona abilities** that leave fingerprints, e.g. Spymaster envoys show as ❓ in the news.
- [ ] Phase timers (2 min day / 60 s night), host reconnect and saved state, sound cues.
