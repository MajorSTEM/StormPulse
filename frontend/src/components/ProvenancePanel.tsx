"use client";

import type {
  SelectedFeature, AlertProperties, LSRProperties, CorridorProperties,
  TornadoHistoryProperties, OutageLiveProperties, OutageEventProperties, GustReportProperties,
} from "@/lib/types";
import { format } from "date-fns";

interface Props {
  feature: SelectedFeature;
  onClose: () => void;
}

const TIER_LABELS: Record<string, { label: string; color: string; description: string }> = {
  T1: { label: "Official Confirmed", color: "bg-green-600", description: "NWS official survey or confirmed report" },
  T2: { label: "Official Near-Real-Time", color: "bg-blue-600", description: "Active NWS alert or official LSR" },
  T3: { label: "Inferred (System Generated)", color: "bg-orange-500", description: "Estimated from public signals — NOT an official survey" },
  T4: { label: "Supplemental", color: "bg-gray-500", description: "Crowdsourced or media reference" },
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  try {
    return format(new Date(iso), "MMM d, yyyy HH:mm 'UTC'");
  } catch {
    return iso;
  }
}

function AlertDetail({ props }: { props: AlertProperties }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Event</div>
        <div className="text-sm font-medium text-white">{props.event_type}</div>
      </div>
      {props.nws_headline && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Headline</div>
          <div className="text-sm text-orange-300">{props.nws_headline}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Severity / Urgency</div>
        <div className="text-sm text-white">{props.severity} / {props.urgency}</div>
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Area</div>
        <div className="text-sm text-white">{props.area_description}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Onset</div>
          <div className="text-xs text-white">{formatTime(props.onset)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Expires</div>
          <div className="text-xs text-white">{formatTime(props.expires)}</div>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Status</div>
        <div className={`text-xs font-medium ${props.is_active ? "text-green-400" : "text-gray-400"}`}>
          {props.is_active ? "ACTIVE" : "EXPIRED/CANCELLED"}
        </div>
      </div>
      {props.source_url && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Source</div>
          <a href={props.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 underline break-all">
            NWS Official Alert
          </a>
        </div>
      )}
    </div>
  );
}

function LSRDetail({ props }: { props: LSRProperties }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Report Type</div>
        <div className="text-sm font-medium text-white">
          {props.type_description} ({props.type_code})
        </div>
      </div>
      {props.magnitude !== null && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Magnitude</div>
          <div className="text-sm text-white">{props.magnitude} {props.magnitude_units}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Location</div>
        <div className="text-sm text-white">{props.city}, {props.county} County, {props.state}</div>
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Event Time</div>
        <div className="text-sm text-white">{formatTime(props.event_time)}</div>
      </div>
      {props.remark && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Remark</div>
          <div className="text-xs text-gray-200 leading-relaxed">{props.remark}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">WFO</div>
          <div className="text-xs text-white">{props.wfo}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Source</div>
          <div className="text-xs text-white">{props.source_type}</div>
        </div>
      </div>
    </div>
  );
}

function CorridorDetail({ props }: { props: CorridorProperties }) {
  return (
    <div className="space-y-3">
      {props._inferred ? (
        <div className="bg-orange-900/40 border border-orange-600 rounded p-2">
          <div className="text-xs text-orange-300 font-medium">
            &#9888; {props.tier_label || "T3 · INFERRED"}
          </div>
          <div className="text-xs text-orange-200 mt-0.5">{props.disclaimer || props._disclaimer}</div>
        </div>
      ) : (
        <div className="bg-cyan-900/40 border border-cyan-600 rounded p-2">
          <div className="text-xs text-cyan-300 font-medium">
            {props.tier_label || "T2 · OFFICIAL NWS"}
          </div>
          <div className="text-xs text-cyan-200 mt-0.5">
            Geometry from an official NWS warning product.
          </div>
        </div>
      )}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Confidence</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-700 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full"
              style={{ width: `${(props.confidence_score || 0) * 100}%` }}
            />
          </div>
          <span className="text-sm font-bold text-white">{props.confidence_label}</span>
          <span className="text-xs text-gray-400">{((props.confidence_score || 0) * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Why this corridor exists</div>
        <div className="text-xs text-gray-200 leading-relaxed">{props.explanation}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Severity Estimate</div>
          <div className="text-xs text-white">{props.severity_estimate}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contributing LSRs</div>
          <div className="text-xs text-white">{props.lsr_count}</div>
        </div>
      </div>
      {props.motion_direction_deg !== null && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimated Motion</div>
          <div className="text-xs text-white">
            {props.motion_direction_deg?.toFixed(0)}&deg; at ~{props.motion_speed_kts?.toFixed(0)} knots
          </div>
        </div>
      )}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Event Window</div>
        <div className="text-xs text-white">
          {formatTime(props.event_start)} &rarr; {formatTime(props.event_end)}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Generated</div>
        <div className="text-xs text-white">{formatTime(props.generated_at)}</div>
      </div>
      {props.engine_version === "v2" && props.motion_consistency_score !== null && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Track Linearity</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-yellow-400 h-1.5 rounded-full"
                style={{ width: `${((props.motion_consistency_score || 0) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-300">
              {((props.motion_consistency_score || 0) * 100).toFixed(0)}%
            </span>
          </div>
          {(props.outlier_count ?? 0) > 0 && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {props.outlier_count} off-track report{props.outlier_count !== 1 ? "s" : ""} excluded
            </div>
          )}
        </div>
      )}
      {props.prediction && (
        <div className="bg-amber-950/40 border border-amber-700 rounded p-2">
          <div className="text-xs text-amber-300 font-medium">⌁ Predicted Heading (T3)</div>
          <div className="text-xs text-amber-100 mt-1">
            {cardinal(props.prediction.bearing_deg)} ({Math.round(props.prediction.bearing_deg)}°)
            at ~{Math.round(props.prediction.speed_kts)} kts ·
            next {Math.round(props.prediction.projection_minutes)} min
          </div>
          <div className="flex gap-2 mt-1.5 text-[10px]">
            <span className="text-amber-200 border border-amber-800 rounded px-1.5 py-0.5">
              Straight {props.prediction.straight_pct}%
            </span>
            <span className="text-amber-200/80 border border-amber-900 rounded px-1.5 py-0.5">
              Veer L {props.prediction.veer_left_pct}%
            </span>
            <span className="text-amber-200/80 border border-amber-900 rounded px-1.5 py-0.5">
              Veer R {props.prediction.veer_right_pct}%
            </span>
          </div>
          <div className="text-[10px] text-amber-200/70 mt-1.5">{props.prediction.disclaimer}</div>
        </div>
      )}
    </div>
  );
}

function cardinal(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function HistoryDetail({ props }: { props: TornadoHistoryProperties }) {
  const isSurvey = props.source === "NWS DAT";
  const bearing = trackBearing(props);
  const sweptMi2 = props.length_mi > 0 && props.width_yd > 0
    ? props.length_mi * (props.width_yd / 1760)
    : null;
  const efInfo = props.ef >= 0 ? EF_SCALE[Math.min(5, props.ef)] : null;
  const duration = durationMin(props.time, props.end_time);
  const speedMph = duration && props.length_mi > 0
    ? (props.length_mi / (duration / 60))
    : null;
  const searchQ = encodeURIComponent(
    `${props.date} tornado ${props.state.split(",")[0] || ""}`.trim()
  );

  return (
    <div className="space-y-3">
      {/* Rating & source */}
      <div className="bg-amber-950/40 border border-amber-700 rounded p-2">
        <div className="text-xs text-amber-300 font-medium">
          🌪 {props.ef >= 0 ? `EF${props.ef}` : "EF unrated"} · {props.date} · {props.state || "—"}
        </div>
        <div className="text-[10px] text-amber-200/80 mt-0.5">
          {isSurvey
            ? "NWS Damage Assessment Toolkit — official survey track"
            : `SPC historical record #${props.om} (${props.year})`}
        </div>
      </div>

      {/* Damage potential (official EF scale descriptors) */}
      {efInfo && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Rating &amp; Damage Class</div>
          <div className="text-xs text-white">{efInfo.winds} winds — {efInfo.label}</div>
          <div className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{efInfo.damage}</div>
          {props.max_wind_mph && (
            <div className="text-[10px] text-amber-300 mt-0.5">Surveyed max wind: {props.max_wind_mph} mph</div>
          )}
        </div>
      )}

      {/* Formation & track */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Formation &amp; Track</div>
        <div className="text-xs text-white">
          Touched down {props.time ? `${props.time} UTC` : "(time unknown)"} at{" "}
          {props.start_lat.toFixed(3)}, {props.start_lon.toFixed(3)}
        </div>
        {props.end_time && (
          <div className="text-[10px] text-gray-300 mt-0.5">
            Lifted {props.end_time} UTC{duration ? ` — on the ground ~${duration} min` : ""}
          </div>
        )}
        <div className="text-[10px] text-gray-300 mt-0.5">
          {props.length_mi > 0 ? `Traveled ${props.length_mi.toFixed(1)} mi` : "Path length not recorded"}
          {bearing ? ` toward the ${bearing}` : ""}
          {speedMph ? ` (~${Math.round(speedMph)} mph forward speed)` : ""}
        </div>
        <div className="text-[10px] text-gray-300 mt-0.5">
          {props.width_yd > 0 ? `Max damage width ${Math.round(props.width_yd)} yd` : "Width not recorded"}
          {sweptMi2 ? ` · ~${sweptMi2.toFixed(1)} mi² swept` : ""}
        </div>
        {isSurvey && props.has_path && (
          <div className="text-[10px] text-gray-500 mt-0.5">Full surveyed track shown on map (not a straight-line estimate).</div>
        )}
      </div>

      {/* Impact & aftermath */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Impact &amp; Aftermath</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-gray-500">Fatalities</div>
            <div className={`text-xs font-medium ${props.fatalities > 0 ? "text-red-400" : "text-white"}`}>{props.fatalities}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500">Injuries</div>
            <div className="text-xs text-white">{props.injuries}</div>
          </div>
        </div>
        {lossText(props) && (
          <div className="text-[10px] text-yellow-300 mt-1">{lossText(props)}</div>
        )}
      </div>

      {/* Survey narrative */}
      {props.remarks && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Survey Notes</div>
          <div className="text-[11px] text-gray-200 leading-relaxed max-h-36 overflow-y-auto">{props.remarks}</div>
        </div>
      )}

      {/* Narrative / recovery reading */}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Read More (formation · aftermath · recovery)</div>
        <div className="flex flex-wrap gap-1.5">
          <a href={`https://en.wikipedia.org/w/index.php?search=${searchQ}`} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline">Wikipedia</a>
          <a href={`https://www.google.com/search?q=${searchQ}+damage+aftermath+recovery`} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline">News search</a>
          <a href="https://apps.dat.noaa.gov/StormDamage/DamageViewer/" target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline">NWS Damage Viewer</a>
        </div>
      </div>
    </div>
  );
}

// Official EF-scale wind ranges and damage descriptions (NWS)
const EF_SCALE: Record<number, { winds: string; label: string; damage: string }> = {
  0: { winds: "65–85 mph", label: "Minor damage",
       damage: "Peels surface off some roofs; gutter and siding damage; branches broken; shallow-rooted trees pushed over." },
  1: { winds: "86–110 mph", label: "Moderate damage",
       damage: "Roofs severely stripped; mobile homes overturned or badly damaged; exterior doors lost; windows broken." },
  2: { winds: "111–135 mph", label: "Considerable damage",
       damage: "Roofs torn off well-constructed houses; foundations shifted; mobile homes destroyed; large trees snapped or uprooted; cars lifted off the ground." },
  3: { winds: "136–165 mph", label: "Severe damage",
       damage: "Entire stories of well-constructed houses destroyed; severe damage to large buildings; trains overturned; heavy cars thrown." },
  4: { winds: "166–200 mph", label: "Devastating damage",
       damage: "Well-constructed houses leveled; structures blown some distance; cars and large objects thrown." },
  5: { winds: ">200 mph", label: "Incredible damage",
       damage: "Strong frame houses swept off foundations; steel-reinforced concrete structures critically damaged; total destruction along the core path." },
};

// SPC pre-1996 property loss is a 1-9 category; 1996+ is millions of dollars.
const SPC_LOSS_CATEGORIES: Record<number, string> = {
  1: "< $50", 2: "$50–$500", 3: "$500–$5K", 4: "$5K–$50K", 5: "$50K–$500K",
  6: "$500K–$5M", 7: "$5M–$50M", 8: "$50M–$500M", 9: "$500M+",
};

function lossText(p: TornadoHistoryProperties): string | null {
  if (p.source === "NWS DAT") {
    if (p.prop_damage && p.prop_damage > 0) {
      return `Reported property damage: $${p.prop_damage.toLocaleString()}`;
    }
    return null;
  }
  if (!p.loss || p.loss <= 0) return null;
  if (p.year < 1996) {
    const cat = SPC_LOSS_CATEGORIES[Math.round(p.loss)];
    return cat ? `Est. property loss: ${cat} (SPC category ${Math.round(p.loss)})` : null;
  }
  return `Est. property loss: $${p.loss.toLocaleString()}M`;
}

function trackBearing(p: TornadoHistoryProperties): string | null {
  if (!p.has_path || (p.end_lat === 0 && p.end_lon === 0)) return null;
  const dLon = p.end_lon - p.start_lon;
  const dLat = p.end_lat - p.start_lat;
  if (dLon === 0 && dLat === 0) return null;
  const deg = (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
  return cardinal(deg);
}

function durationMin(start: string, end: string | null): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins > 0 ? mins : null;
}

function LiveOutageDetail({ props }: { props: OutageLiveProperties }) {
  const fmt = (iso: string | null) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };
  return (
    <div className="space-y-3">
      <div className="bg-yellow-950/40 border border-yellow-700 rounded p-2">
        <div className="text-xs text-yellow-300 font-medium">⚡ Active outage · {props.city}</div>
        <div className="text-[10px] text-yellow-200/80 mt-0.5">{props.utility} public outage feed</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Customers Affected</div>
          <div className="text-sm font-bold text-white tabular-nums">{props.affected.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Cause</div>
          <div className="text-xs text-white">{props.cause}</div>
        </div>
      </div>
      {fmt(props.reported) && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Reported</div>
          <div className="text-xs text-white">{fmt(props.reported)}</div>
        </div>
      )}
      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimated Restoration</div>
        <div className="text-xs text-white">{fmt(props.restore_est) || "Not yet estimated"}</div>
      </div>
      {props.storm_mode && (
        <div className="text-[10px] text-orange-300">
          Utility is in storm mode — restoration estimates may shift as damage assessment continues.
        </div>
      )}
    </div>
  );
}

function GustReportDetail({ props }: { props: GustReportProperties }) {
  return (
    <div className="space-y-3">
      <div className="bg-yellow-950/40 border border-yellow-700 rounded p-2">
        <div className="text-xs text-yellow-300 font-medium">
          💨 {props.speed_mph ? `${props.speed_mph} mph ${props.measured ? "measured" : "estimated"} gust` : "Wind damage report"}
        </div>
        <div className="text-[10px] text-yellow-200/80 mt-0.5">
          {props.location} · {props.county} County, {props.state} · {props.date} {props.time_utc}Z
        </div>
      </div>
      {props.comments && (
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Report</div>
          <div className="text-[11px] text-gray-200 leading-relaxed">{props.comments}</div>
        </div>
      )}
      <div className="text-[10px] text-gray-500">Official SPC storm report (T2).</div>
    </div>
  );
}

function OutageEventDetail({ props }: { props: OutageEventProperties }) {
  return (
    <div className="space-y-3">
      <div className="bg-yellow-950/40 border border-yellow-700 rounded p-2">
        <div className="text-xs text-yellow-300 font-medium">⚡ {props.name}</div>
        <div className="text-[10px] text-yellow-200/80 mt-0.5">{props.utility} · {props.event_type}</div>
        {props.largest_in_utility_history && (
          <div className="text-[9px] text-yellow-400 mt-0.5 font-bold uppercase tracking-wider">
            Largest outage event in utility history
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Where It Hit</div>
        <div className="text-xs text-white leading-relaxed">{props.area}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {props.communities_affected} communities affected · storm window {props.event_window_utc}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Wind Speeds</div>
        <div className="text-xs text-white">
          Peak measured gust {props.peak_gust_measured_mph} mph at {props.peak_gust_measured_at}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">{props.peak_gust_reported_note}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">
          {props.wind_reports_in_corridor} official wind reports in the corridor (dots on the map — click any for its report).
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Outage Impact</div>
        <div className="text-sm font-bold text-red-400 tabular-nums">
          {props.customers_affected.toLocaleString()} customers lost power
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">{props.customers_affected_note}</div>
        {Object.keys(props.city_peak_outages || {}).length > 0 && (
          <div className="mt-1 space-y-0.5">
            {Object.entries(props.city_peak_outages).map(([city, n]) => (
              <div key={city} className="flex justify-between text-[11px]">
                <span className="text-gray-300">{city}</span>
                <span className="text-yellow-300 tabular-nums">{n.toLocaleString()}</span>
              </div>
            ))}
            <div className="text-[9px] text-gray-500">{props.city_peak_note}</div>
          </div>
        )}
        {props.deaths_reported > 0 && (
          <div className="text-[10px] text-red-400 mt-1">{props.deaths_note}</div>
        )}
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Restoration Timeline</div>
        <div className="text-[11px] text-gray-200 space-y-0.5">
          <div>Aug 13: ~{props.still_out_aug13.toLocaleString()} still without power</div>
          <div>90% restored target: {props.restoration_90pct_target}</div>
          <div>Full restoration target: {props.restoration_full_target}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Damage &amp; Aftermath</div>
        <div className="text-[11px] text-gray-200 leading-relaxed">{props.infrastructure_damage}</div>
        <div className="text-[11px] text-gray-300 leading-relaxed mt-1">{props.followup}</div>
      </div>

      <div>
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Sources</div>
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {props.sources.map(s => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-400 hover:text-blue-300 underline">
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProvenancePanel({ feature, onClose }: Props) {
  if (!feature) return null;

  const props = feature.properties as NonNullable<SelectedFeature>["properties"];
  const layer = (props as { _layer: string })._layer;
  const featureType = (props as { feature_type?: string }).feature_type;
  const isHistory = layer === "history";
  const isOutageEvent = layer === "outage_event" && featureType === "outage_event";
  const isGust = layer === "outage_event" && featureType === "gust_report";
  const isLiveOutage = layer === "outages_live";
  const tier = isHistory || isOutageEvent ? "T1"
    : isGust || isLiveOutage ? "T2"
    : ((props as { confidence_tier?: string }).confidence_tier || "T2");
  const tierInfo = TIER_LABELS[tier] || TIER_LABELS["T2"];

  const layerTitle: Record<string, string> = {
    alerts: "NWS Alert",
    lsr: "Local Storm Report",
    corridors: "Probable Damage Corridor",
    history: "Historical Tornado (SPC Archive)",
    outages_live: "Live Power Outage",
    outage_event: featureType === "gust_report" ? "Storm Wind Report" : "Major Outage Event",
  };

  return (
    <div className="
      fixed md:absolute z-20 bg-gray-900/97 backdrop-blur border-gray-700 shadow-2xl flex flex-col
      bottom-0 left-0 right-0 rounded-t-xl border-t max-h-[60vh]
      md:bottom-4 md:left-4 md:right-auto md:w-80 md:rounded-lg md:border md:max-h-[70vh]
    ">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
        <div>
          <div className="text-xs font-bold text-white">
            {layerTitle[(props as { _layer: string })._layer] || "Feature"}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tierInfo.color}`}>
              {tier}
            </span>
            <span className="text-[10px] text-gray-400">{tierInfo.label}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none ml-2"
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto flex-1">
        {(props as { _layer: string })._layer === "alerts" && <AlertDetail props={props as AlertProperties} />}
        {(props as { _layer: string })._layer === "lsr" && <LSRDetail props={props as LSRProperties} />}
        {(props as { _layer: string })._layer === "corridors" && <CorridorDetail props={props as CorridorProperties} />}
        {isHistory && <HistoryDetail props={props as TornadoHistoryProperties} />}
        {isLiveOutage && <LiveOutageDetail props={props as OutageLiveProperties} />}
        {isOutageEvent && <OutageEventDetail props={props as OutageEventProperties} />}
        {isGust && <GustReportDetail props={props as GustReportProperties} />}
      </div>

      {/* Provenance footer */}
      <div className="px-3 py-2 border-t border-gray-700 flex-shrink-0">
        <div className="text-[10px] text-gray-500">
          {tierInfo.description}
        </div>
      </div>
    </div>
  );
}
