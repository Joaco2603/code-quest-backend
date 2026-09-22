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
  CreateQuestionDto,
  CreateQuestionnaireDto,
  UpdateQuestionnaireDto,
} from '../dtos/index.js';
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
  @ApiCreatedResponse({ description: 'Questionnaire created.' })
  create(@Body() dto: CreateQuestionnaireDto) {
    return this.questionsService.createQuestionnaire(dto);
  }

  @Get()
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'List questionnaires (admin)' })
  @ApiOkResponse({ description: 'Paginated questionnaires.' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.questionsService.listQuestionnaires(paginationDto);
  }

  @Get('active')
  @ApiOperation({ summary: 'List active questionnaires' })
  @ApiOkResponse({ description: 'Active questionnaires only.' })
  findActive() {
    return this.questionsService.listActiveQuestionnaires();
  }

  @Get('active/:id')
  @ApiOperation({ summary: 'Get an active questionnaire with active questions' })
  @ApiOkResponse({ description: 'Active questionnaire snapshot.' })
  @ApiNotFoundResponse({ description: 'Questionnaire missing or inactive.' })
  findActiveById(@Param('id', ParseIntPipe) id: number) {
    return this.questionsService.getActiveQuestionnaire(id);
  }

  @Get(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Get questionnaire for admin (includes inactive)' })
  @ApiOkResponse({ description: 'Questionnaire detail.' })
  @ApiNotFoundResponse({ description: 'Questionnaire was not found.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.questionsService.getQuestionnaireForAdmin(id);
  }

  @Patch(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Update a questionnaire' })
  @ApiOkResponse({ description: 'Updated questionnaire.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionnaireDto,
  ) {
    return this.questionsService.updateQuestionnaire(id, dto);
  }

  @Delete(':id')
  @Auth(ValidRoles.admin)
  @ApiOperation({
    summary: 'Deactivate a questionnaire',
    description:
      'Soft-deletes by setting is_active=false so later answers stay referencable.',
  })
  @ApiOkResponse({ description: 'Questionnaire deactivated.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.questionsService.deactivateQuestionnaire(id);
  }

  @Post(':id/questions')
  @Auth(ValidRoles.admin)
  @ApiOperation({ summary: 'Add a question to a questionnaire' })
  @ApiCreatedResponse({ description: 'Question created.' })
  addQuestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.questionsService.createQuestion(id, dto);
  }
}
