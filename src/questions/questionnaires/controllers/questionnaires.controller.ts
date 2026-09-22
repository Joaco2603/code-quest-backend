import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../auth/decorators/index.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../../../auth/guards/two-factor.guard.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';
import {
  toDataResponse,
  toPaginatedResponse,
} from '../../../common/dto/api-response.dto.js';
import {
  CreateQuestionDto,
  CreateQuestionnaireDto,
  UpdateQuestionnaireDto,
} from '../dtos/index.js';
import {
  QuestionDataResponseDto,
  QuestionnaireCollectionDataResponseDto,
  QuestionnaireDataResponseDto,
  QuestionnaireDeactivationDataResponseDto,
  QuestionnairePaginatedResponseDto,
} from '../dtos/questionnaire-response.dto.js';
import { QuestionsService } from '../questions.service.js';

@Auth()
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Code Quest Used Endpoints', 'Questionnaires')
@ApiBearerAuth('access-token')
@Controller('questionnaires')
export class QuestionnairesController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Create a questionnaire' })
  @ApiCreatedResponse({
    description: 'Questionnaire created.',
    type: QuestionnaireDataResponseDto,
  })
  async create(@Body() dto: CreateQuestionnaireDto) {
    return toDataResponse(
      await this.questionsService.createQuestionnaire(dto),
    );
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'List questionnaires (admin)' })
  @ApiOkResponse({
    description: 'Paginated questionnaires.',
    type: QuestionnairePaginatedResponseDto,
  })
  async findAll(@Query() paginationDto: PaginationDto) {
    const { items, total, limit, offset } =
      await this.questionsService.listQuestionnaires(paginationDto);
    return toPaginatedResponse(items, { total, limit, offset });
  }

  @Get('active')
  @ApiOperation({ summary: 'List active questionnaires' })
  @ApiOkResponse({
    description: 'Active questionnaires only.',
    type: QuestionnaireCollectionDataResponseDto,
  })
  async findActive() {
    return toDataResponse(
      await this.questionsService.listActiveQuestionnaires(),
    );
  }

  @Get('active/:id')
  @ApiOperation({ summary: 'Get an active questionnaire with active questions' })
  @ApiOkResponse({
    description: 'Active questionnaire snapshot.',
    type: QuestionnaireDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Questionnaire missing or inactive.' })
  async findActiveById(@Param('id', ParseIntPipe) id: number) {
    return toDataResponse(
      await this.questionsService.getActiveQuestionnaire(id),
    );
  }

  @Get(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Get questionnaire for admin (includes inactive)' })
  @ApiOkResponse({
    description: 'Questionnaire detail.',
    type: QuestionnaireDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Questionnaire was not found.' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return toDataResponse(
      await this.questionsService.getQuestionnaireForAdmin(id),
    );
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Update a questionnaire' })
  @ApiOkResponse({
    description: 'Updated questionnaire.',
    type: QuestionnaireDataResponseDto,
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionnaireDto,
  ) {
    return toDataResponse(
      await this.questionsService.updateQuestionnaire(id, dto),
    );
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({
    summary: 'Deactivate a questionnaire',
    description:
      'Soft-deletes by setting is_active=false so later answers stay referencable.',
  })
  @ApiOkResponse({
    description: 'Questionnaire deactivated.',
    type: QuestionnaireDeactivationDataResponseDto,
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return toDataResponse(
      await this.questionsService.deactivateQuestionnaire(id),
    );
  }

  @Post(':id/questions')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Add a question to a questionnaire' })
  @ApiCreatedResponse({
    description: 'Question created.',
    type: QuestionDataResponseDto,
  })
  async addQuestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuestionDto,
  ) {
    return toDataResponse(await this.questionsService.createQuestion(id, dto));
  }
}
