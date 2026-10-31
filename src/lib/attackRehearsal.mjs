export function drawRandomQuestions(questionBank, previousQuestionIds = [], count = 5, random = Math.random) {
  const previousIds = new Set(previousQuestionIds);
  let candidates = questionBank.filter((question) => !previousIds.has(question.id));
  if (candidates.length < count) candidates = [...questionBank];

  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    const swapIndex = Math.min(index, Math.max(0, randomIndex));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}
