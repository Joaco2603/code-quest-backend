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
import { Auth } from '../../auth/decorators/index.js';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../../auth/guards/two-factor.guard.js';
import { ValidRoles } from '../../auth/interfaces/index.js';
import { UpdateAnswerOptionDto } from '../dtos/index.js';
import { QuestionsService } from '../questions.service.js';

@Auth(ValidRoles.admin)
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Code Quest Used Endpoints', 'Answer options')
@ApiBearerAuth('access-token')
@Controller('answer-options')
export class AnswerOptionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update an answer option' })
  @ApiOkResponse({ description: 'Updated option.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnswerOptionDto,
  ) {
    return this.questionsService.updateOption(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Hard-delete an answer option' })
  @ApiOkResponse({ description: 'Option deleted.' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.questionsService.deleteOption(id);
  }
}
