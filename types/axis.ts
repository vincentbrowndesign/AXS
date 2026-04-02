export type AxisState = "SET" | "RISE" | "RELEASE" | "LAND";
export type TimingTag = "RUSHED" | "CLEAN" | "DELAYED";
export type StructureTag = "WEAK" | "STABLE" | "STRONG";
export type LineTag = "OFF" | "STRAIGHT";

export type RepRecord = {
  id: number;
  createdAt: string;
  statePath: AxisState[];
  timing: TimingTag;
  structure: StructureTag;
  lineTag: LineTag;
  signal: number;
  integrity: number;
  line: number;
  preRollMs: number;
  postRollMs: number;
  durationMs: number;
};

export type CameraStatus = "IDLE" | "REQUESTING" | "READY" | "ERROR";