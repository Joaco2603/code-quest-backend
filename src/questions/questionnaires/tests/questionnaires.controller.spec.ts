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

  it('creates a questionnaire', async () => {
    mockQuestionsService.createQuestionnaire.mockResolvedValue({ id: 1 });
    await controller.create({ title: 'Skills' });
    expect(questionsService.createQuestionnaire).toHaveBeenCalledWith({
      title: 'Skills',
    });
  });

  it('lists admin questionnaires then active student routes', async () => {
    mockQuestionsService.listQuestionnaires.mockResolvedValue({ items: [] });
    mockQuestionsService.listActiveQuestionnaires.mockResolvedValue([]);
    mockQuestionsService.getActiveQuestionnaire.mockResolvedValue({ id: 1 });
    mockQuestionsService.getQuestionnaireForAdmin.mockResolvedValue({ id: 1 });

    await controller.findAll({ offset: 0, limit: 10 });
    await controller.findActive();
    await controller.findActiveById(1);
    await controller.findOne(1);

    expect(questionsService.listQuestionnaires).toHaveBeenCalled();
    expect(questionsService.listActiveQuestionnaires).toHaveBeenCalled();
    expect(questionsService.getActiveQuestionnaire).toHaveBeenCalledWith(1);
    expect(questionsService.getQuestionnaireForAdmin).toHaveBeenCalledWith(1);
  });

  it('adds a question to a questionnaire', async () => {
    mockQuestionsService.createQuestion.mockResolvedValue({ id: 10 });
    await controller.addQuestion(1, {
      question: 'Pick one',
      type: QuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    });
    expect(questionsService.createQuestion).toHaveBeenCalledWith(1, {
      question: 'Pick one',
      type: QuestionType.SINGLE_CHOICE,
      sortOrder: 0,
    });
  });
});
