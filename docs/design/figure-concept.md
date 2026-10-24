# Landing-page colorfigure: concept

Status: concept, 2026-10-24. Branch `feat/ui-overhaul`. Not yet built.

One hand-inked, turnable, see-through isometric object on the Next.js landing page that explains
GossipSub v1.1 physically. Built with the owner's `colorfigures` skill (`core.js` engine + one figure
script, built to one HTML file, embedded in an `<iframe>` or inlined as a client component).

Protocol facts the mapping must respect (from `docs/protocols.md`, `backend/gossip/engine.py`,
`backend/gossip/scoring.py`):

| Rule | Luminar value | Where |
|---|---|---|
| Mesh degree D / D_LOW / D_HIGH / D_LAZY | 6 / 4 / 8 / 6 | `engine.py:33-36` |
| Heartbeat | 1 s; order is `scorer.decay` → sybil spam pass → prune → graft → IHAVE → IWANT | `engine.py:395-499` |
| GRAFT | below D_LOW, add highest-scored candidates with score > −5 up to D; random fallback | `engine.py:450-468` |
| PRUNE | any mesh peer with score < −10 ("score"); then above D_HIGH, lowest-scored down to D ("overflow") | `engine.py:421-447` |
| Flood publish | first hop to every topology neighbour; later hops along mesh only | `protocols.md` 7.1 |
| IHAVE / IWANT | last 10 msg_ids of a 50-deep history to up to 6 non-mesh neighbours; pulls fulfilled at heartbeat granularity | `engine.py:479-499` |
| P1 | time in mesh × 0.5, capped at +5 | `scoring.py:117-119` |
| P2 | first deliveries × 1.0, ×0.9 per heartbeat | `scoring.py:121-122` |
| P3 | after 5 s in mesh, if delivery ratio < 0.5: −(deficit²) → floor −0.25 | `scoring.py:124-130` |
| P4 | invalid × −10, ×0.5 per heartbeat; a sybil spamming once per beat converges at −20, crossing −10 on beat 2 | `scoring.py:132-133`, `engine.py:402-406` |
| Sybil | `sybil-N` snapshot node, spams every honest mesh it sits in once per heartbeat | `engine.py:502-528` |
| Eclipse | `eclipse-N` silent; cuts honest↔target relay and GRAFT only; IHAVE/IWANT still reach the target; scoring sees only P3 (−0.25 floor), so the fault must clear | `engine.py:297-299`, `_misbehave` docstring |
| Partition | cuts relay, GRAFT, IHAVE and IWANT between halves | `engine.py:283-295` |

All copy on the figure: "same mechanism, toy constants". Never "the scoring your beacon node runs".

---

## Candidate A: Pneumatic-tube sorting office

A brass-and-cream post-office sorting desk from the 1930s: one operator's station in the middle, six
glass tubes rising from it to a ring of six neighbour stations drawn small on the board edge, a
central vacuum pump underneath, and a wall of pigeon-holes behind.

### Metaphor mapping

| Protocol | Physical part / motion |
|---|---|
| Peer | The sorting station (centre) and six small neighbour stations on the board rim |
| Message | A capsule (cream cylinder, orange band = fresh, grey = seen) |
| Mesh link | A glass tube from the station's manifold to a neighbour; capsules visibly travel |
| D = 6 | The manifold has six brass ports; D_LOW 4 / D_HIGH 8 are two scribed marks on the port drum (4 ports are red-lined "minimum", ports 7–8 are a hinged overflow pair that the clerk unbolts) |
| Flood publish | The "POST" bell-push on the desk; the first capsule drops into a splitter cone that shoots a copy down every tube at once, mesh or not (a seventh and eighth stub tube to non-mesh neighbours flare open only for this hop) |
| GRAFT | The clerk's arm swings a loose tube end onto an empty port; a bayonet collar locks it (click) |
| PRUNE | The port's weight-balance tips, the collar springs open, the tube end drops off and hangs |
| Peer score P1–P4 | Each port has a brass balance beam with a sliding weight: P1 is a clockwork winder that slowly adds weight (capped at 10 turns = +5), P2 adds a brass token per first-arrival that a leak lets slip (0.9/beat), P3 is a counterweight that drops only when the port's arrival ratio dial reads under half (max −0.25, pins the needle gently), P4 is a lead slug of 10 per invalid capsule, halved each beat as it melts out of a sieve |
| GRAFT threshold −5 | Red line on the balance scale; the collar will not lock below it |
| PRUNE threshold −10 | Lower red line; the trip lever fires the collar |
| Heartbeat 1 s | A cam shaft under the desk, one turn per second; its lobes in order: the sieve shake (decay), the spam valve, the trip levers, the lock arm, the ticket punch, the pull valve |
| IHAVE | A punched paper ticket (last 10 capsule numbers) pushed through a thin ticket slot to up to 6 non-tube neighbours on each cam turn |
| IWANT | The neighbour's ticket comes back with holes torn; the pull valve opens and a vacuum line (thin, grey, not a glass tube) sucks the capsule across on the next cam turn |
| Sybil flood | A red "sybil" hopper bolted to one port spitting red capsules once per cam turn; its P4 slug lands twice, the beam tips past −10 on the second turn, the collar fires, the tube drops |
| Eclipse | A matte hood lowered over the station: all six glass tubes are capped at the hood, but the ticket slot still works, so capsules keep arriving by vacuum line, late. The balance beams do not move more than the P3 counterweight (−0.25): nothing trips. Only lifting the hood fixes it |
| Partition | A sliding bulkhead across the board; tubes, ticket slot and vacuum lines on the far side are all cut; capsules pile against it |

### Parts list (42)

**Case (8):** desk body (cream, rounded, rrUV sweep), desk top (dark wood), modesty panel, brass
kick-plate, pigeon-hole wall (back), serial plate "SORTER No. 6", two rubber feet rails, board.

**Structure (9):** port drum (6 brass ports + 2 hinged overflow ports), manifold casting, six glass
tubes (split in two pieces each at the drum rim), six neighbour stations (small boxes on the board rim
with one port each), tube hangers (brackets on the pigeon-hole wall), bulkhead rail, hood rail and
hood, bulkhead.

**Mechanism (14):** splitter cone, capsule gate, six bayonet collars, six balance beams with
sliding weights, six clockwork P1 winders, P2 token tray with leak slot, P3 ratio dial and
counterweight, P4 lead sieve, trip levers, lock arm, ticket punch and ticket roll, ticket slot, pull
valve, vacuum line (thin pipe, port to port along the desk back).

**Power (6):** vacuum pump (cylinder + flywheel) under the desk, pump belt, cam shaft with six lobes,
cam motor, pressure gauge, pressure line pump→manifold.

**Controls (5):** POST bell-push, GRAFT lever, sybil hopper latch, hood crank, bulkhead handle.

### Buttons (5)

1. **Post** — a capsule drops into the splitter; copies shoot down all tubes to all six neighbours
   plus the two stub tubes (flood). Neighbour stations light; the capsule band turns grey at each.
   P2 tokens land on whichever port's neighbour was first.
2. **Heartbeat** — one cam turn, animated in order: sieve shakes (decay), spam valve, trip levers,
   lock arm, ticket punch, pull valve. Each lobe's part flashes orange while it acts.
3. **Bolt on a Sybil** — the red hopper clamps onto port 3; red capsules spit on every heartbeat.
   Press Heartbeat twice: beam tips to −10 on the second, collar fires, tube drops, hopper left
   hanging on a dead port. (Pressing Post while the sybil is attached: red capsules spill into the
   gate and are rejected to a bin.)
4. **Lower the hood** (eclipse) — hood drops over the station, glass tubes capped; Post from a
   neighbour now arrives only by ticket + vacuum line, one heartbeat late. Beams barely move. Button
   turns into **Lift the hood**.
5. **Slide the bulkhead** (partition) — bulkhead cuts ports 4–6; capsules pile against it; stats
   show delivered-to drop to the near half. Button toggles back.

Out-of-order: Heartbeat with nothing posted → cam turns, nothing moves but the sieve (`ui.flash`
"nothing in the history yet"). Sybil while hooded → `flash("lift the hood first")`.

### Stats (top right)

`mesh 6/6` · `score port-3 −20.0` (live, the tipped port) · `delivered 6/6` · `IWANT pulls 0` ·
`beat 7`. Constants labelled "toy" in the label pill: `D 6 (toy)`.

### See-through

Desk and tubes fade to ghost; inside: cam shaft with its six lobes and the cam motor, pump + belt +
flywheel, the pressure line, the six balance beams with all four weights each, the ticket punch
and roll, the vacuum line running port to port along the back wall, the P4 sieve and the rejected
bin. Labels: `CAM SHAFT (1 s)`, `P1 WINDER`, `P2 TOKENS`, `P3 COUNTERWEIGHT`, `P4 SLUG`, `TRIP
LEVER −10`, `LOCK ARM −5`, `TICKET PUNCH (IHAVE)`, `PULL VALVE (IWANT)`, `SPLITTER (FLOOD)`.

### On the dark dithered page

Framed plate (see shared notes at the end). Body swatch: off-white desk (`l #f2f2ef / m #d4d3cd /
d #a7a69f`), brass ports in a warm grey-gold kept desaturated (`#cbb98a`), glass tubes `#cfe9f0` at
low opacity, orange `#ff5a2c` only for fresh capsule bands and the active heartbeat lobe. Red sybil
capsules use the colorfigures status red `#e2483d`.

---

## Candidate B: Cord telephone switchboard

A wooden cord-board exchange: one operator position with a vertical jack field, a horizontal cord
shelf with six cord pairs, ring/listen keys, drop-shutter annunciators, a hand-crank generator and a
ticking "heartbeat" clock on the shelf.

### Metaphor mapping

| Protocol | Physical part / motion |
|---|---|
| Peer | This position; each jack on the field is a neighbour |
| Message | A lamp pulse travelling down a cord |
| Mesh link | A plugged cord: one end in this position's multiple, the other in a neighbour jack |
| D = 6 | Six cord pairs on the shelf; D_LOW 4 is a brass pin at cord 4 ("minimum service"), D_HIGH 8 is two spare cords under a flap the operator can borrow and must return |
| Flood publish | Ring key thrown: every lamp in the whole jack field flashes once, plugged or not |
| GRAFT | Operator's hand lifts a cord from the shelf and seats it in a jack (shutter clicks up) |
| PRUNE | The jack's drop-shutter falls over it; the cord is pulled out and retracts on its pulley weight |
| P1–P4 | A meter strip under each jack, like a line-load meter: P1 a slow-rising mercury column (capped), P2 a peg counter that unwinds 10% per tick, P3 a small red flag that rises only when under half the expected pulses arrived (floor −0.25), P4 a fuse that blows −10 per bad pulse and re-heals by half each tick |
| Thresholds | Two etched lines on the meter: −5 "do not plug", −10 "pull" |
| Heartbeat | The shelf clock; its escapement visibly advances the meter decay, the fuse heal, the shutters, the cord check, the chit printer, the chit reader |
| IHAVE | A printed chit (last 10 call numbers) slid into a chit rack on each unplugged neighbour jack |
| IWANT | The neighbour's chit comes back with a tick; a thin order-wire (not a cord) carries the pulse on the next clock tick |
| Sybil flood | A red handset clipped to one jack ringing on every tick: its fuse blows twice, the shutter drops, the cord retracts |
| Eclipse | A felt dust cover dropped over the whole position: all cords are capped but the chit rack still passes; pulses arrive by order-wire a tick late; meters barely move |
| Partition | A hinged section of the jack field folds away; cords to it go slack and drop |

### Parts list (40)

**Case (7):** wooden cabinet, vertical jack-field panel, horizontal cord shelf, writing ledge,
cable turret (back), brass name plate, board.

**Structure (8):** jack field (grid of 6×6 jacks), six cord pulleys under the shelf, pulley weights,
cord guide bar, spare-cord flap, hinged field section, dust cover and hinge, chit rack (one per jack).

**Mechanism (14):** six cords with brass plugs, six drop shutters, six meter strips (mercury column,
peg counter, red flag, fuse), ring key, listen key, shelf clock with escapement, chit printer, chit
reader, order-wire (thin, along the turret), cord-retract springs, red sybil handset and its clip.

**Power (6):** hand-crank magneto, ringing generator, 48 V battery box under the cabinet, fuse panel,
main cable into the turret, lamp bus bar.

**Controls (5):** ring key, listen key, clock advance, dust-cover pull, field-section latch.

### Buttons (5)

1. **Ring** (flood publish) — every lamp in the field flashes; plugged neighbours' pegs advance.
2. **Tick** (heartbeat) — escapement clicks; meters decay, fuses heal, shutters checked, cords
   seated/pulled, chits printed and read, order-wire pulses.
3. **Clip the red handset** (sybil) — ringing on a jack each tick; two ticks later its shutter drops
   and the cord retracts with a thump.
4. **Drop the cover** (eclipse) — cords capped, chits still pass, pulses arrive late by order-wire.
5. **Fold the field** (partition) — three jacks hinge away, their cords fall slack.

### Stats

`cords 6/6` · `fuse j-3 −20` · `lamps lit 6/6` · `order-wire pulls` · `tick`.

### See-through

Cabinet to ghost; inside: magneto, generator, battery box, lamp bus bar, cord pulleys and weights,
retract springs, clock escapement, chit printer, order-wire, fuse panel. Labels as above.

### On the dark page

Framed plate. Body: off-white panels, walnut shelf as dark grey-brown (`#5a4e45`) so the only
warm/saturated colour is the orange lamp and the red handset. Brass desaturated.

Weakness: messages are lamp pulses, not objects. Flood and relay look alike on a lamp field, and
D=6 reads as "six cords" only once you know. Strong on GRAFT/PRUNE (plug/unplug is the clearest
possible motion for mesh membership) and on eclipse (the dust cover is a good eclipse).

---

## Candidate C: Railway signal box with a lever frame

A timber-and-brick signal box on a board: a six-lever interlocking frame inside, a block
instrument and bell on the shelf, six semaphore signals on short posts around the box each
guarding a short piece of track to a neighbouring box, a token exchange post and a crossover with a
hand-worked bulkhead gate.

### Metaphor mapping

| Protocol | Physical part / motion |
|---|---|
| Peer | This box; neighbour boxes are small cabins on the board rim |
| Message | A token (brass ring on a staff) carried along a track by a small trolley |
| Mesh link | A lever pulled: its semaphore arm drops to "clear" and the trolley may run to that neighbour |
| D = 6 | Six levers in the frame, numbered; D_LOW 4 is a painted stripe ("never below 4 clear"), D_HIGH 8 is two spare lever slots blanked with a plate |
| Flood publish | The "train on line" plunger: the token trolley runs out on every track at once, including the two sidings to non-mesh neighbours, which open only for this move |
| GRAFT | Signalman pulls a lever; the interlocking tappet slides and allows it only if the neighbour's load-gauge reads above −5 |
| PRUNE | The lever is thrown back; the arm rises to "danger"; the tappet locks it |
| P1–P4 | A load-gauge per lever on the shelf: P1 a slow-winding dial, P2 a token-count that bleeds, P3 a small deficit flag, P4 a red "detonator" penalty that halves each bell beat |
| Thresholds | −5 "lever locked", −10 "lever thrown back by the frame" |
| Heartbeat | The block bell, one beat per second; its clapper drives the gauge bleed, the penalty halving, the throw-back check, the pull check, the bell-code sender, the bell-code receiver |
| IHAVE | A bell code (last 10 token numbers) tapped to up to 6 neighbours not on a clear track |
| IWANT | Reply bell code; a hand trolley on the walkway (not the track) brings the token on the next beat |
| Sybil flood | A red trolley on one track pushing bad tokens each beat; detonator fires twice; frame throws the lever back; arm to danger |
| Eclipse | Fog descends on the box (a translucent dome); all arms show nothing, trolleys stop at the arms; bell codes still pass and hand trolleys still walk; gauges barely move |
| Partition | A gate across the crossover; tracks, bell wire and walkway beyond it are cut |

### Parts list (38)

**Case (7):** brick base, timber upper, hipped roof, stove chimney, stair and landing, nameboard, board
with track.

**Structure (8):** lever frame, six levers, two blanked slots, block shelf, six signal posts and arms,
six track pieces to rim cabins, walkway, crossover gate.

**Mechanism (13):** tappet locking bed, six load-gauges with four hands each, block bell and clapper,
block instrument needle, bell-code tapper, wire runs and pulleys from each lever to its arm (along the
ground, pulley at each turn), token staff and trolley, hand trolley, red sybil trolley, fog dome.

**Power (5):** lever wires and counterweights, signal lamps and oil tank, bell battery, stove, line
wire to neighbour cabins.

**Controls (5):** train-on-line plunger, bell tapper, lever handles (act), fog lever, gate latch.

### Buttons (5)

**Send the token** (flood) · **Bell beat** (heartbeat) · **Red trolley** (sybil) · **Fog** (eclipse)
· **Close the gate** (partition).

### Stats

`arms clear 6/6` · `gauge lever-3 −20` · `tokens delivered` · `hand-trolley pulls` · `beat`.

### See-through

Box walls to ghost; the lever frame, tappet bed, wires and pulleys under the floor, bell battery,
stove, oil tank.

### On the dark page

Framed plate. Brick as desaturated rust kept well below the orange accent's chroma; the only orange
is a token in flight and the active bell lobe.

Weakness: wires and pulleys from six levers to six arms is a lot of thin line under a floor, and the
message path (token on a trolley) is slow and sparse: one token at a time, where GossipSub's point
is many copies at once. Strong on interlocking = scoring (a mechanical interlock that refuses a
pull is the most literal GRAFT threshold possible).

---

## Pick: Candidate A, the pneumatic-tube sorting office

Capsules are objects, and a message in GossipSub is an object that gets copied: a splitter cone that
shoots eight copies at once is flood publish without a caption, and the same capsule going grey as
each station marks it seen is the dedup set. Six glass tubes on a port drum make D=6 countable from
across the room, and a tube end that physically drops off a port is a prune nobody misreads. The
balance-beam scorer gives all four P-terms a different weight with a different habit (winder, leaking
tokens, a tiny counterweight, a melting slug), which is exactly the honesty the talk needs: the
−0.25 P3 floor is a visibly tiny weight next to the −10 slug, so the eclipse story ("scoring never
sees it, lift the hood") tells itself. The switchboard wins on GRAFT/PRUNE alone but has no object
to copy; the signal box has the best interlock but moves one token at a time. The tube office also
suits the engine best: a rounded desk body (`extrude` + `rrUV`), tubes as `rod` pieces split at the
drum rim, a cam shaft that is a textbook see-through, and nothing that needs more than ±60° to read.

### Shared notes for the build

- **Plate on the dark page.** Colorfigures renders warm paper; keep it. The landing page shows the
  figure as a framed plate: a `#f2f2ef` paper rectangle (slightly warmed, `#f4f1e8`, so it matches
  the skill's paper) sitting on the `rgb(11,11,13)` ground with a 1 px off-white rule 6 px outside
  it, an italic serif caption below in off-white, *Fig. 2 Same mechanism, toy constants.*, and one
  rotated off-white stamp at the plate corner (`SORTER No. 6`, Manrope, uppercase, 3°). The page's
  halftone dot mask can overlap the plate's top-right corner so the plate reads as pasted onto the
  dithered ground rather than floating. The cast shadow stays the skill's flat blue; it is the one
  colour in the plate that is not in the page palette, and it is what makes it look like a print.
- **Body swatches.** Keep the object nearly monochrome (off-white body, grey-browns, desaturated
  brass `#cbb98a`) so the page's orange `#ff5a2c` is the only saturated hue on screen: it is the
  colorfigures accent for the active label and the fresh-capsule band. Sybil red `#e2483d` and the
  green status lamp `#43c25c` stay as the skill's status colours; the page uses no other red or green.
- **Honesty.** Stats and label pills carry "(toy)" on constants. No stat is a mainnet number.
- **Embed.** Build to one HTML with `scripts/build.py`, serve from `public/figures/sorter.html`,
  embed with `<iframe loading="lazy">` sized by the plate; `?press=Post@300,Heartbeat@1500` for the
  OG screenshot. Phone: the engine's badge layout already handles it inside the iframe.
- **Scope for Devcon.** Buttons 1–3 (Post, Heartbeat, Sybil) are the demo; 4–5 (hood, bulkhead)
  are a second pass if the 3-round verify loop leaves time.
