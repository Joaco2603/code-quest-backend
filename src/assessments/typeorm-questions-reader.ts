import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  QuestionType,
  type QuestionnaireSnapshot,
  type QuestionsReader,
  type QuestionSnapshot,
} from './questions-reader.js';

type QuestionnaireRow = {
  id: number | string;
  title: string;
  isActive: boolean | string | number;
};

type QuestionRow = {
  id: number | string;
  questionnaireId: number | string;
  question: string;
  type: string;
  isActive: boolean | string | number;
  sortOrder: number | string;
};

type OptionRow = {
  id: number | string;
  questionId: number | string;
  label: string;
  value: string | null;
  sortOrder: number | string | null;
};

function asNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function asBoolean(value: boolean | string | number): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return value === 'true' || value === 't' || value === '1';
}

@Injectable()
export class TypeormQuestionsReader implements QuestionsReader {
  constructor(private readonly dataSource: DataSource) {}

  async getActiveQuestionnaire(id: number): Promise<QuestionnaireSnapshot> {
    const questionnaire = await this.dataSource
      .createQueryBuilder()
      .select([
        'q.id AS id',
        'q.title AS title',
        'q.is_active AS "isActive"',
      ])
      .from('questionnaires', 'q')
      .where('q.id = :id', { id })
      .andWhere('q.is_active = true')
      .getRawOne<QuestionnaireRow>();

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire not found');
    }

    const questionRows = await this.dataSource
      .createQueryBuilder()
      .select([
        'qs.id AS id',
        'qs.questionnaire_id AS "questionnaireId"',
        'qs.question AS question',
        'qs.type AS type',
        'qs.is_active AS "isActive"',
        'qs.sort_order AS "sortOrder"',
      ])
      .from('questions', 'qs')
      .where('qs.questionnaire_id = :id', { id })
      .andWhere('qs.is_active = true')
      .orderBy('qs.sort_order', 'ASC')
      .getRawMany<QuestionRow>();

    const questionIds = questionRows.map((row) => asNumber(row.id));
    const optionRows =
      questionIds.length === 0
        ? []
        : await this.dataSource
            .createQueryBuilder()
            .select([
              'ao.id AS id',
              'ao.question_id AS "questionId"',
              'ao.label AS label',
              'ao.value AS value',
              'ao.sort_order AS "sortOrder"',
            ])
            .from('answer_options', 'ao')
            .where('ao.question_id IN (:...questionIds)', { questionIds })
            .orderBy('ao.sort_order', 'ASC')
            .getRawMany<OptionRow>();

    const optionsByQuestion = new Map<number, QuestionSnapshot['options']>();
    for (const option of optionRows) {
      const questionId = asNumber(option.questionId);
      const list = optionsByQuestion.get(questionId) ?? [];
      list.push({
        id: asNumber(option.id),
        label: option.label,
        value: option.value,
        sortOrder:
          option.sortOrder === null || option.sortOrder === undefined
            ? null
            : asNumber(option.sortOrder),
      });
      optionsByQuestion.set(questionId, list);
    }

    const questions: QuestionSnapshot[] = questionRows.map((row) => ({
      id: asNumber(row.id),
      questionnaireId: asNumber(row.questionnaireId),
      question: row.question,
      type: row.type as QuestionType,
      isActive: asBoolean(row.isActive),
      sortOrder: asNumber(row.sortOrder),
      options: optionsByQuestion.get(asNumber(row.id)) ?? [],
    }));

    return {
      id: asNumber(questionnaire.id),
      title: questionnaire.title,
      isActive: asBoolean(questionnaire.isActive),
      questions,
    };
  }
}
