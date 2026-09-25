import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  Category,
  Course,
  CourseStatus,
  Technology,
} from '../../catalog/entities/catalog.entities.js';
import { Questionnaire } from '../../questions/questionnaires/entities/questionnaire.entity.js';
import { Question } from '../../questions/questionnaires/entities/question.entity.js';
import { AnswerOption } from '../../questions/questionnaires/entities/answer-option.entity.js';
import { QuestionType } from '../../questions/questionnaires/enums/question-type.enum.js';
import { EvaluationConfig } from '../../assessments/entities/index.js';
import type {
  EvaluationDefinition,
  QuestionRule,
} from '../../assessments/interfaces/index.js';
import { validateDefinition } from '../../assessments/evaluation.js';
import {
  assertPublishable,
  hasUnpublishedPrerequisites,
  publicationBlockers,
} from '../../catalog/publication.js';
import { serializeQuestionnaire } from '../../questions/questionnaires/serializers/questions.serializer.js';
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

const courseRelations = {
  categories: true,
  technologies: true,
  prerequisites: true,
};

export interface FillPublishOptions {
  // --fill-missing: complete empty fields of provenance-resolved courses.
  fillMissing?: boolean;
  // --publish-ready: publish complete drafts identified by this file.
  publishReady?: boolean;
}

export interface FilledCourse {
  courseId: number;
  fields: string[];
}

export interface PublishSkippedCourse {
  courseId: number;
  reasons: string[];
}

export interface PlanEntry {
  key: string;
  title: string;
  url: string;
  action: 'create' | 'link' | 'skip-marker' | 'ambiguous' | 'marker-orphan';
  fillFields: string[];
  publish: 'would-publish' | 'blocked' | 'not-evaluated';
  publishReasons: string[];
}

function pendingFillFields(course: Course, source: SourceCourse): string[] {
  const fields: string[] = [];
  const enrichment = source.enrichment;
  if (course.imageUrl == null && enrichment?.imageUrl) fields.push('imageUrl');
  if (course.durationMinutes == null && enrichment?.durationMinutes != null)
    fields.push('durationMinutes');
  if (course.level == null && enrichment?.level) fields.push('level');
  if (course.description == null) fields.push('description');
  if (course.instructor == null) fields.push('instructor');
  if (!course.categories?.length) fields.push('categoryIds');
  if (!course.technologies?.length && enrichment?.technologyNames.length)
    fields.push('technologyIds');
  return fields;
}

function publishReasons(course: Course, publishedIds: Set<number>): string[] {
  if (course.status === CourseStatus.Archived) return ['archived'];
  if (course.status !== CourseStatus.Draft) return ['alreadyPublished'];
  const reasons = publicationBlockers(course);
  const prerequisites = course.prerequisites.map((item) =>
    publishedIds.has(item.id)
      ? { ...item, status: CourseStatus.Published }
      : item,
  );
  if (hasUnpublishedPrerequisites({ prerequisites }))
    reasons.push('unpublishedPrerequisites');
  return reasons;
}

async function fillMissingFields(
  manager: EntityManager,
  course: Course,
  source: SourceCourse,
  category: Category,
): Promise<string[]> {
  // Only empty fields are completed. Existing values, status and
  // prerequisites are never touched. Technologies apply only when the
  // course has none; nothing is invented (null stays null).
  const fields = pendingFillFields(course, source);
  if (!fields.length) return fields;
  const enrichment = source.enrichment;
  if (fields.includes('imageUrl')) course.imageUrl = enrichment!.imageUrl;
  if (fields.includes('durationMinutes'))
    course.durationMinutes = enrichment!.durationMinutes;
  if (fields.includes('level')) course.level = enrichment!.level;
  if (fields.includes('description')) course.description = source.description;
  if (fields.includes('instructor')) course.instructor = source.instructor;
  if (fields.includes('categoryIds')) course.categories = [category];
  if (fields.includes('technologyIds')) {
    const courseTechnologies: Technology[] = [];
    for (const name of enrichment!.technologyNames)
      courseTechnologies.push(await taxonomy(manager, Technology, name));
    course.technologies = courseTechnologies;
  }
  await manager.save(Course, course);
  return fields;
}

// Read-only preview over the live database: no writes, no lock, no
// transaction. Apply re-reads everything inside its own transaction, so a
// plan can be stale by the time --apply runs.
export async function planImportContent(
  manager: EntityManager,
  courses: SourceCourse[],
  options: FillPublishOptions = {},
): Promise<{ entries: PlanEntry[] }> {
  const entries: PlanEntry[] = [];
  const publishedIds = new Set<number>();
  for (const source of courses) {
    const marker = await manager.query(
      'SELECT course_id FROM content_imports WHERE source_key = $1',
      [source.key],
    );
    if (marker.length) {
      const course = await manager.findOne(Course, {
        where: { id: marker[0].course_id as number },
        relations: courseRelations,
      });
      if (!course) {
        entries.push({
          key: source.key,
          title: source.title,
          url: source.url,
          action: 'marker-orphan',
          fillFields: [],
          publish: 'blocked',
          publishReasons: ['markerWithoutCourse'],
        });
        continue;
      }
      const fillFields =
        options.fillMissing && course.status !== CourseStatus.Archived
          ? pendingFillFields(course, source)
          : [];
      let publish: PlanEntry['publish'] = 'not-evaluated';
      let reasons: string[] = [];
      if (options.publishReady) {
        reasons = publishReasons(course, publishedIds);
        publish = reasons.length ? 'blocked' : 'would-publish';
        if (publish === 'would-publish') publishedIds.add(course.id);
      }
      entries.push({
        key: source.key,
        title: source.title,
        url: source.url,
        action: 'skip-marker',
        fillFields,
        publish,
        publishReasons: reasons,
      });
      continue;
    }
    const existing = await manager.find(Course, {
      where: { url: source.url },
      relations: courseRelations,
    });
    if (existing.length > 1) {
      entries.push({
        key: source.key,
        title: source.title,
        url: source.url,
        action: 'ambiguous',
        fillFields: [],
        publish: 'blocked',
        publishReasons: ['ambiguousUrlMatch'],
      });
      continue;
    }
    if (existing.length) {
      entries.push({
        key: source.key,
        title: source.title,
        url: source.url,
        action: 'link',
        fillFields: [],
        publish: 'not-evaluated',
        publishReasons: [],
      });
      continue;
    }
    // Hypothetical course as it would be created, evaluated with the same
    // shared catalog rules (no prerequisites can exist yet).
    const hypothetical = {
      description: source.description,
      url: source.url,
      imageUrl: source.enrichment?.imageUrl ?? null,
      durationMinutes: source.enrichment?.durationMinutes ?? null,
      instructor: source.instructor,
      level: source.enrichment?.level ?? null,
      categories: [source.category],
      technologies: source.enrichment?.technologyNames ?? [],
      prerequisites: [],
    };
    const missing = publicationBlockers(hypothetical);
    entries.push({
      key: source.key,
      title: source.title,
      url: source.url,
      action: 'create',
      fillFields: [],
      publish: options.publishReady
        ? missing.length
          ? 'blocked'
          : 'would-publish'
        : 'not-evaluated',
      publishReasons: options.publishReady ? missing : [],
    });
  }
  return { entries };
}

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
// Default behavior (no options) is unchanged: already imported courses are
// skipped, URL matches only link provenance, ambiguous URLs abort.
export async function importInitialContent(
  db: DataSource,
  courses: SourceCourse[],
  options: FillPublishOptions = {},
) {
  return db.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(1789600000)');
    const categories = new Map<string, Category>();
    for (const name of [...new Set(courses.map((c) => c.category))].sort())
      categories.set(name, await taxonomy(manager, Category, name));
    let imported = 0;
    let skipped = 0;
    const filled: FilledCourse[] = [];
    const publishCandidates: Course[] = [];
    for (const source of courses) {
      const marker = await manager.query(
        'SELECT course_id FROM content_imports WHERE source_key = $1',
        [source.key],
      );
      if (marker.length) {
        skipped++;
        // Provenance resolves the course even when its URL changed since.
        if (options.fillMissing || options.publishReady) {
          const course = await manager.findOne(Course, {
            where: { id: marker[0].course_id as number },
            relations: courseRelations,
          });
          if (course) {
            if (options.fillMissing) {
              const fields = await fillMissingFields(
                manager,
                course,
                source,
                categories.get(source.category)!,
              );
              if (fields.length) filled.push({ courseId: course.id, fields });
            }
            if (options.publishReady) publishCandidates.push(course);
          }
        }
        continue;
      }
      const existing = await manager.find(Course, {
        where: { url: source.url },
        relations: courseRelations,
      });
      if (existing.length > 1)
        throw new ConflictException(
          `Multiple existing courses for ${source.url}`,
        );
      // Curated enrichment applies on create. Already imported courses keep
      // their administrative state untouched unless --fill-missing resolves
      // them by provenance above. URL matches only link provenance.
      let course = existing[0];
      if (!course) {
        const courseTechnologies: Technology[] = [];
        for (const name of source.enrichment?.technologyNames ?? [])
          courseTechnologies.push(await taxonomy(manager, Technology, name));
        course = await manager.save(
          Course,
          manager.create(Course, {
            title: source.title,
            description: source.description,
            instructor: source.instructor,
            url: source.url,
            status: CourseStatus.Draft,
            // Format-validated on parse; correctness must be verified
            // against the official course page before publishing.
            imageUrl: source.enrichment?.imageUrl ?? null,
            durationMinutes: source.enrichment?.durationMinutes ?? null,
            level: source.enrichment?.level ?? null,
            categories: [categories.get(source.category)!],
            technologies: courseTechnologies,
            prerequisites: [],
          }),
        );
        if (options.publishReady) publishCandidates.push(course);
      }
      await manager.query(
        'INSERT INTO content_imports(source_key, course_id) VALUES ($1, $2)',
        [source.key, course.id],
      );
      if (existing.length) skipped++;
      else imported++;
    }
    // Explicit publication of file-identified drafts only. Every candidate
    // passes the shared catalog rules (assertPublishable): no direct status
    // UPDATE can bypass them. Archived courses are kept, incomplete ones
    // stay draft with their reasons. Repeated passes publish prerequisite
    // chains in dependency order.
    const published: number[] = [];
    const publishSkipped: PublishSkippedCourse[] = [];
    if (options.publishReady && publishCandidates.length) {
      const publishedIds = new Set<number>();
      const pending = [...publishCandidates];
      let progress = true;
      while (pending.length && progress) {
        progress = false;
        for (let index = pending.length - 1; index >= 0; index--) {
          const course = pending[index];
          const reasons = publishReasons(course, publishedIds);
          if (reasons.length) continue;
          const prerequisites = course.prerequisites.map((item) =>
            publishedIds.has(item.id)
              ? { ...item, status: CourseStatus.Published }
              : item,
          );
          assertPublishable({ ...course, prerequisites });
          course.status = CourseStatus.Published;
          await manager.save(Course, course);
          publishedIds.add(course.id);
          published.push(course.id);
          pending.splice(index, 1);
          progress = true;
        }
      }
      for (const course of pending)
        publishSkipped.push({
          courseId: course.id,
          reasons: publishReasons(course, publishedIds),
        });
    }
    const previous = await manager.query(
      'SELECT questionnaire_id FROM content_imports WHERE source_key = $1',
      [questionnaireKey],
    );
    if (previous.length)
      return {
        imported,
        skipped,
        filled,
        published,
        publishSkipped,
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
      filled,
      published,
      publishSkipped,
      questionnaireId: questionnaire.id,
      questionnaireCreated: true,
    };
  });
}
