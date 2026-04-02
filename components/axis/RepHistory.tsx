"use client";

import type { RepRecord } from "../../types/axis";
import { TruthPill } from "./ui";

export default function RepHistory({
  repHistory,
}: {
  repHistory: RepRecord[];
}) {
  const latestRep = repHistory[0] ?? null;

  return (
    <section className="border-b border-white/10">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
              Rep history
            </div>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Last captured reps
            </h2>
          </div>

          {latestRep ? (
            <div className="text-right text-sm text-white/50">
              Latest rep #{latestRep.id} · {latestRep.createdAt}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {repHistory.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 text-white/55">
              No reps captured yet. Start camera, then tap “Run Rep.”
            </div>
          ) : (
            repHistory.map((rep) => (
              <div
                key={rep.id}
                className="grid gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-[0.9fr_1.1fr]"
              >
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/45">
                    Rep #{rep.id}
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    {rep.createdAt}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <TruthPill label={rep.timing} active />
                    <TruthPill label={rep.structure} active />
                    <TruthPill label={rep.lineTag} active />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      State path
                    </div>
                    <div className="mt-3">{rep.statePath.join(" → ")}</div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Capture window
                    </div>
                    <div className="mt-3">
                      Pre: {rep.preRollMs} ms
                      <br />
                      Post: {rep.postRollMs} ms
                      <br />
                      Total: {rep.durationMs} ms
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Scores
                    </div>
                    <div className="mt-3">
                      Signal: {rep.signal}
                      <br />
                      Integrity: {rep.integrity}
                      <br />
                      Line: {rep.line}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                      Status
                    </div>
                    <div className="mt-3">Stored locally in state</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}