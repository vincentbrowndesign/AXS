"use client";

import type { AxisState } from "@/types/axis";

export function Meter({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/50">
        <span>{label}</span>
        <span className="text-white/80">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-lime-300 transition-all duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function PhaseCell({
  label,
  active,
}: {
  label: AxisState;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-2 py-3 text-center text-[11px] uppercase tracking-[0.24em] transition ${
        active
          ? "border-lime-300/40 bg-lime-300/10 text-lime-300"
          : "border-white/10 bg-white/[0.03] text-white/40"
      }`}
    >
      {label}
    </div>
  );
}

export function TruthPill({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-4 py-2 text-sm font-medium ${
        active
          ? "border-lime-300/30 bg-lime-300/10 text-lime-300"
          : "border-white/10 bg-white/[0.03] text-white/70"
      }`}
    >
      {label}
    </span>
  );
}