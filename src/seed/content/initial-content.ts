import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Category,
  Course,
  CourseStatus,
  Technology,
} from '../../catalog/entities.js';
import { Questionnaire } from '../../questions/entities/questionnaire.entity.js';
import { Question } from '../../questions/entities/question.entity.js';
import { AnswerOption } from '../../questions/entities/answer-option.entity.js';
import { QuestionType } from '../../questions/enums/question-type.enum.js';
import { EvaluationConfig } from '../../assessments/entities/index.js';
import type {
  EvaluationDefinition,
  QuestionRule,
} from '../../assessments/interfaces/index.js';
import { validateDefinition } from '../../assessments/evaluation.js';
import { serializeQuestionnaire } from '../../questions/serializers/questions.serializer.js';
import type { SourceCourse } from './course-source.js';

const initialTechnologies = [
  'JavaScript',
  'TypeScript',
  'React',
  'Angular',
  'Vue',
  'NestJS',
  'Node.js',
  'Flutter',
  'Docker',
  'SQL',
  'Python',
];
const questionnaireKey = 'codequest:self-assessment:v1';

async function taxonomy(
  manager: EntityManager,
  entity: typeof Category | typeof Technology,
  name: string,
) {
  const existing = await manager
    .getRepository(entity)
    .createQueryBuilder('item')
    .where('lower(trim(item.name)) = lower(trim(:name))', { name })
    .getOne();
  return existing ?? manager.save(entity, { name });
}

// One transaction and the same advisory lock used by catalog writes make this
// repeatable and atomic, even if two operators start the import together.
export async function importInitialContent(
  db: DataSource,
  courses: SourceCourse[],
) {
  return db.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(1789600000)');
    const categories = new Map<string, Category>();
    for (const name of [...new Set(courses.map((c) => c.category))].sort())
      categories.set(name, await taxonomy(manager, Category, name));
    let imported = 0;
    let skipped = 0;
    for (const source of courses) {
      const marker = await manager.query(
        'SELECT course_id FROM content_imports WHERE source_key = $1',
        [source.key],
      );
      if (marker.length) {
        skipped++;
        continue;
      }
      const existing = await manager.find(Course, {
        where: { url: source.url },
      });
      if (existing.length > 1)
        throw new ConflictException(
          `Multiple existing courses for ${source.url}`,
        );
      const course =
        existing[0] ??
        (await manager.save(
          Course,
          manager.create(Course, {
            title: source.title,
            description: source.description,
            instructor: source.instructor,
            url: source.url,
            status: CourseStatus.Draft,
            imageUrl: null,
            durationMinutes: null,
            level: null,
            categories: [categories.get(source.category)!],
            technologies: [],
            prerequisites: [],
          }),
        ));
      await manager.query(
        'INSERT INTO content_imports(source_key, course_id) VALUES ($1, $2)',
        [source.key, course.id],
      );
      if (existing.length) skipped++;
      else imported++;
    }
    const previous = await manager.query(
      'SELECT questionnaire_id FROM content_imports WHERE source_key = $1',
      [questionnaireKey],
    );
    if (previous.length)
      return {
        imported,
        skipped,
        questionnaireId: previous[0].questionnaire_id as number,
        questionnaireCreated: false,
      };
    if (!categories.size)
      throw new ConflictException(
        'At least one DevTalles course category is required',
      );
    const technologies: Technology[] = [];
    for (const name of initialTechnologies)
      technologies.push(await taxonomy(manager, Technology, name));
    const questionnaire = await manager.save(Questionnaire, {
      title: 'Tus intereses y habilidades',
      description:
        'Autoevaluación para personalizar rutas con IA. El nivel es declarado por vos; no es una certificación técnica.',
      isActive: true,
    });
    const rules: QuestionRule[] = [];
    let sortOrder = 0;
    async function addQuestion(
      label: string,
      type: QuestionType,
      base: Omit<QuestionRule, 'questionId' | 'options'>,
      options: Array<{ label: string; value: string | number | null }> = [],
    ) {
      const question = await manager.save(Question, {
        questionnaire: { id: questionnaire.id },
        question: label,
        type,
        isActive: true,
        sortOrder: sortOrder++,
      });
      const mappings: QuestionRule['options'] = [];
      for (const [index, option] of options.entries()) {
        const saved = await manager.save(AnswerOption, {
          question: { id: question.id },
          label: option.label,
          value: null,
          sortOrder: index,
        });
        mappings.push({ optionId: saved.id, value: option.value });
      }
      rules.push({ ...base, questionId: question.id, options: mappings });
    }
    await addQuestion(
      '¿Qué áreas te interesan?',
      QuestionType.MULTIPLE_CHOICE,
      {
        kind: 'category_interest',
        required: true,
        maxSelections: categories.size,
      },
      [...categories.values()].map((c) => ({ label: c.name, value: c.id })),
    );
    await addQuestion(
      '¿Qué tecnologías te gustaría aprender?',
      QuestionType.MULTIPLE_CHOICE,
      {
        kind: 'technology_interest',
        required: false,
        maxSelections: technologies.length,
      },
      technologies.map((t) => ({ label: t.name, value: t.id })),
    );
    await addQuestion(
      '¿Qué querés lograr con tu ruta de aprendizaje?',
      QuestionType.TEXT,
      { kind: 'goal', required: true, maxLength: 1000 },
    );
    for (const technology of technologies) {
      await addQuestion(
        `¿Cómo describís tu nivel actual en ${technology.name}?`,
        QuestionType.SINGLE_CHOICE,
        {
          kind: 'self_reported_skill',
          required: false,
          technologyId: technology.id,
        },
        [
          { label: 'No sé / prefiero no responder', value: null },
          { label: 'Principiante', value: 'beginner' },
          { label: 'Intermedio', value: 'intermediate' },
          { label: 'Avanzado', value: 'advanced' },
        ],
      );
    }
    const definition: EvaluationDefinition = { rules };
    const loaded = await manager.findOneOrFail(Questionnaire, {
      where: { id: questionnaire.id },
      relations: { questions: { options: true } },
    });
    validateDefinition(serializeQuestionnaire(loaded, true), definition);
    await manager.save(EvaluationConfig, {
      questionnaireId: questionnaire.id,
      version: 1,
      definition,
    });
    for (const category of categories.values())
      await manager.query(
        'INSERT INTO evaluation_taxonomy_refs(questionnaire_id, category_id) VALUES ($1, $2)',
        [questionnaire.id, category.id],
      );
    for (const technology of technologies)
      await manager.query(
        'INSERT INTO evaluation_taxonomy_refs(questionnaire_id, technology_id) VALUES ($1, $2)',
        [questionnaire.id, technology.id],
      );
    await manager.query(
      'INSERT INTO content_imports(source_key, questionnaire_id) VALUES ($1, $2)',
      [questionnaireKey, questionnaire.id],
    );
    return {
      imported,
      skipped,
      questionnaireId: questionnaire.id,
      questionnaireCreated: true,
    };
  });
}
