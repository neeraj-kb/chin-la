export function drawRandomQuestions<T extends { id: string }>(
  questionBank: readonly T[],
  previousQuestionIds?: readonly string[],
  count?: number,
  random?: () => number,
): T[];
