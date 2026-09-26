import type { MigrationInterface, QueryRunner } from 'typeorm';

const TITLE = 'Tu ruta personal';
const DESCRIPTION =
  'Preguntas para armar una ruta personal con IA. No crea roadmaps globales.';

const FALLBACK_TECHNOLOGIES: [string, string][] = [
  ['JavaScript', 'javascript'],
  ['TypeScript', 'typescript'],
  ['React', 'react'],
  ['Angular', 'angular'],
  ['Vue', 'vue'],
  ['NestJS', 'nestjs'],
  ['Node.js', 'nodejs'],
  ['Flutter', 'flutter'],
  ['Docker', 'docker'],
  ['SQL', 'sql'],
  ['Python', 'python'],
  ['Java', 'java'],
  ['CSS', 'css'],
  ['Astro', 'astro'],
  ['React Native', 'react-native'],
  ['.NET', 'dotnet'],
  ['PHP', 'php'],
  ['Go', 'go'],
];

/** Questions that feed a personal roadmap. Global routes stay admin-authored. */
export class PersonalQuestionnaire1789600009000 implements MigrationInterface {
  name = 'PersonalQuestionnaire1789600009000';

  async up(runner: QueryRunner): Promise<void> {
    const existing = (await runner.query(
      `SELECT id FROM questionnaires WHERE title = $1 AND description = $2`,
      [TITLE, DESCRIPTION],
    )) as { id: number }[];
    if (existing.length > 0) return;

    const [questionnaire] = (await runner.query(
      `INSERT INTO questionnaires (title, description) VALUES ($1, $2) RETURNING id`,
      [TITLE, DESCRIPTION],
    )) as { id: number }[];
    const addQuestion = async (
      question: string,
      type: string,
      sort: number,
      rules: object,
      options: [string, string][],
    ) => {
      const [row] = (await runner.query(
        `INSERT INTO questions (questionnaire_id, question, type, sort_order, rules)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [questionnaire.id, question, type, sort, JSON.stringify(rules)],
      )) as { id: number }[];
      const ids: number[] = [];
      for (const [index, [label, value]] of options.entries()) {
        const [option] = (await runner.query(
          `INSERT INTO answer_options (question_id, label, value, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [row.id, label, value, index],
        )) as { id: number }[];
        ids.push(option.id);
      }
      return { id: row.id, options: ids };
    };

    const goal = await addQuestion(
      '¿Para qué quieres aprender a programar?',
      'single_choice',
      1,
      {},
      [
        ['Aprender por interés', 'interest'],
        ['Construir algo', 'build'],
        ['Conseguir trabajo', 'job'],
        ['Mejorar en mi área', 'improve'],
      ],
    );
    await addQuestion(
      '¿Qué quieres construir?',
      'text',
      2,
      {
        showWhen: {
          questionId: goal.id,
          answerOptionId: goal.options[1],
        },
      },
      [],
    );
    await addQuestion(
      '¿De qué país eres?',
      'text',
      3,
      {
        showWhen: {
          questionId: goal.id,
          answerOptionId: goal.options[2],
        },
      },
      [],
    );
    await addQuestion(
      '¿Qué área te interesa más?',
      'single_choice',
      4,
      {},
      [
        ['Frontend', 'frontend'],
        ['Backend', 'backend'],
        ['Full stack', 'fullstack'],
        ['Mobile', 'mobile'],
        ['DevOps', 'devops'],
        ['IA', 'ai'],
        ['Base de datos', 'data'],
      ],
    );
    await addQuestion(
      '¿Qué nivel considerás que tenés actualmente?',
      'single_choice',
      5,
      {},
      [
        ['Principiante', 'beginner'],
        ['Básico', 'basic'],
        ['Intermedio', 'intermediate'],
        ['Avanzado', 'advanced'],
      ],
    );
    const technologies = await technologyOptions(runner);
    const technologyQuestion = await addQuestion(
      '¿Qué tecnologías conocés?',
      'multiple_choice',
      6,
      { required: false, maxSelections: 12 },
      technologies,
    );
    for (const [index, [label]] of technologies.entries()) {
      await addQuestion(
        `¿Qué nivel tenés en ${label}?`,
        'single_choice',
        7 + index,
        {
          showWhen: {
            questionId: technologyQuestion.id,
            answerOptionId: technologyQuestion.options[index],
          },
        },
        [
          ['Nunca usé', 'never'],
          ['Básico', 'basic'],
          ['Puedo hacer proyectos', 'projects'],
          ['Trabajo con ello', 'professional'],
        ],
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const candidates = (await runner.query(
      `SELECT id FROM questionnaires WHERE title = $1 AND description = $2`,
      [TITLE, DESCRIPTION],
    )) as { id: number }[];
    if (candidates.length !== 1)
      throw new Error(
        'Cannot safely identify the personal questionnaire for rollback',
      );
    const id = candidates[0].id;
    const [result] = (await runner.query(
      `SELECT count(*)::int AS count FROM assessments WHERE questionnaire_id = $1`,
      [id],
    )) as { count: number }[];
    if (result.count > 0)
      throw new Error(
        'Cannot revert personal questionnaire with existing assessments',
      );
    await runner.query(`DELETE FROM questionnaires WHERE id = $1`, [id]);
  }
}

async function technologyOptions(runner: QueryRunner) {
  const rows = (await runner.query(
    `SELECT DISTINCT t.name AS name
     FROM technologies t
     INNER JOIN course_technologies ct ON ct.technology_id = t.id
     ORDER BY t.name`,
  )) as { name: string }[];
  const unique = new Map<string, [string, string]>();
  for (const row of rows) {
    const name = row.name.trim();
    const value = slug(name);
    if (name && value && !unique.has(value)) unique.set(value, [name, value]);
  }
  return unique.size ? [...unique.values()] : FALLBACK_TECHNOLOGIES;
}

function slug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
