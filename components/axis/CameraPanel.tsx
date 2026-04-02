"use client";

import type { RefObject } from "react";
import type { CameraStatus } from "../../types/axis";

export default function CameraPanel({
  videoRef,
  cameraStatus,
  subjectLocked,
  lockStrength,
  cameraError,
  hasVideo,
  startCamera,
  stopCamera,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  cameraStatus: CameraStatus;
  subjectLocked: boolean;
  lockStrength: number;
  cameraError: string;
  hasVideo: boolean;
  startCamera: () => void;
  stopCamera: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black p-3">
      <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#030303]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-[4/5] w-full bg-black object-cover lg:aspect-[16/10]"
        />

        {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center">
              <div className="text-sm uppercase tracking-[0.3em] text-white/35">
                Camera feed
              </div>
              <div className="mt-3 text-white/70">
                {cameraStatus === "REQUESTING"
                  ? "Requesting camera..."
                  : cameraStatus === "ERROR"
                    ? "Camera failed to start"
                    : "Tap Start Camera"}
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-4 top-4 flex gap-2">
            <Badge>{hasVideo ? "LIVE" : "NO FEED"}</Badge>
            <Badge>{subjectLocked ? "LOCKED" : "SEARCHING"}</Badge>
          </div>

          <div className="absolute right-4 top-4">
            <Badge>{cameraStatus}</Badge>
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-[58%] w-[44%] rounded-[32px] border border-lime-300/30">
              <div className="absolute left-[-1px] top-[-1px] h-6 w-6 border-l border-t border-lime-300" />
              <div className="absolute right-[-1px] top-[-1px] h-6 w-6 border-r border-t border-lime-300" />
              <div className="absolute bottom-[-1px] left-[-1px] h-6 w-6 border-b border-l border-lime-300" />
              <div className="absolute bottom-[-1px] right-[-1px] h-6 w-6 border-b border-r border-lime-300" />
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-white/10 bg-black/65 p-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-white/45">
                <span>Lock strength</span>
                <span className="text-white/80">{lockStrength}</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-300 transition-all duration-300"
                  style={{ width: `${lockStrength}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {cameraStatus === "READY" ? (
                <button
                  onClick={stopCamera}
                  className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={startCamera}
                  className="pointer-events-auto rounded-2xl bg-lime-300 px-4 py-3 text-sm font-semibold text-black"
                >
                  Start
                </button>
              )}

              <button
                onClick={() => {
                  if (cameraStatus === "READY") stopCamera();
                  else startCamera();
                }}
                className="pointer-events-auto rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {cameraError ? (
        <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
          {cameraError}
        </div>
      ) : null}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/75">
      {children}
    </div>
  );
}