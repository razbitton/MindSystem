export const MEMORY_DEDUPE_SIMILARITY_THRESHOLD = 0.72;

export interface MemoryDedupeText {
  title: string;
  summary?: string | null | undefined;
  body?: string | null | undefined;
}

export function findSimilarMemory<T extends MemoryDedupeText>(
  memories: T[],
  candidate: MemoryDedupeText,
  threshold = MEMORY_DEDUPE_SIMILARITY_THRESHOLD
) {
  return memories.find((memory) => memorySimilarity(memory, candidate) >= threshold) ?? null;
}

export function memorySimilarity(leftMemory: MemoryDedupeText, rightMemory: MemoryDedupeText) {
  const left = tokenSet([leftMemory.title, leftMemory.summary, leftMemory.body].filter(Boolean).join(" "));
  const right = tokenSet([rightMemory.title, rightMemory.summary, rightMemory.body].filter(Boolean).join(" "));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / Math.max(left.size, right.size);
}

function tokenSet(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9\u0590-\u05ff]+/i).filter((token) => token.length > 2));
}
