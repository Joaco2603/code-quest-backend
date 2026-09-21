import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorators.js';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { CatalogAdminGuard } from '../catalog/catalog-access.js';
import { CatalogIdPipe } from '../catalog/catalog-id.pipe.js';
import {
  toDataResponse,
  toPaginatedResponse,
} from '../common/dto/api-response.dto.js';
import { AssessmentsService } from './assessments.service.js';
import {
  AssessmentQueryDto,
  EvaluationDefinitionDto,
  SubmitAssessmentDto,
} from './dto.js';
import {
  AssessmentDataDto,
  AssessmentListDto,
  EvaluationConfigDataDto,
  EvaluationFormDataDto,
} from './response.dto.js';

@ApiTags('Assessments')
@ApiBearerAuth('access-token')
@Auth()
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}
  @Post()
  @ApiOperation({
    summary: 'Submit a complete self-assessment for the authenticated user',
  })
  @ApiCreatedResponse({ type: AssessmentDataDto })
  async submit(@GetUser() user: AuthUser, @Body() dto: SubmitAssessmentDto) {
    return toDataResponse(await this.assessments.submit(user.id, dto));
  }
  @Get()
  @ApiOkResponse({ type: AssessmentListDto })
  async list(@GetUser() user: AuthUser, @Query() query: AssessmentQueryDto) {
    const { items, ...meta } = await this.assessments.list(user.id, query);
    return toPaginatedResponse(items, meta);
  }
  @Get(':id')
  @ApiOkResponse({ type: AssessmentDataDto })
  async get(@GetUser() user: AuthUser, @Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.assessments.get(user.id, id));
  }
}

@ApiTags('Questionnaire evaluation')
@ApiBearerAuth('access-token')
@Controller('questionnaires/:id/evaluation')
export class EvaluationController {
  constructor(private readonly assessments: AssessmentsService) {}
  @Put()
  @UseGuards(CatalogAdminGuard)
  @ApiOperation({
    summary:
      'Replace evaluation rules and increment their version (administrator)',
  })
  @ApiOkResponse({ type: EvaluationConfigDataDto })
  async configure(
    @Param('id', CatalogIdPipe) id: number,
    @Body() dto: EvaluationDefinitionDto,
  ) {
    return toDataResponse(await this.assessments.configure(id, dto));
  }
  @Get()
  @Auth()
  @ApiOperation({
    summary:
      'Get the current questionnaire, answer constraints, self-assessment mappings and revision',
  })
  @ApiOkResponse({ type: EvaluationFormDataDto })
  async form(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.assessments.getForm(id));
  }
}
