// Outage & storm safety guide content — sourced from CPSC, NFPA, FDA/USDA,
// ESFI, and NIPSCO/ComEd customer safety guidance. Rendered by /safety.

export interface SafetyItem {
  fact: string;
  myth?: string;
  critical?: boolean;
}

export interface SafetySection {
  id: string;
  icon: string;
  title: string;
  tagline: string;
  headline: string;   // curiosity-gap card headline
  hook: string;       // one-line tease shown before expanding
  items: SafetyItem[];
}

export const SAFETY_SECTIONS: SafetySection[] = [
  {
    id: "lines",
    icon: "⚡",
    title: "Downed Power Lines",
    tagline: "Every line is live until the utility says otherwise.",
    headline: "The line that looks dead",
    hook: "Silent, still, and lethal — and the ground around it can be electrified too.",
    items: [
      { critical: true, fact: "Treat EVERY downed line as live and deadly — even ones that look dead, insulated, or like harmless cable/phone wire. Stay at least 35 feet away and keep others away." },
      { critical: true, fact: "If a line falls on your car: STAY INSIDE and call 911. Only if fire forces you out — jump clear so you never touch the car and ground at the same time, land with feet together, and shuffle away in small steps." },
      { myth: "If a downed line isn't sparking or humming, it's dead.",
        fact: "Energized lines are often completely silent and still. Lines can also re-energize without warning when crews or automatic equipment restore circuits." },
      { myth: "The ground near a downed line is safe as long as you don't touch the wire.",
        fact: "Electricity spreads through the ground in rings around a downed line (step potential). The voltage difference between your two feet can be lethal — this is why you shuffle, not stride, away." },
      { fact: "Water conducts electricity: never walk through flooded areas or standing water near downed lines or submerged outlets." },
      { fact: "Never drive over a downed line, and never try to move one — not even with wood, rope, or 'non-conductive' objects. Report it: 911, then the utility." },
    ],
  },
  {
    id: "generators",
    icon: "🔥",
    title: "Generators: Facts & Myths",
    tagline: "Carbon monoxide from generators kills more people after storms than many storms do.",
    headline: "The garage-door mistake",
    hook: "The deadliest generator myths sound completely reasonable. That’s why they kill.",
    items: [
      { critical: true, fact: "Run generators OUTSIDE ONLY, at least 20 feet from the house, exhaust pointed away from every window, door, and vent. Carbon monoxide is the #1 generator killer." },
      { myth: "Running a generator in the garage is fine if the door is open.",
        fact: "An open door does NOT clear carbon monoxide — it accumulates and drifts indoors. Garages, carports, basements, and porches are all deadly locations. CO is colorless and odorless; you may pass out before feeling symptoms." },
      { myth: "I'd smell or feel it if CO was building up.",
        fact: "You often won't. Install battery-backed CO alarms on every level of the home — they are the only reliable warning." },
      { critical: true, fact: "NEVER plug a generator into a wall outlet ('backfeeding'). It energizes lines outside your home and can electrocute the lineworker restoring your street — and your neighbors. Use a transfer switch installed by a licensed electrician, or plug appliances in directly." },
      { fact: "Turn the generator off and let it COOL before refueling — gasoline spilled on a hot engine ignites. This is one of the most common generator fires." },
      { fact: "Lesser-known: your generator's CO can drift into a NEIGHBOR'S home through their soffits and window gaps. Placement matters for the whole block, not just your house." },
      { fact: "Lesser-known: newer portable generators with a CO shutoff sensor (look for PGMA G300 or UL 2201 certification) automatically stop when CO builds up — worth it when replacing an old unit." },
      { fact: "Size the load honestly: motors (fridge, sump pump, furnace fan) draw 2–3× their running watts at startup. Overloading trips the generator right when everything tries to restart at once — stagger what you plug in." },
      { fact: "Keep the generator dry — operate on a dry surface under an open canopy. A wet generator can electrocute the operator." },
    ],
  },
  {
    id: "cords",
    icon: "🔌",
    title: "Extension Cords: Proper Use",
    tagline: "Lower gauge number = thicker wire = safer under load.",
    headline: "The cord that starts fires",
    hook: "A number printed on the jacket decides whether your fridge runs — or your hallway burns.",
    items: [
      { critical: true, fact: "Use 14 AWG extension cords or lower (12 AWG, 10 AWG) for generators and heavy loads. Thin 16–18 AWG 'lamp cords' overheat and start fires under appliance loads." },
      { myth: "Any cord that reaches and fits the plug will do the job.",
        fact: "An undersized cord overheats invisibly, melts insulation, and can ignite — while ALSO starving your appliance with voltage drop, which burns out fridge and sump pump motors." },
      { myth: "Two cords joined together work the same as one long cord.",
        fact: "Daisy-chaining multiplies resistance and heat at every connection. The longer the run, the THICKER the cord must be — a 100 ft run needs a heavier gauge than a 25 ft run for the same load." },
      { fact: "Outdoors, use only cords rated for outdoor use (marked W or SW on the jacket), three-prong with the ground pin intact. Never cut off or bypass a ground pin." },
      { fact: "Uncoil cords fully before loading them heavily — a coiled cord under load traps heat like a stove element." },
      { fact: "Never run cords under rugs or carpets, through pinching doors or windows, or across walkways where damage goes unseen. A cord that feels hot is overloaded — reduce the load now." },
      { fact: "Space heaters should plug directly into wall outlets, not extension cords or power strips — they are a leading cause of cord fires." },
    ],
  },
  {
    id: "weatherhead",
    icon: "🏠",
    title: "Weatherhead & Getting Reconnected",
    tagline: "The #1 reason a house stays dark after the whole street comes back.",
    headline: "Why your house stays dark after the street comes back",
    hook: "One piece of equipment on your roof is yours to fix — not the utility’s.",
    items: [
      { critical: true, fact: "If your weatherhead (the mast/pipe where the power line attaches to your house), meter base, or service mast was damaged or torn off, a LICENSED ELECTRICIAN must repair it BEFORE NIPSCO can reconnect you. That equipment belongs to the homeowner, not the utility." },
      { fact: "Crews restoring your block will skip a home with a damaged weatherhead — get the repair scheduled early, because electricians book up fast after a storm." },
      { fact: "After the repair, most areas require an inspection or utility notification before re-energizing — your electrician handles this, but ask them to confirm they'll coordinate the reconnect with the utility." },
      { fact: "Take photos of the damage for insurance before repairs begin. Weatherhead/mast repairs are commonly covered under homeowner's policies for storm damage." },
    ],
  },
  {
    id: "scams",
    icon: "🕵️",
    title: "Utility Impersonators & Storm Scams",
    tagline: "Scammers follow storms. Verify before you open the door or pay.",
    headline: "The knock on the door",
    hook: "How to spot a fake lineworker in ten seconds — and the payment demand that’s always a scam.",
    items: [
      { critical: true, fact: "Real NIPSCO employees carry company photo ID and will show it without being offended. If anyone claiming to be NIPSCO can't or won't, close the door and call 1-800-4NIPSCO to verify — legitimate workers will wait." },
      { myth: "The utility might demand immediate payment during restoration to keep my power on.",
        fact: "NIPSCO does NOT go door-to-door demanding payment, and no utility takes gift cards, wire transfers, or cash apps. 'Pay right now or be disconnected' — especially during a storm event — is ALWAYS a scam." },
      { fact: "Restoration work happens at the street and the meter — utility crews rarely need inside your home, and never uninvited. Don't let unverified 'workers' in." },
      { fact: "Storm-chaser contractors follow disasters: pressure to sign today, cash-only deals, and full payment up front are red flags. Get written estimates, verify local licensing and insurance, and never pay in full before work is done." },
      { fact: "Scam calls spike during outages, spoofing the utility's caller ID. If a call feels off, hang up and dial the utility yourself at the number on your bill." },
      { fact: "Report impersonators to local police and to the utility — you may protect an elderly neighbor who would have answered the same knock." },
    ],
  },
  {
    id: "gouging",
    icon: "\u26FD",
    title: "Gas Stations & Price Gouging",
    tagline: "Generators run on gas. Some stations run on desperation.",
    headline: "The $7 gallon",
    hook: "When every generator in the county needs fuel, some pumps get greedy. Part of it is illegal \u2014 and reportable.",
    items: [
      { critical: true, fact: "In Indiana, price gouging on fuel during a declared emergency is against the law (Indiana Code 4-6-9.1). The Attorney General can pursue stations charging grossly excessive prices and force refunds. That $7 gallon may be illegal \u2014 not just unfair." },
      { myth: "Stations can charge whatever they want \u2014 it's just supply and demand.",
        fact: "In normal times, yes. But once a state of emergency is declared, Indiana law specifically restricts unconscionable fuel pricing, and Illinois pursues disaster gouging under its Consumer Fraud Act." },
      { fact: "What gouging looks like: a price far above nearby stations AND far above the pre-storm price, with no supply change behind it. A dollar-a-gallon jump overnight in a disaster area is worth documenting." },
      { fact: "Be fair before you accuse: not every price hike is gouging. Some businesses genuinely pay more to restock during a disaster — emergency deliveries, running the store on generator power — and a modest increase can reflect real costs. Gouging is the gross, opportunistic spike that profits off desperation. Discernment and discretion are key: compare several stations, think about what actually changed, and document before you report." },
      { fact: "How to report it: photograph the price sign and your receipt, note the station name, address, date and time. Indiana: the Attorney General's consumer division at indianaconsumer.com or 1-800-382-5516. Illinois: the Illinois AG's consumer fraud hotline." },
      { fact: "Don't panic-buy. Filling every container in the garage spikes demand and helps create the shortage that invites gouging. Buy enough to run the generator through your area's restoration estimate \u2014 the live outage map shows it." },
      { fact: "The same rules cover hotels, tree services, and generator resellers during declared emergencies. Storm-chaser pricing is reportable, not just regrettable." },
    ],
  },
  {
    id: "home",
    icon: "🧊",
    title: "Food, Home & Health",
    tagline: "The quiet dangers of a long outage.",
    headline: "The coin in the freezer",
    hook: "Fridge windows, a trick with a frozen cup, and the neighbors nobody checks on.",
    items: [
      { fact: "Keep fridge and freezer doors CLOSED: an unopened fridge keeps food safe ~4 hours; a full freezer ~48 hours (24 if half-full). After that, perishables held above 40°F for 2+ hours should go. When in doubt, throw it out." },
      { fact: "Lesser-known trick: keep a cup of frozen water with a coin on top in the freezer. If you return from an evacuation to find the coin sunk in the cup, food thawed and refroze while you were gone — don't trust it." },
      { fact: "Unplug sensitive electronics during the outage; restoration can arrive with surges. Leave one lamp switched on so you know the moment power returns." },
      { critical: true, fact: "Never use charcoal grills, camp stoves, or gas ovens to heat the home — same silent carbon monoxide danger as generators." },
      { fact: "Prefer flashlights and battery lanterns over candles. If you must use candles, never sleep with one burning." },
      { fact: "Check on elderly neighbors and anyone using powered medical equipment (oxygen, CPAP, home dialysis). If someone in your home depends on powered medical equipment, tell your utility in advance — utilities keep medical-needs registries — and have a battery or generator plan that doesn't wait for the outage." },
      { fact: "In summer heat with no A/C: hydrate, use battery fans, and know your nearest cooling center — heat kills quietly during long outages." },
    ],
  },
];
