import type { QuestionResponseDto } from '../questions/questionnaires/dtos/questionnaire-response.dto.js';
import { QuestionType } from '../questions/questionnaires/enums/question-type.enum.js';

export const PERSONAL_QUESTIONNAIRE_TITLE = 'Tu ruta personal';

export const PERSONAL_GOALS = ['interest', 'build', 'job', 'improve'] as const;
export const PERSONAL_AREAS = [
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'ai',
  'data',
] as const;
export const PERSONAL_LEVELS = [
  'beginner',
  'basic',
  'intermediate',
  'advanced',
] as const;
export const PERSONAL_SKILL_LEVELS = [
  'never',
  'basic',
  'projects',
  'professional',
] as const;

export type PersonalGoal = (typeof PERSONAL_GOALS)[number];
export type PersonalArea = (typeof PERSONAL_AREAS)[number];
export type PersonalLevel = (typeof PERSONAL_LEVELS)[number];
export type PersonalSkillLevel = (typeof PERSONAL_SKILL_LEVELS)[number];

export interface PersonalSkill {
  name: string;
  level: PersonalSkillLevel;
}

/** Answers that feed a personal roadmap. Global routes are not built from this. */
export interface PersonalLearningProfile {
  goal: PersonalGoal;
  area: PersonalArea;
  level: PersonalLevel | null;
  buildTarget: string | null;
  country: string | null;
  skills: PersonalSkill[];
}

export interface ProfileAnswer {
  questionId: number;
  answerOptionId: number | null;
  value: string | null;
}

export function readPersonalProfile(
  questions: QuestionResponseDto[],
  answers: ProfileAnswer[],
): PersonalLearningProfile | null {
  const active = questions.filter((question) => question.isActive);
  const goalQuestion = active.find(
    (question) =>
      question.type === QuestionType.SINGLE_CHOICE &&
      !question.rules?.showWhen &&
      hasValues(question, ['interest', 'build', 'job']),
  );
  const areaQuestion = active.find(
    (question) =>
      question.type === QuestionType.SINGLE_CHOICE &&
      !question.rules?.showWhen &&
      hasValues(question, ['frontend', 'fullstack']),
  );
  if (!goalQuestion || !areaQuestion) return null;

  const goal = selectedValue(goalQuestion, answers);
  const area = selectedValue(areaQuestion, answers);
  if (!isGoal(goal) || !isArea(area)) return null;

  const levelQuestion = active.find(
    (question) =>
      question.type === QuestionType.SINGLE_CHOICE &&
      !question.rules?.showWhen &&
      hasValues(question, ['beginner', 'advanced']) &&
      !hasValues(question, ['never']),
  );
  const levelValue = levelQuestion
    ? selectedValue(levelQuestion, answers)
    : null;
  const technologyQuestion = active.find(
    (question) =>
      question.type === QuestionType.MULTIPLE_CHOICE &&
      !question.rules?.showWhen,
  );

  return {
    goal,
    area,
    level: isLevel(levelValue) ? levelValue : null,
    buildTarget:
      goal === 'build'
        ? textWhen(active, answers, goalQuestion.id, 'build')
        : null,
    country:
      goal === 'job'
        ? textWhen(active, answers, goalQuestion.id, 'job')
        : null,
    skills: technologyQuestion
      ? skillsFor(active, answers, technologyQuestion)
      : [],
  };
}

function skillsFor(
  questions: QuestionResponseDto[],
  answers: ProfileAnswer[],
  technologyQuestion: QuestionResponseDto,
): PersonalSkill[] {
  const selected = new Set(
    answers
      .filter((answer) => answer.questionId === technologyQuestion.id)
      .map((answer) => answer.answerOptionId),
  );
  const skills: PersonalSkill[] = [];
  for (const option of technologyQuestion.options) {
    if (!selected.has(option.id) || !option.label.trim()) continue;
    const levelQuestion = questions.find(
      (question) =>
        question.rules?.showWhen?.questionId === technologyQuestion.id &&
        question.rules.showWhen.answerOptionId === option.id,
    );
    const level = levelQuestion
      ? selectedValue(levelQuestion, answers)
      : null;
    if (!isSkillLevel(level)) continue;
    skills.push({ name: option.label.trim(), level });
  }
  return skills;
}

function textWhen(
  questions: QuestionResponseDto[],
  answers: ProfileAnswer[],
  goalQuestionId: number,
  optionValue: string,
) {
  const goal = questions.find((question) => question.id === goalQuestionId);
  const option = goal?.options.find((item) => item.value === optionValue);
  if (!option) return null;
  const question = questions.find(
    (item) =>
      item.type === QuestionType.TEXT &&
      item.rules?.showWhen?.questionId === goalQuestionId &&
      item.rules.showWhen.answerOptionId === option.id,
  );
  if (!question) return null;
  const value = answers.find((answer) => answer.questionId === question.id)
    ?.value;
  const text = value?.trim().replace(/\s+/g, ' ') ?? '';
  return text ? text.slice(0, 500) : null;
}

function selectedValue(
  question: QuestionResponseDto,
  answers: ProfileAnswer[],
) {
  const row = answers.find((answer) => answer.questionId === question.id);
  if (!row?.answerOptionId) return null;
  return (
    question.options.find((option) => option.id === row.answerOptionId)
      ?.value ?? null
  );
}

function hasValues(question: QuestionResponseDto, values: string[]) {
  const present = new Set(question.options.map((option) => option.value));
  return values.every((value) => present.has(value));
}

function isGoal(value: string | null): value is PersonalGoal {
  return PERSONAL_GOALS.includes(value as PersonalGoal);
}

function isArea(value: string | null): value is PersonalArea {
  return PERSONAL_AREAS.includes(value as PersonalArea);
}

function isLevel(value: string | null): value is PersonalLevel {
  return PERSONAL_LEVELS.includes(value as PersonalLevel);
}

function isSkillLevel(value: string | null): value is PersonalSkillLevel {
  return PERSONAL_SKILL_LEVELS.includes(value as PersonalSkillLevel);
}
