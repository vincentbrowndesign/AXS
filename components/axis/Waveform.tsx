"use client";

export default function SignalBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[10px] tracking-[0.2em] text-white/50">
        <span>SIGNAL</span>
        <span>{safeValue}</span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-lime-300 transition-all duration-150"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}