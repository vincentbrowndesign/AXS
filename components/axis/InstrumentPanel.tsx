"use client";

import type {
  AxisState,
  LineTag,
  StructureTag,
  TimingTag,
} from "../../types/axis";
import { Meter, PhaseCell, TruthPill } from "./ui";

export default function InstrumentPanel({
  axisState,
  captureLabel,
  preRollReady,
  activeStatePath,
  bufferPercent,
  lockStrength,
  signal,
  integrity,
  line,
  timingTag,
  structureTag,
  lineTag,
  runRep,
  isCapturing,
  cameraReady,
}: {
  axisState: AxisState;
  captureLabel: string;
  preRollReady: boolean;
  activeStatePath: AxisState[];
  bufferPercent: number;
  lockStrength: number;
  signal: number;
  integrity: number;
  line: number;
  timingTag: TimingTag;
  structureTag: StructureTag;
  lineTag: LineTag;
  runRep: () => void;
  isCapturing: boolean;
  cameraReady: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[#070707] p-3">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
              Instrument
            </div>
            <div className="mt-2 text-sm text-white/60">
              {captureLabel} · {preRollReady ? "PRE-ROLL READY" : "FILLING BUFFER"}
            </div>
          </div>

          <div className="rounded-full border border-lime-300/25 bg-lime-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-lime-300">
            {axisState}
          </div>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-2">
          {activeStatePath.map((state) => (
            <PhaseCell key={state} label={state} active={axisState === state} />
          ))}
        </div>

        <div className="space-y-4">
          <Meter label="Buffer" value={bufferPercent} />
          <Meter label="Lock" value={lockStrength} />
          <Meter label="Signal" value={signal} />
          <Meter label="Integrity" value={integrity} />
          <Meter label="Line" value={line} />
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <TruthBox label="Timing" value={timingTag} />
          <TruthBox label="Structure" value={structureTag} />
          <TruthBox label="Line" value={lineTag} />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <TruthPill label={timingTag} active />
          <TruthPill label={structureTag} active />
          <TruthPill label={lineTag} active />
        </div>

        <button
          onClick={runRep}
          disabled={isCapturing || !cameraReady}
          className="mt-6 w-full rounded-2xl bg-lime-300 px-6 py-4 text-base font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCapturing ? "Running..." : "Tap — Run Rep"}
        </button>
      </div>
    </div>
  );
}

function TruthBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-lime-300">{value}</div>
    </div>
  );
}