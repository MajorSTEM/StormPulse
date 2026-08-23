"use client";

import { useState } from "react";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  OutageEventProperties,
} from "@/lib/types";

interface Props {
  live: GeoJSONFeatureCollection | null;
  liveLoading: boolean;
  events: GeoJSONFeatureCollection | null;
  showLiveOnMap: boolean;
  onToggleLiveOnMap: (show: boolean) => void;
  onSelectEvent: (feature: GeoJSONFeature) => void;
  onRefreshLive: () => void;
  onZipLookup: (zip: string) => void;
  zipResult: ZipLookupResult | null;
  utilityFilter: UtilityFilter;
  onUtilityFilterChange: (f: UtilityFilter) => void;
  realistic: boolean;
  onToggleRealistic: (on: boolean) => void;
  onClose: () => void;
  selectedEventId: string | null;
}

export type UtilityFilter = "all" | "NIPSCO" | "ComEd";

export interface ZipLookupResult {
  zip: string;
  found: boolean;
  affected?: number;
  cities?: string[];
  note?: string;
}

type Tab = "live" | "events" | "safety";

interface SafetyItem {
  fact: string;
  myth?: string;
  critical?: boolean;
}

interface SafetySection {
  id: string;
  icon: string;
  title: string;
  items: SafetyItem[];
}

// Sourced from CPSC, NFPA, FDA/USDA, ESFI, and NIPSCO/ComEd customer guidance.
const SAFETY_SECTIONS: SafetySection[] = [
  {
    id: "lines",
    icon: "⚡",
    title: "Downed Power Lines",
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
    items: [
      { critical: true, fact: "Carbon monoxide from generators kills more people after storms than many storms do. Run generators OUTSIDE ONLY, at least 20 feet from the house, exhaust pointed away from every window, door, and vent." },
      { myth: "Running a generator in the garage is fine if the door is open.",
        fact: "An open door does NOT clear carbon monoxide — it accumulates and drifts indoors. Garages, carports, basements, and porches are all deadly locations. CO is colorless and odorless; you may pass out before feeling symptoms." },
      { myth: "I'd smell or feel it if CO was building up.",
        fact: "You often won't. Install battery-backed CO alarms on every level of the home — it's the only reliable warning." },
      { critical: true, fact: "NEVER plug a generator into a wall outlet ('backfeeding'). It energizes lines outside your home and can electrocute the NIPSCO lineworker restoring your street — and your neighbors. Use a transfer switch installed by a licensed electrician, or plug appliances in directly." },
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
    items: [
      { critical: true, fact: "Use 14 AWG extension cords or lower (12 AWG, 10 AWG) for generators and heavy loads. Lower gauge number = thicker wire = more capacity. Thin 16–18 AWG 'lamp cords' overheat and start fires under appliance loads." },
      { myth: "Any cord that reaches and fits the plug will do the job.",
        fact: "An undersized cord overheats invisibly, melts insulation, and can ignite — while ALSO starving your appliance with voltage drop, which burns out fridge and sump pump motors." },
      { myth: "Two cords joined together work the same as one long cord.",
        fact: "Daisy-chaining multiplies resistance and heat at every connection. The longer the run, the THICKER the cord must be — a 100 ft run needs a heavier gauge than a 25 ft run for the same load." },
      { fact: "Outdoors, use only cords rated for outdoor use (marked W or SW on the jacket), three-prong with the ground pin intact. Never cut off or bypass a ground pin." },
      { fact: "Uncoil cords fully before loading them heavily — a coiled cord under load traps heat like a stove element." },
      { fact: "Never run cords under rugs or carpets, through pinching doors or windows, or across walkways where damage goes unseen. Check for warmth: a cord that feels hot is overloaded — reduce the load now." },
      { fact: "Space heaters should plug directly into wall outlets, not extension cords or power strips — they are a leading cause of cord fires." },
    ],
  },
  {
    id: "weatherhead",
    icon: "🏠",
    title: "Weatherhead & Getting Reconnected",
    items: [
      { critical: true, fact: "If your weatherhead (the mast/pipe where the power line attaches to your house), meter base, or service mast was damaged or torn off, a LICENSED ELECTRICIAN must repair it BEFORE NIPSCO can reconnect you. That equipment belongs to the homeowner, not the utility." },
      { fact: "This is the #1 reason a house stays dark after the whole street comes back. Crews restoring your block will skip a home with a damaged weatherhead — get the repair scheduled early, because electricians book up fast after a storm." },
      { fact: "After the repair, most areas require an inspection or utility notification before re-energizing — your electrician handles this, but ask them to confirm they'll coordinate the reconnect with NIPSCO." },
      { fact: "Take photos of the damage for insurance before repairs begin. Weatherhead/mast repairs are commonly covered under homeowner's policies for storm damage." },
    ],
  },
  {
    id: "scams",
    icon: "🕵️",
    title: "Utility Impersonators & Storm Scams",
    items: [
      { critical: true, fact: "Real NIPSCO employees carry company photo ID and will show it without being offended. If anyone claiming to be NIPSCO can't or won't, close the door and call 1-800-4NIPSCO to verify — legitimate workers will wait." },
      { myth: "The utility might demand immediate payment during restoration to keep my power on.",
        fact: "NIPSCO does NOT go door-to-door demanding payment, and no utility takes gift cards, wire transfers, or cash apps. 'Pay right now or be disconnected' — especially during a storm event — is ALWAYS a scam." },
      { fact: "Restoration work happens at the street and the meter — utility crews rarely need inside your home, and never uninvited. Don't let unverified 'workers' in." },
      { fact: "Storm-chaser contractors follow disasters: pressure to sign today, cash-only deals, and full payment up front are red flags. Get written estimates, verify local licensing/insurance, and never pay in full before work is done." },
      { fact: "Scam calls spike during outages, spoofing the utility's caller ID. If a call feels off, hang up and dial NIPSCO yourself at the number on your bill." },
      { fact: "Report impersonators to local police and to NIPSCO — you may protect an elderly neighbor who would have answered the same knock." },
    ],
  },
  {
    id: "home",
    icon: "🧊",
    title: "Food, Home & Health",
    items: [
      { fact: "Keep fridge and freezer doors CLOSED: an unopened fridge keeps food safe ~4 hours; a full freezer ~48 hours (24 if half-full). After that, perishables held above 40°F for 2+ hours should go. When in doubt, throw it out." },
      { fact: "Lesser-known trick: keep a cup of frozen water with a coin on top in the freezer. If you evacuate and return to the coin sunk in the cup, food thawed and refroze while you were gone — don't trust it." },
      { fact: "Unplug sensitive electronics during the outage; power restoration can arrive with surges. Leave one lamp switched on so you know the moment power returns." },
      { critical: true, fact: "Never use charcoal grills, camp stoves, or gas ovens to heat the home — same silent carbon monoxide danger as generators." },
      { fact: "Prefer flashlights and battery lanterns over candles. If you must use candles, never sleep with one burning." },
      { fact: "Check on elderly neighbors and anyone using powered medical equipment (oxygen, CPAP, home dialysis). If someone in your home depends on powered medical equipment, tell NIPSCO in advance — utilities keep medical-needs registries — and have a battery/generator plan that doesn't wait for the outage." },
      { fact: "In summer heat with no A/C: hydrate, use battery fans, and know your nearest cooling center — heat kills quietly during long outages." },
    ],
  },
];

/**
 * Power-outage console (SCADA annunciator styling): live utility feed with
 * customers-out totals that auto-refresh as restorations land, plus the
 * curated archive of rare major outage events.
 */
export default function OutagePanel({
  live, liveLoading, events, showLiveOnMap, onToggleLiveOnMap,
  onSelectEvent, onRefreshLive, onZipLookup, zipResult,
  utilityFilter, onUtilityFilterChange, realistic, onToggleRealistic,
  onClose, selectedEventId,
}: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [zipInput, setZipInput] = useState("");
  const [openSection, setOpenSection] = useState<string | null>("lines");

  const meta = live?.meta as unknown as {
    available?: boolean;
    utility?: string;
    as_of?: string;
    outage_count?: number;
    customers_out?: number;
    top_cities?: { city: string; affected: number }[];
    utilities?: { name: string; customers_out: number; outage_count: number;
                  customers_served?: number; served_approximate?: boolean }[];
    disclaimer?: string;
  } | undefined;

  const eventFeatures = (events?.features ?? []).filter(
    f => (f.properties as { feature_type?: string }).feature_type === "outage_event"
  );

  const asOf = meta?.as_of ? new Date(meta.as_of).toLocaleTimeString() : "—";

  return (
    <div
      className="absolute top-16 right-3 z-20 bg-gray-950 rounded-lg border border-yellow-600/60 shadow-2xl flex flex-col max-h-[calc(100vh-130px)]"
      style={{ width: "min(300px, calc(100vw - 24px))" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-yellow-800/50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-xs font-bold text-yellow-300 uppercase tracking-wider">
            Power Outages
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700"
          aria-label="Close outage panel"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-2 pt-1.5 flex-shrink-0">
        {(["live", "events", "safety"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1 rounded transition ${
              tab === t ? "bg-yellow-600 text-black" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            {t === "live" ? "Live Map" : t === "events" ? `Events (${eventFeatures.length})` : "Safety"}
          </button>
        ))}
      </div>

      {/* Live tab */}
      {tab === "live" && (
        <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
          {/* SCADA-style stat tiles */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="bg-gray-800/60 border border-gray-700 rounded p-2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Customers Out</div>
              <div className={`text-lg font-bold tabular-nums ${
                (meta?.customers_out ?? 0) > 10000 ? "text-red-400"
                : (meta?.customers_out ?? 0) > 500 ? "text-yellow-300" : "text-green-400"
              }`}>
                {meta?.available ? (meta.customers_out ?? 0).toLocaleString() : "—"}
              </div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700 rounded p-2">
              <div className="text-[9px] text-gray-500 uppercase tracking-wider">Active Outages</div>
              <div className="text-lg font-bold text-gray-200 tabular-nums">
                {meta?.available ? (meta.outage_count ?? 0).toLocaleString() : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>{meta?.utility ?? "NIPSCO"} · scan {asOf}</span>
            <button
              onClick={onRefreshLive}
              disabled={liveLoading}
              className="border border-gray-600 rounded px-1.5 py-0.5 hover:border-yellow-500 hover:text-yellow-300 disabled:opacity-50"
            >
              {liveLoading ? "…" : "↻ Refresh"}
            </button>
          </div>

          {(meta?.utilities?.length ?? 0) > 1 && (
            <div className="space-y-1">
              {meta!.utilities!.map(u => {
                const served = u.customers_served;
                const pct = served ? (u.customers_out / served) * 100 : null;
                return (
                  <div key={u.name} className="py-1 border-b border-gray-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-200 font-medium">{u.name}</span>
                      {pct !== null && (
                        <span className={`tabular-nums font-bold ${
                          pct >= 5 ? "text-red-400" : pct >= 0.5 ? "text-yellow-300" : "text-green-400"
                        }`}>
                          {pct < 0.1 && pct > 0 ? "<0.1" : pct.toFixed(1)}% out
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 tabular-nums">
                      {u.customers_out.toLocaleString()} of {u.served_approximate ? "~" : ""}
                      {served ? served.toLocaleString() : "?"} customers without power
                      · {u.outage_count.toLocaleString()} active outages
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ZIP lookup — aggregate data only; the ZIP is never stored */}
          <div className="border border-gray-700 rounded px-2 py-1.5 space-y-1">
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={zipInput}
                onChange={e => setZipInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => { if (e.key === "Enter" && zipInput.length === 5) onZipLookup(zipInput); }}
                placeholder="ZIP code…"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-yellow-500"
              />
              <button
                onClick={() => zipInput.length === 5 && onZipLookup(zipInput)}
                disabled={zipInput.length !== 5 || liveLoading}
                className="text-[10px] font-bold uppercase tracking-wider bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black rounded px-2.5 transition"
              >
                Check
              </button>
            </div>
            {zipResult && (
              zipResult.found ? (
                <div className="text-[11px] text-yellow-200">
                  <span className="font-bold tabular-nums">{(zipResult.affected ?? 0).toLocaleString()}</span> customers
                  out in {zipResult.zip} ({(zipResult.cities ?? []).join(", ")})
                </div>
              ) : (
                <div className="text-[11px] text-green-300">
                  {zipResult.zip}: no reported outages — area appears energized. (NIPSCO territory)
                </div>
              )
            )}
            <div className="text-[9px] text-gray-500">
              ZIP is used only for this lookup — never stored. NIPSCO territory only.
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-200 border border-gray-700 rounded px-2 py-1.5 cursor-pointer hover:border-yellow-600">
            <input
              type="checkbox"
              checked={showLiveOnMap}
              onChange={e => onToggleLiveOnMap(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-500"
            />
            Show outages on map
          </label>

          {/* Utility filter */}
          <div className="flex gap-1">
            {(["all", "NIPSCO", "ComEd"] as UtilityFilter[]).map(f => (
              <button
                key={f}
                onClick={() => onUtilityFilterChange(f)}
                className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1 rounded border transition ${
                  utilityFilter === f
                    ? "border-yellow-500 bg-yellow-600 text-black"
                    : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-yellow-700"
                }`}
              >
                {f === "all" ? "Both" : f}
              </button>
            ))}
          </div>

          {/* Realistic (lights-out) view — dark basemap only */}
          <label className="flex items-center gap-2 text-xs text-gray-200 border border-gray-700 rounded px-2 py-1.5 cursor-pointer hover:border-yellow-600">
            <input
              type="checkbox"
              checked={realistic}
              onChange={e => onToggleRealistic(e.target.checked)}
              className="w-3.5 h-3.5 accent-yellow-500"
            />
            <span>
              Realistic view
              <span className="block text-[9px] text-gray-500">
                Dark basemap: outages appear as lights-out zones instead of colored bubbles
              </span>
            </span>
          </label>

          {/* Per-city rollup */}
          {meta?.available && (meta.top_cities?.length ?? 0) > 0 && (
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                Hardest-hit communities
              </div>
              <div className="space-y-0.5">
                {meta.top_cities!.map(c => (
                  <div key={c.city} className="flex items-center justify-between text-[11px] py-0.5 border-b border-gray-800">
                    <span className="text-gray-300">{c.city}</span>
                    <span className="text-yellow-300 font-medium tabular-nums">{c.affected.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {meta?.available === false && (
            <p className="text-xs text-gray-500 py-4 text-center">
              Utility outage feed unreachable right now — retrying automatically.
            </p>
          )}
          <p className="text-[9px] text-gray-400 leading-relaxed">
            Mirrors the utility&apos;s public outage map (~10 min updates). Dots mark
            reported outages — areas without dots are presumed energized.
            Restored areas drop off automatically on each scan.
          </p>
        </div>
      )}

      {/* Events tab */}
      {tab === "events" && (
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          <p className="text-[10px] text-gray-300 px-1 leading-relaxed">
            Major outage events are rare — this archive documents them with the
            full record: wind data, customers affected, restoration timeline, sources.
          </p>
          {eventFeatures.map(f => {
            const p = f.properties as unknown as OutageEventProperties;
            const active = p.id === selectedEventId;
            return (
              <button
                key={p.id}
                onClick={() => onSelectEvent(f)}
                className={`w-full text-left px-2.5 py-2 rounded border transition ${
                  active
                    ? "border-yellow-500 bg-yellow-950/40 ring-1 ring-yellow-500/40"
                    : "border-gray-600 bg-gray-800/80 hover:border-yellow-500"
                }`}
              >
                <div className="text-xs font-medium text-yellow-200">{p.name}</div>
                <div className="text-[10px] text-gray-300 mt-0.5">{p.utility}</div>
                <div className="text-[10px] text-gray-200 mt-1 flex flex-wrap gap-x-2">
                  <span className="text-red-400 font-medium">
                    {p.customers_affected.toLocaleString()} customers out
                  </span>
                  <span>gusts to {p.peak_gust_measured_mph} mph</span>
                  <span>{p.communities_affected} communities</span>
                </div>
                {p.largest_in_utility_history && (
                  <div className="text-[9px] text-yellow-400 mt-0.5 font-bold uppercase tracking-wider">
                    Largest outage event in utility history
                  </div>
                )}
                {active && (
                  <div className="text-[10px] text-yellow-400 mt-0.5">▶ Swath + gust reports on map</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Safety tab */}
      {tab === "safety" && (
        <div className="overflow-y-auto flex-1 px-2 py-2 space-y-1.5">
          <p className="text-[10px] text-gray-300 px-1 leading-relaxed">
            Outage survival guide — sourced from CPSC, NFPA, FDA, and utility
            safety guidance. Tap a topic to expand.
          </p>
          {SAFETY_SECTIONS.map(section => {
            const open = openSection === section.id;
            return (
              <div key={section.id} className="border border-gray-700 rounded overflow-hidden">
                <button
                  onClick={() => setOpenSection(open ? null : section.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 text-left transition ${
                    open ? "bg-yellow-950/40" : "hover:bg-gray-800/60"
                  }`}
                >
                  <span className="text-xs font-bold text-yellow-200">
                    {section.icon} {section.title}
                  </span>
                  <span className="text-gray-500 text-xs">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">
                    {section.items.map((item, i) => (
                      <div key={i}>
                        {item.myth ? (
                          <div className="text-[11px] leading-relaxed">
                            <span className="text-red-400 font-bold">MYTH:</span>{" "}
                            <span className="text-gray-300">{item.myth}</span>
                            <br />
                            <span className="text-green-400 font-bold">FACT:</span>{" "}
                            <span className="text-gray-200">{item.fact}</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-gray-200 leading-relaxed">
                            {item.critical ? (
                              <span className="text-red-400 font-bold">⚠ </span>
                            ) : (
                              <span className="text-yellow-400">• </span>
                            )}
                            {item.fact}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[9px] text-gray-500 px-1 leading-relaxed">
            General guidance only — always follow instructions from emergency
            officials and your utility. Emergencies and downed lines: call 911,
            then NIPSCO (1-800-4NIPSCO) or ComEd (1-800-334-7661).
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700 flex-shrink-0">
        <div className="text-[10px] text-gray-500">
          Live: NIPSCO + ComEd public feeds · Events: curated + SPC wind reports
        </div>
      </div>
    </div>
  );
}
