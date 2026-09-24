import { Test, TestingModule } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { vi, type Mocked } from 'vitest';
import { QuestionnairesController } from '../controllers/questionnaires.controller.js';
import { QuestionsService } from '../questions.service.js';
import { QuestionType } from '../enums/question-type.enum.js';

describe('QuestionnairesController', () => {
  let controller: QuestionnairesController;
  let questionsService: Mocked<QuestionsService>;

  const mockQuestionsService = {
    createQuestionnaire: vi.fn(),
    listQuestionnaires: vi.fn(),
    listActiveQuestionnaires: vi.fn(),
    getActiveQuestionnaire: vi.fn(),
    getQuestionnaireForAdmin: vi.fn(),
    updateQuestionnaire: vi.fn(),
    deactivateQuestionnaire: vi.fn(),
    createQuestion: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [QuestionnairesController],
      providers: [
        { provide: QuestionsService, useValue: mockQuestionsService },
      ],
    }).compile();

    controller = module.get(QuestionnairesController);
    questionsService = module.get(QuestionsService);
    vi.clearAllMocks();
  });

  it('creates a questionnaire wrapped once in data', async () => {
    mockQuestionsService.createQuestionnaire.mockResolvedValue({ id: 1 });
    const result = await controller.create({ title: 'Skills' });
    expect(questionsService.createQuestionnaire).toHaveBeenCalledWith({
      title: 'Skills',
    });
    expect(result).toEqual({ data: { id: 1 } });
  });

  it('lists admin questionnaires then active student routes', async () => {
    mockQuestionsService.listQuestionnaires.mockResolvedValue({
      items: [{ id: 1 }],
      total: 1,
      limit: 10,
      offset: 0,
    });
    mockQuestionsService.listActiveQuestionnaires.mockResolvedValue([
      { id: 1 },
    ]);
    mockQuestionsService.getActiveQuestionnaire.mockResolvedValue({
      id: 1,
      questions: [],
    });
    mockQuestionsService.getQuestionnaireForAdmin.mockResolvedValue({ id: 1 });

    const paginated = await controller.findAll({ offset: 0, limit: 10 });
    expect(paginated).toEqual({
      data: [{ id: 1 }],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const active = await controller.findActive();
    expect(active).toEqual({ data: [{ id: 1 }] });
    await controller.findActiveById(1);
    await controller.findOne(1);

    expect(questionsService.listQuestionnaires).toHaveBeenCalled();
    expect(questionsService.listActiveQuestionnaires).toHaveBeenCalled();
    expect(questionsService.getActiveQuestionnaire).toHaveBeenCalledWith(1);
    expect(questionsService.getQuestionnaireForAdmin).toHaveBeenCalledWith(1);
  });

  it('adds a question to a questionnaire wrapped once in data', async () => {
    mockQuestionsService.createQuestion.mockResolvedValue({ id: 10 });
    const result = await controller.addQuestion(1, {
      question: 'Pick one',
      type: QuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    });
    expect(questionsService.createQuestion).toHaveBeenCalledWith(1, {
      question: 'Pick one',
      type: QuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    });
    expect(result).toEqual({ data: { id: 10 } });
  });
});
