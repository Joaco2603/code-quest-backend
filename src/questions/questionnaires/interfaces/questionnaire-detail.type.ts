import { QuestionType } from '../enums/question-type.enum.js';

export type AnswerOptionDetail = {
  id: number;
  label: string;
  value: string | null;
  sortOrder: number;
};

export type QuestionDetail = {
  id: number;
  question: string;
  type: QuestionType;
  isActive: boolean;
  sortOrder: number;
  options: AnswerOptionDetail[];
};

export type QuestionnaireDetail = {
  id: number;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  questions: QuestionDetail[];
};
