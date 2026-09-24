import { ConflictException } from '@nestjs/common';
import {
  QuestionType,
  isChoiceQuestionType,
} from '../enums/question-type.enum.js';
import type { QuestionRulesDto } from '../dtos/question-rules.dto.js';

type AdaptiveQuestion = {
  id: number;
  type: QuestionType;
  isActive: boolean;
  rules?: QuestionRulesDto;
  options: Array<{ id: number }>;
};
type SelectedAnswer = { questionId: number; answerOptionId: number | null };

export function validateAdaptiveQuestions(questions: AdaptiveQuestion[]) {
  for (const question of questions.filter((q) => q.isActive)) {
    const rules = question.rules ?? {};
    if (
      rules.maxSelections !== undefined &&
      question.type !== QuestionType.MULTIPLE_CHOICE
    )
      throw new ConflictException(
        'maxSelections requires a multiple-choice question',
      );
    if (rules.allowDetails && question.type !== QuestionType.SINGLE_CHOICE)
      throw new ConflictException(
        'allowDetails requires a single-choice question',
      );
    const condition = rules.showWhen;
    if (!condition) continue;
    const parent = questions.find(
      (q) => q.id === condition.questionId && q.isActive,
    );
    if (
      !parent ||
      parent.id === question.id ||
      parent.rules?.showWhen ||
      !isChoiceQuestionType(parent.type) ||
      !parent.options.some((o) => o.id === condition.answerOptionId)
    ) {
      throw new ConflictException(
        'A conditional question must reference an option of an active, unconditional choice question in the same questionnaire',
      );
    }
  }
}

export function isQuestionVisible(
  question: AdaptiveQuestion,
  questions: AdaptiveQuestion[],
  answers: SelectedAnswer[],
): boolean {
  if (!question.isActive) return false;
  const condition = question.rules?.showWhen;
  if (!condition) return true;
  const parent = questions.find(
    (q) => q.id === condition.questionId && q.isActive,
  );
  return Boolean(
    parent &&
    parent.options.some((o) => o.id === condition.answerOptionId) &&
    answers.some(
      (a) =>
        a.questionId === parent.id &&
        a.answerOptionId === condition.answerOptionId,
    ),
  );
}
