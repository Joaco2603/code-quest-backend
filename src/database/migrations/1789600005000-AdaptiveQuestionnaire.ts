import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A new questionnaire preserves historical questions and assessment answers. */
export class AdaptiveQuestionnaire1789600005000 implements MigrationInterface {
  name = 'AdaptiveQuestionnaire1789600005000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE questions ADD COLUMN rules jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    const [questionnaire] = (await runner.query(
      `INSERT INTO questionnaires (title, description) VALUES ($1, $2) RETURNING id`,
      [
        'Tu próxima ruta de aprendizaje',
        'Cuatro preguntas iniciales y hasta tres autoevaluaciones según tus intereses.',
      ],
    )) as { id: number }[];
    const addQuestion = async (
      question: string,
      type: string,
      sort: number,
      rules: object,
      options: [string, string][],
    ) => {
      const [row] = (await runner.query(
        `INSERT INTO questions (questionnaire_id, question, type, sort_order, rules) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [questionnaire.id, question, type, sort, JSON.stringify(rules)],
      )) as { id: number }[];
      const ids: number[] = [];
      for (const [index, [label, value]] of options.entries()) {
        const [option] = (await runner.query(
          `INSERT INTO answer_options (question_id,label,value,sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
          [row.id, label, value, index],
        )) as { id: number }[];
        ids.push(option.id);
      }
      return { id: row.id, options: ids };
    };
    await addQuestion(
      '¿Qué querés lograr?',
      'single_choice',
      1,
      { allowDetails: true },
      [
        ['Conseguir trabajo', 'job'],
        ['Crear un proyecto', 'project'],
        ['Mejorar mis habilidades', 'improve'],
        ['Explorar un área nueva', 'explore'],
        ['Otro objetivo', 'other'],
      ],
    );
    await addQuestion('¿Qué área te interesa?', 'single_choice', 2, {}, [
      ['Desarrollo web frontend', 'frontend'],
      ['Backend', 'backend'],
      ['Desarrollo móvil', 'mobile'],
      ['Bases de datos', 'data'],
      ['Infraestructura', 'infrastructure'],
      ['Todavía no sé', 'undecided'],
    ]);
    await addQuestion(
      '¿Qué experiencia tenés programando?',
      'single_choice',
      3,
      {},
      [
        ['Nunca programé', 'none'],
        ['Hice ejercicios o cursos', 'exercises'],
        ['Construí proyectos', 'projects'],
        ['Programo profesionalmente', 'professional'],
      ],
    );
    const technologies: [string, string][] = [
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
    const technologyQuestion = await addQuestion(
      '¿Qué tecnologías te gustaría aprender? (opcional, hasta 3)',
      'multiple_choice',
      4,
      { required: false, maxSelections: 3 },
      technologies,
    );
    for (const [index, [label]] of technologies.entries()) {
      await addQuestion(
        `¿Cuál es tu experiencia con ${label}?`,
        'single_choice',
        5 + index,
        {
          showWhen: {
            questionId: technologyQuestion.id,
            answerOptionId: technologyQuestion.options[index],
          },
        },
        [
          ['Nunca la usé', 'never_used'],
          ['Hice ejercicios', 'exercises'],
          ['Construí proyectos', 'projects'],
          ['La uso profesionalmente', 'professional'],
          ['No sé evaluar mi nivel', 'unknown'],
        ],
      );
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    const candidates = (await runner.query(
      `SELECT id FROM questionnaires WHERE title=$1 AND description=$2`,
      [
        'Tu próxima ruta de aprendizaje',
        'Cuatro preguntas iniciales y hasta tres autoevaluaciones según tus intereses.',
      ],
    )) as { id: number }[];
    if (candidates.length !== 1)
      throw new Error(
        'Cannot safely identify the seeded questionnaire for rollback',
      );
    const id = candidates[0].id;
    const [result] = (await runner.query(
      `SELECT count(*)::int AS count FROM assessments WHERE questionnaire_id=$1`,
      [id],
    )) as { count: number }[];
    if (result.count > 0)
      throw new Error(
        'Cannot revert adaptive questionnaire with existing assessments',
      );
    await runner.query(`DELETE FROM questionnaires WHERE id=$1`, [id]);
    await runner.query(`ALTER TABLE questions DROP COLUMN rules`);
  }
}
