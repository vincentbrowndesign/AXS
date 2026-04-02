"use client";

import { useEffect, useMemo, useState } from "react";
import Camera from "@/components/axis/Camera";
import SignalBar from "@/components/axis/SignalBar";
import Waveform from "@/components/axis/Waveform";
import Label from "@/components/axis/Label";

type Metrics = {
poseConfidence: number;
releaseDetected: boolean;
lineScore: number;
finishScore: number;
timingMs: number | null;
signalValue: number;
};

export default function AxisPage() {
const [metrics, setMetrics] = useState<Metrics | null>(null);
const [wave, setWave] = useState<number[]>(Array(64).fill(50));
const [signal, setSignal] = useState(0);
const [result, setResult] = useState<"MAKE" | "MISS" | null>(null);
const [flash, setFlash] = useState(false);

useEffect(() => {
if (!metrics) return;

```
const id = setInterval(() => {
  setWave((prev) => {
    const nextVal = metrics.signalValue * 100;
    const smooth = prev[prev.length - 1] * 0.75 + nextVal * 0.25;
    return [...prev.slice(1), smooth];
  });

  setSignal(Math.round(metrics.signalValue * 100));
}, 120);

return () => clearInterval(id);
```

}, [metrics]);

useEffect(() => {
if (!metrics || !metrics.releaseDetected) return;

```
setFlash(true);
const t = setTimeout(() => setFlash(false), 120);
return () => clearTimeout(t);
```

}, [metrics]);

const labels = useMemo(() => {
if (!metrics) return null;

```
const line = metrics.lineScore > 0.6 ? "STRAIGHT" : "OFF";
const finish = metrics.finishScore > 0.6 ? "FULL" : "SHORT";

let timing: "EARLY" | "ON TIME" | "LATE" = "ON TIME";

if (metrics.timingMs !== null) {
  if (metrics.timingMs < 180) timing = "EARLY";
  else if (metrics.timingMs > 320) timing = "LATE";
}

return { line, finish, timing };
```

}, [metrics]);

return ( <main className="min-h-screen bg-black text-white"> <div className="max-w-md mx-auto p-4 relative">

```
    <Camera onPoseMetrics={setMetrics} />

    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40 pointer-events-none" />

    <div
      className={
        "absolute inset-0 pointer-events-none transition-opacity duration-150 " +
        (flash ? "opacity-100 bg-lime-300/10" : "opacity-0")
      }
    />

    {labels && (
      <div className="absolute top-20 left-4 flex flex-col gap-1.5">
        <Label text={labels.line} />
        <Label text={labels.finish} />
        <Label text={labels.timing} />
      </div>
    )}

    <div className="absolute top-4 right-4 text-lime-300 text-sm tracking-[0.2em]">
      {signal}
    </div>

    <div className="mt-[65vh]">
      <Waveform values={wave} />
    </div>

    <SignalBar value={signal} />

    <div className="grid grid-cols-2 gap-3 mt-5">
      <button
        onClick={() => setResult("MAKE")}
        className={
          "rounded-xl border py-3 text-sm tracking-[0.2em] transition " +
          (result === "MAKE"
            ? "border-lime-300 text-lime-300"
            : "border-white/15 text-white/70 hover:bg-white/10")
        }
      >
        MAKE
      </button>

      <button
        onClick={() => setResult("MISS")}
        className={
          "rounded-xl border py-3 text-sm tracking-[0.2em] transition " +
          (result === "MISS"
            ? "border-lime-300 text-lime-300"
            : "border-white/15 text-white/70 hover:bg-white/10")
        }
      >
        MISS
      </button>
    </div>

  </div>
</main>
```

);
}