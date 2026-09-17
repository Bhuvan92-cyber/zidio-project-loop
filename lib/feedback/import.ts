import { parseCsvContent, type CsvImportResult } from "@/lib/validation/csv";
import { createFeedbackBatch, type FeedbackCreateInput } from "@/lib/feedback/service";
import { processFeedback } from "@/lib/ai/classifier";

export type ImportDependencies = {
  persist: (workspaceId: string, rows: FeedbackCreateInput[]) => Promise<Array<{ id: string }>>;
  process: (feedbackId: string, workspaceId: string) => Promise<unknown>;
};

const defaultDependencies: ImportDependencies = {
  persist: createFeedbackBatch,
  process: processFeedback,
};

export async function importCsvContent(workspaceId: string, csv: string, dependencies: ImportDependencies = defaultDependencies) {
  const parsed: CsvImportResult = parseCsvContent(csv);
  if (parsed.errors.length > 0) return { importedCount: 0, errorCount: parsed.errors.length, errors: parsed.errors, processing: null };
  const created = await dependencies.persist(workspaceId, parsed.rows);
  let processedCount = 0;
  let failedProcessingCount = 0;
  for (const feedback of created) {
    if (await dependencies.process(feedback.id, workspaceId)) processedCount += 1;
    else failedProcessingCount += 1;
  }
  return { importedCount: created.length, errorCount: 0, errors: [], processing: { processedCount, failedProcessingCount } };
}
