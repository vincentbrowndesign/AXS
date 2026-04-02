"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AxisState,
  LineTag,
  RepRecord,
  StructureTag,
  TimingTag,
} from "@/types/axis";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickTiming(signal: number): TimingTag {
  if (signal < 40) return "RUSHED";
  if (signal > 74) return "DELAYED";
  return "CLEAN";
}

function pickStructure(integrity: number): StructureTag {
  if (integrity < 45) return "WEAK";
  if (integrity > 74) return "STRONG";
  return "STABLE";
}

function pickLine(line: number): LineTag {
  return line >= 60 ? "STRAIGHT" : "OFF";
}

export function useRepEngine(subjectLocked: boolean, cameraReady: boolean) {
  const PRE_ROLL_MS = 1400;
  const POST_ROLL_MS = 1000;
  const BUFFER_WINDOW_MS = 6000;

  const [axisState, setAxisState] = useState<AxisState>("SET");
  const [signal, setSignal] = useState(52);
  const [integrity, setIntegrity] = useState(58);
  const [line, setLine] = useState(61);

  const [timingTag, setTimingTag] = useState<TimingTag>("CLEAN");
  const [structureTag, setStructureTag] = useState<StructureTag>("STABLE");
  const [lineTag, setLineTag] = useState<LineTag>("STRAIGHT");

  const [bufferMs, setBufferMs] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureLabel, setCaptureLabel] = useState("BUFFER READY");
  const [repHistory, setRepHistory] = useState<RepRecord[]>([]);

  const nextRepId = useRef(1);
  const timeoutsRef = useRef<number[]>([]);
  const bufferIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    bufferIntervalRef.current = window.setInterval(() => {
      setBufferMs((prev) => {
        const next = prev + 100;
        return next >= BUFFER_WINDOW_MS ? BUFFER_WINDOW_MS : next;
      });
    }, 100);

    return () => {
      if (bufferIntervalRef.current) {
        window.clearInterval(bufferIntervalRef.current);
      }

      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  const preRollReady = bufferMs >= PRE_ROLL_MS;

  const activeStatePath = useMemo<AxisState[]>(() => {
    return ["SET", "RISE", "RELEASE", "LAND"];
  }, []);

  function clearRepTimeouts() {
    timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutsRef.current = [];
  }

  function runRep() {
    if (isCapturing) return;
    if (!cameraReady) return;

    clearRepTimeouts();
    setIsCapturing(true);
    setCaptureLabel(preRollReady ? "CAPTURING REP" : "LIMITED PRE-ROLL");

    const statePath: AxisState[] = ["SET", "RISE", "RELEASE", "LAND"];
    const riseDelay = 250;
    const releaseDelay = 650;
    const finishDelay = 2050;

    setAxisState("RISE");

    const timeout1 = window.setTimeout(() => {
      setAxisState("RELEASE");
    }, riseDelay);

    const timeout2 = window.setTimeout(() => {
      setAxisState("LAND");
    }, releaseDelay);

    const timeout3 = window.setTimeout(() => {
      const lockBoost = subjectLocked ? 8 : -10;

      const nextSignal = clamp(randomInt(28, 92) + lockBoost, 0, 100);
      const nextIntegrity = clamp(randomInt(22, 95), 0, 100);
      const nextLine = clamp(randomInt(18, 96), 0, 100);

      const nextTiming = pickTiming(nextSignal);
      const nextStructure = pickStructure(nextIntegrity);
      const nextLineTag = pickLine(nextLine);

      setSignal(nextSignal);
      setIntegrity(nextIntegrity);
      setLine(nextLine);

      setTimingTag(nextTiming);
      setStructureTag(nextStructure);
      setLineTag(nextLineTag);

      setAxisState("SET");
      setIsCapturing(false);
      setCaptureLabel("BUFFER READY");

      const record: RepRecord = {
        id: nextRepId.current,
        createdAt: new Date().toLocaleTimeString(),
        statePath,
        timing: nextTiming,
        structure: nextStructure,
        lineTag: nextLineTag,
        signal: nextSignal,
        integrity: nextIntegrity,
        line: nextLine,
        preRollMs: Math.min(bufferMs, PRE_ROLL_MS),
        postRollMs: POST_ROLL_MS,
        durationMs: finishDelay,
      };

      nextRepId.current += 1;
      setRepHistory((prev) => [record, ...prev].slice(0, 8));
    }, finishDelay);

    timeoutsRef.current = [timeout1, timeout2, timeout3];
  }

  return {
    PRE_ROLL_MS,
    POST_ROLL_MS,
    BUFFER_WINDOW_MS,
    axisState,
    signal,
    integrity,
    line,
    timingTag,
    structureTag,
    lineTag,
    bufferMs,
    isCapturing,
    captureLabel,
    repHistory,
    preRollReady,
    activeStatePath,
    runRep,
  };
}