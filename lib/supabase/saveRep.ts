import { supabase } from "./client";

export type AxisRepRow = {
session_id: string;
state: string | null;

lock_score: number | null;
signal_score: number | null;
integrity_score: number | null;
session_score: number | null;

entry_tag: string | null;
core_tag: string | null;
exit_tag: string | null;

confidence: number | null;
line_score: number | null;
timing_ms: number | null;

raw: Record<string, unknown> | null;
};

export async function saveRep(rep: AxisRepRow) {
const { data, error } = await supabase
.from("axis_reps")
.insert(rep)
.select()
.single();

if (error) {
console.error("Supabase insert error:", error);
throw error;
}

return data;
}