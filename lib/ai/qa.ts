import { db } from "@/lib/db";
import { createEmbedding, cosineSimilarity } from "@/lib/ai/embeddings";
import { aiProvider } from "@/lib/ai/provider";
import { groundedAnswerSchema, type GroundedAnswer } from "@/lib/ai/schemas";
import { askSystem } from "@/lib/ai/prompts";

const unsupportedAnswer = "The available feedback does not contain sufficient evidence to answer that question.";

type RetrievedFeedback = { id: string; content: string; customerLabel: string | null; channel: string; score: number };

export function enforceGrounding(answer: GroundedAnswer, sources: RetrievedFeedback[]) {
  const validIds = new Set(sources.map((source) => source.id));
  const sourceIds = answer.sourceIds.filter((id) => validIds.has(id));
  if (sourceIds.length === 0 || answer.insufficientEvidence) return { answer: unsupportedAnswer, sourceIds, insufficientEvidence: true };
  return { ...answer, sourceIds, insufficientEvidence: false };
}

export async function retrieveFeedback(workspaceId: string, questionVector: number[], topK = 5): Promise<RetrievedFeedback[]> {
  const records = await db.feedback.findMany({ where: { workspaceId, embedding: { isNot: null } }, select: { id: true, content: true, customerLabel: true, channel: true, embedding: { select: { vector: true } } }, take: 5000 });
  return records.map((record) => ({ id: record.id, content: record.content, customerLabel: record.customerLabel, channel: record.channel, score: cosineSimilarity(questionVector, record.embedding?.vector as number[]) })).sort((left, right) => right.score - left.score).slice(0, topK);
}

export async function answerQuestion(workspaceId: string, question: string): Promise<{ answer: GroundedAnswer; sources: RetrievedFeedback[] }> {
  const questionVector = await createEmbedding(question);
  const sources = await retrieveFeedback(workspaceId, questionVector, 5);
  if (sources.length === 0) return { answer: { answer: unsupportedAnswer, sourceIds: [], insufficientEvidence: true }, sources };
  const answer = await aiProvider.complete({ system: askSystem, user: JSON.stringify({ question, retrievedFeedback: sources.map(({ id, content, customerLabel, channel }) => ({ id, content, customerLabel, channel })) }), schema: groundedAnswerSchema });
  const safeAnswer = enforceGrounding(answer, sources);
  if (safeAnswer.insufficientEvidence) return { answer: safeAnswer, sources };
  return { answer: safeAnswer, sources: sources.filter((source) => safeAnswer.sourceIds.includes(source.id)) };
}
