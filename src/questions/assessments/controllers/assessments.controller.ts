import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, GetUser } from '../../../auth/decorators/index.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../../../auth/guards/two-factor.guard.js';
import { ValidRoles } from '../../../auth/interfaces/index.js';
import type { AuthUser } from '../../../auth/interfaces/auth-user.type.js';
import { AssessmentsService } from '../assessments.service.js';
import { CreateAssessmentDto, UpsertAnswerDto } from '../dtos/index.js';

@Auth()
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Code Quest Used Endpoints', 'Assessments')
@ApiBearerAuth('access-token')
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'Start assessment',
    description:
      'Starts a questionnaire attempt for the current student. Rejects a second incomplete assessment for the same questionnaire.',
  })
  @ApiCreatedResponse({
    description: 'Assessment created.',
    schema: {
      example: {
        id: 1,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        questionnaireId: 4,
        createdAt: '2026-09-17T08:00:00.000Z',
        completedAt: null,
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Questionnaire was not found or is inactive.',
  })
  @ApiConflictResponse({
    description:
      'An incomplete assessment already exists for this questionnaire.',
  })
  start(@GetUser() user: AuthUser, @Body() dto: CreateAssessmentDto) {
    return this.assessmentsService.start(user, dto);
  }

  @Get()
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'List my assessments',
    description: 'Returns questionnaire attempts owned by the current student.',
  })
  @ApiOkResponse({
    description: 'Assessment list.',
    schema: {
      example: [
        {
          id: 1,
          userId: '43566ec8-22af-41d3-933a-918b536fe99f',
          questionnaireId: 4,
          createdAt: '2026-09-17T08:00:00.000Z',
          completedAt: null,
        },
      ],
    },
  })
  listMine(@GetUser() user: AuthUser) {
    return this.assessmentsService.listMine(user);
  }

  @Get(':id')
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'Get my assessment',
    description: 'Returns one owned assessment including stored answers.',
  })
  @ApiOkResponse({
    description: 'Assessment with answers.',
    schema: {
      example: {
        id: 1,
        userId: '43566ec8-22af-41d3-933a-918b536fe99f',
        questionnaireId: 4,
        createdAt: '2026-09-17T08:00:00.000Z',
        completedAt: null,
        answers: [
          {
            id: 10,
            questionId: 3,
            answerOptionId: 7,
            value: null,
          },
        ],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Assessment was not found.' })
  findMine(@GetUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.assessmentsService.findMine(user, id);
  }

  @Put(':id/answers')
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'Upsert question answer',
    description:
      'Upsert (update + insert): creates the answer for a question, or replaces it if one already exists. Multiple-choice stores one row per selected option.',
  })
  @ApiOkResponse({ description: 'Assessment with updated answers.' })
  @ApiNotFoundResponse({ description: 'Assessment was not found.' })
  @ApiConflictResponse({ description: 'Assessment is already completed.' })
  upsertAnswer(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertAnswerDto,
  ) {
    return this.assessmentsService.upsertAnswer(user, id, dto);
  }

  @Post(':id/complete')
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'Complete assessment',
    description:
      'Marks the attempt complete when every active question has a valid answer.',
  })
  @ApiOkResponse({ description: 'Assessment completed.' })
  @ApiNotFoundResponse({ description: 'Assessment was not found.' })
  @ApiConflictResponse({ description: 'Assessment is already completed.' })
  complete(@GetUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.assessmentsService.complete(user, id);
  }
}
