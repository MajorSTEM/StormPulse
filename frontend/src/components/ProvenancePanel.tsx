"use client";

import type { SelectedFeature, AlertProperties, LSRProperties, CorridorProperties } from "@/lib/types";
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
      <div className="bg-orange-900/40 border border-orange-600 rounded p-2">
        <div className="text-xs text-orange-300 font-medium">&#9888; INFERRED LAYER</div>
        <div className="text-xs text-orange-200 mt-0.5">{props._disclaimer}</div>
      </div>
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
    </div>
  );
}

export default function ProvenancePanel({ feature, onClose }: Props) {
  if (!feature) return null;

  const props = feature.properties as AlertProperties | LSRProperties | CorridorProperties;
  const tier = (props.confidence_tier as string) || "T2";
  const tierInfo = TIER_LABELS[tier] || TIER_LABELS["T2"];

  const layerTitle: Record<string, string> = {
    alerts: "NWS Alert",
    lsr: "Local Storm Report",
    corridors: "Probable Damage Corridor",
  };

  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 bg-gray-900/97 backdrop-blur rounded-lg border border-gray-700 shadow-2xl max-h-[70vh] flex flex-col">
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
