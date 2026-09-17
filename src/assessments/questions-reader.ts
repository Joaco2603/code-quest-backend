export const QUESTIONS_READER = 'QUESTIONS_READER';

export enum QuestionType {
  SingleChoice = 'single_choice',
  MultipleChoice = 'multiple_choice',
  Text = 'text',
  Number = 'number',
  Boolean = 'boolean',
}

export type QuestionSnapshot = {
  id: number;
  questionnaireId: number;
  question: string;
  type: QuestionType;
  isActive: boolean;
  sortOrder: number;
  options: {
    id: number;
    label: string;
    value: string | null;
    sortOrder: number | null;
  }[];
};

export type QuestionnaireSnapshot = {
  id: number;
  title: string;
  isActive: boolean;
  questions: QuestionSnapshot[];
};

export interface QuestionsReader {
  getActiveQuestionnaire(id: number): Promise<QuestionnaireSnapshot>;
}
