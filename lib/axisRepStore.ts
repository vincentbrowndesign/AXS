import type { AxisInterpretation } from "@/lib/axisInterpret";

export type AxisRep = {
id: string;

// timing
entry: "clean" | "rushed" | "delayed";
go: "clean" | "rushed" | "delayed";
hold: "good" | "short";

// result
line: "straight" | "off";

// interpretation layer
interpretation: AxisInterpretation;
};