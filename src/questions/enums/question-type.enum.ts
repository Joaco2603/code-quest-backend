export enum QuestionType {
  SINGLE_CHOICE = 'single_choice',
  MULTIPLE_CHOICE = 'multiple_choice',
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
}

export const CHOICE_QUESTION_TYPES: readonly QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
];

export function isChoiceQuestionType(type: QuestionType): boolean {
  return CHOICE_QUESTION_TYPES.includes(type);
}
