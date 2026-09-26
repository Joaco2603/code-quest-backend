import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../../auth/decorators/index.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../../../auth/guards/two-factor.guard.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import { toDataResponse } from '../../../common/dto/api-response.dto.js';
import { UpdateAnswerOptionDto } from '../dtos/index.js';
import {
  AnswerOptionDataResponseDto,
  AnswerOptionDeleteDataResponseDto,
} from '../dtos/questionnaire-response.dto.js';
import { QuestionsService } from '../questions.service.js';

@Auth(ValidRoles.admin)
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Answer options')
@ApiBearerAuth('access-token')
@Controller('answer-options')
export class AnswerOptionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update an answer option' })
  @ApiOkResponse({
    description: 'Updated option.',
    type: AnswerOptionDataResponseDto,
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnswerOptionDto,
  ) {
    return toDataResponse(await this.questionsService.updateOption(id, dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hard-delete an answer option' })
  @ApiOkResponse({
    description: 'Option deleted.',
    type: AnswerOptionDeleteDataResponseDto,
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return toDataResponse(await this.questionsService.deleteOption(id));
  }
}
