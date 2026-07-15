export type PreferenceRecord = {
  task_id: string;
  chosen: string;
  rejected: string;
  reason?: string;
  rubric: string;
};

export function toJsonl(records: PreferenceRecord[]) {
  return records.map((record) => JSON.stringify(record)).join("\n");
}
