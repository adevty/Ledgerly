import React from "react";
import {
  type CapabilityId,
  type NetworkMode,
  getCapabilityBadge,
} from "@/lib/capabilities";

export function CapabilityBadge({
  id,
  networkMode,
  customLabel,
  className,
}: {
  id: CapabilityId;
  networkMode?: NetworkMode;
  customLabel?: string;
  className?: string;
}) {
  const badge = getCapabilityBadge(id, networkMode);
  return (
    <span
      className={`${badge.tone} ${className ?? ""}`}
      title={badge.tooltip}
      style={{ cursor: "help" }}
    >
      <span className="status-pill-dot" aria-hidden="true" />
      <span>{customLabel ?? badge.label}</span>
    </span>
  );
}
