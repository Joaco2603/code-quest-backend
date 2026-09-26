import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../auth/decorators/index.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../../../auth/guards/two-factor.guard.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import { toDataResponse } from '../../../common/dto/api-response.dto.js';
import {
  CreateAnswerOptionDto,
  UpdateQuestionDto,
} from '../dtos/index.js';
import {
  QuestionDataResponseDto,
  QuestionDeactivationDataResponseDto,
} from '../dtos/questionnaire-response.dto.js';
import { QuestionsService } from '../questions.service.js';

@Auth(ValidRoles.admin)
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Questions')
@ApiBearerAuth('access-token')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update a question' })
  @ApiOkResponse({
    description: 'Updated question.',
    type: QuestionDataResponseDto,
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
  ) {
    return toDataResponse(await this.questionsService.updateQuestion(id, dto));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate a question',
    description: 'Soft-deletes by setting is_active=false.',
  })
  @ApiOkResponse({
    description: 'Question deactivated.',
    type: QuestionDeactivationDataResponseDto,
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return toDataResponse(
      await this.questionsService.deactivateQuestion(id),
    );
  }

  @Post(':id/options')
  @ApiOperation({ summary: 'Add an answer option to a question' })
  @ApiCreatedResponse({
    description: 'Option added.',
    type: QuestionDataResponseDto,
  })
  async addOption(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAnswerOptionDto,
  ) {
    return toDataResponse(await this.questionsService.createOption(id, dto));
  }
}
