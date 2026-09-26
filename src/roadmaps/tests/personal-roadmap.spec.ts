import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AuthUser } from '../../auth/interfaces/auth-user.type.js';
import { ValidRoles } from '../../auth/interfaces/valid-roles.type.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import type { CourseResponseDto } from '../../catalog/dto/course-response.dto.js';
import { SkillLevel } from '../../catalog/entities/skill-level.enum.js';
import { Assessment } from '../../questions/assessments/entities/assessment.entity.js';
import { UserAnswer } from '../../questions/assessments/entities/user-answer.entity.js';
import type { QuestionResponseDto } from '../../questions/questionnaires/dtos/questionnaire-response.dto.js';
import { QuestionType } from '../../questions/questionnaires/enums/question-type.enum.js';
import { QuestionsService } from '../../questions/questionnaires/questions.service.js';
import { RoadmapCourse } from '../entities/roadmap-course.entity.js';
import { RoadmapScope } from '../entities/roadmap-scope.enum.js';
import { Roadmap } from '../entities/roadmap.entity.js';
import { OpenAiRoadmapClient } from '../openai-roadmap.client.js';
import { planPersonalRoadmap } from '../plan-personal-roadmap.js';
import { readPersonalProfile } from '../personal-profile.js';
import { RoadmapGenerationService } from '../roadmap-generation.service.js';
import { RoadmapsService } from '../roadmaps.service.js';
import { selectPersonalCandidates } from '../select-personal-candidates.js';

const user: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  is_two_factor_enabled: false,
  is_two_factor_validated: true,
  role: ValidRoles.user,
};

function choice(
  id: number,
  question: string,
  options: Array<[number, string, string]>,
  rules: QuestionResponseDto['rules'] = { required: true },
  type = QuestionType.SINGLE_CHOICE,
): QuestionResponseDto {
  return {
    id,
    question,
    type,
    isActive: true,
    sortOrder: id,
    rules,
    options: options.map(([optionId, label, value], index) => ({
      id: optionId,
      label,
      value,
      sortOrder: index,
    })),
  };
}

function personalQuestions(): QuestionResponseDto[] {
  const goal = choice(1, '¿Para qué quieres aprender a programar?', [
    [11, 'Aprender por interés', 'interest'],
    [12, 'Construir algo', 'build'],
    [13, 'Conseguir trabajo', 'job'],
    [14, 'Mejorar en mi área', 'improve'],
  ]);
  return [
    goal,
    {
      id: 2,
      question: '¿Qué quieres construir?',
      type: QuestionType.TEXT,
      isActive: true,
      sortOrder: 2,
      rules: {
        required: true,
        showWhen: { questionId: 1, answerOptionId: 12 },
      },
      options: [],
    },
    {
      id: 3,
      question: '¿De qué país eres?',
      type: QuestionType.TEXT,
      isActive: true,
      sortOrder: 3,
      rules: {
        required: true,
        showWhen: { questionId: 1, answerOptionId: 13 },
      },
      options: [],
    },
    choice(4, '¿Qué área te interesa más?', [
      [41, 'Frontend', 'frontend'],
      [42, 'Full stack', 'fullstack'],
    ]),
    choice(5, '¿Qué nivel considerás que tenés actualmente?', [
      [51, 'Principiante', 'beginner'],
      [52, 'Avanzado', 'advanced'],
    ]),
    choice(
      6,
      '¿Qué tecnologías conocés?',
      [[61, 'React', 'react']],
      { required: false, maxSelections: 12 },
      QuestionType.MULTIPLE_CHOICE,
    ),
    choice(
      7,
      '¿Qué nivel tenés en React?',
      [
        [71, 'Nunca usé', 'never'],
        [72, 'Básico', 'basic'],
        [73, 'Puedo hacer proyectos', 'projects'],
        [74, 'Trabajo con ello', 'professional'],
      ],
      {
        required: true,
        showWhen: { questionId: 6, answerOptionId: 61 },
      },
    ),
  ];
}

function course(
  id: number,
  title: string,
  technology: string,
  prerequisiteIds: number[] = [],
): CourseResponseDto {
  return {
    id,
    title,
    description: null,
    url: null,
    imageUrl: null,
    durationMinutes: null,
    instructor: null,
    level: SkillLevel.Beginner,
    status: 'published',
    createdAt: '',
    updatedAt: '',
    categories: [],
    technologies: [{ id, name: technology }],
    prerequisiteIds,
  } as CourseResponseDto;
}

describe('personal roadmap profile', () => {
  const questions = personalQuestions();

  it('keeps the project and country follow-ups on the matching goal', () => {
    const build = readPersonalProfile(questions, [
      { questionId: 1, answerOptionId: 12, value: null },
      { questionId: 2, answerOptionId: null, value: 'quiero hacer un blog' },
      { questionId: 3, answerOptionId: null, value: 'México' },
      { questionId: 4, answerOptionId: 41, value: null },
      { questionId: 5, answerOptionId: 51, value: null },
      { questionId: 6, answerOptionId: 61, value: null },
      { questionId: 7, answerOptionId: 73, value: null },
    ]);
    expect(build).toMatchObject({
      goal: 'build',
      area: 'frontend',
      level: 'beginner',
      buildTarget: 'quiero hacer un blog',
      country: null,
      skills: [{ name: 'React', level: 'projects' }],
    });

    const job = readPersonalProfile(questions, [
      { questionId: 1, answerOptionId: 13, value: null },
      { questionId: 3, answerOptionId: null, value: 'Argentina' },
      { questionId: 4, answerOptionId: 42, value: null },
    ]);
    expect(job).toMatchObject({
      goal: 'job',
      area: 'fullstack',
      country: 'Argentina',
      buildTarget: null,
    });
  });

  it('ignores a questionnaire that is not the personal path', () => {
    expect(
      readPersonalProfile(
        [
          choice(1, '¿Qué querés lograr?', [
            [1, 'Conseguir trabajo', 'job'],
            [2, 'Crear un proyecto', 'project'],
          ]),
        ],
        [{ questionId: 1, answerOptionId: 1, value: null }],
      ),
    ).toBeNull();
  });
});

describe('selectPersonalCandidates', () => {
  it('prefers courses in the chosen area and keeps prerequisites', () => {
    const html = course(1, 'HTML', 'HTML');
    const react = course(2, 'React', 'React', [1]);
    const docker = course(3, 'Docker', 'Docker');
    const chosen = selectPersonalCandidates([docker, react, html], {
      goal: 'build',
      area: 'frontend',
      level: 'beginner',
      buildTarget: 'un blog',
      country: null,
      skills: [],
    });
    expect(chosen.map((item) => item.id)).toEqual([1, 2]);
  });
});

describe('planPersonalRoadmap', () => {
  const profile = {
    goal: 'build' as const,
    area: 'frontend' as const,
    level: 'beginner' as const,
    buildTarget: 'un blog',
    country: null,
    skills: [],
  };
  const candidates = [course(1, 'HTML', 'HTML'), course(2, 'React', 'React', [1])];

  it('asks again when the first plan skips a prerequisite', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          title: 'Blog',
          rationale: 'Primero React.',
          courseIds: [2],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          title: 'Blog',
          rationale: 'HTML y luego React.',
          courseIds: [1, 2],
        }),
      );
    const plan = await planPersonalRoadmap(profile, candidates, complete);
    expect(plan.courseIds).toEqual([1, 2]);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(String(complete.mock.calls[1][1])).toContain('missing prerequisites');
  });
});

describe('RoadmapGenerationService', () => {
  const roadmaps = { findOne: vi.fn() };
  const assessments = { findOne: vi.fn() };
  const answers = { find: vi.fn() };
  const questions = { getQuestionnaireForAdmin: vi.fn() };
  const catalog = {
    getPublishedCatalog: vi.fn(),
    validateRoadmapSelection: vi.fn(async (ids: number[]) =>
      ids.map((id) => course(id, `Course ${id}`, 'React')),
    ),
  };
  const roadmapsService = { findOne: vi.fn() };
  const llm = { complete: vi.fn() };
  const manager = {
    query: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => data),
    save: vi.fn(async (value: unknown) => {
      if (Array.isArray(value)) return value;
      const row = value as Record<string, unknown>;
      return { ...row, id: 9 };
    }),
  };
  const dataSource = {
    transaction: vi.fn(async (work: (item: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };

  let service: RoadmapGenerationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapGenerationService,
        { provide: getRepositoryToken(Roadmap), useValue: roadmaps },
        { provide: getRepositoryToken(Assessment), useValue: assessments },
        { provide: getRepositoryToken(UserAnswer), useValue: answers },
        { provide: QuestionsService, useValue: questions },
        { provide: CatalogService, useValue: catalog },
        { provide: RoadmapsService, useValue: roadmapsService },
        { provide: DataSource, useValue: dataSource },
        { provide: OpenAiRoadmapClient, useValue: llm },
      ],
    }).compile();
    service = module.get(RoadmapGenerationService);
  });

  it('refuses an incomplete attempt', async () => {
    roadmaps.findOne.mockResolvedValue(null);
    assessments.findOne.mockResolvedValue({
      id: 4,
      userId: user.id,
      completedAt: null,
    });
    await expect(service.generate(user, 4)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('stores a personal roadmap with course progress at zero', async () => {
    roadmaps.findOne.mockResolvedValue(null);
    assessments.findOne.mockResolvedValue({
      id: 4,
      userId: user.id,
      questionnaireId: 8,
      completedAt: new Date(),
    });
    questions.getQuestionnaireForAdmin.mockResolvedValue({
      questions: personalQuestions(),
    });
    answers.find.mockResolvedValue([
      { questionId: 1, answerOptionId: 12, value: null },
      { questionId: 2, answerOptionId: null, value: 'un blog' },
      { questionId: 4, answerOptionId: 41, value: null },
      { questionId: 5, answerOptionId: 51, value: null },
    ]);
    catalog.getPublishedCatalog.mockResolvedValue([course(1, 'HTML', 'HTML')]);
    llm.complete.mockResolvedValue({
      content: JSON.stringify({
        title: 'Tu blog',
        rationale: 'Empieza por HTML.',
        courseIds: [1],
      }),
      model: 'gpt-4.1-mini',
    });
    manager.findOne.mockResolvedValue(null);
    roadmapsService.findOne.mockResolvedValue({ id: 9, scope: 'personal' });

    const result = await service.generate(user, 4);

    expect(result).toEqual({ id: 9, scope: 'personal' });
    expect(manager.create).toHaveBeenCalledWith(
      Roadmap,
      expect.objectContaining({
        scope: RoadmapScope.Personal,
        assessmentId: 4,
        userId: user.id,
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      RoadmapCourse,
      expect.objectContaining({ courseId: 1, progress: 0, sortOrder: 0 }),
    );
  });
});
