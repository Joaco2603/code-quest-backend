import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, GetUser } from '../auth/decorators/index.js';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { ValidRoles } from '../auth/interfaces/valid-roles.type.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../auth/guards/two-factor.guard.js';
import {
  CreateRoadmapDto,
  GenerateRoadmapDto,
  UpdateRoadmapDto,
  UpdateRoadmapProgressDto,
} from './dtos/index.js';
import { RoadmapGenerationService } from './roadmap-generation.service.js';
import { RoadmapsService } from './roadmaps.service.js';

@Auth()
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Roadmaps', 'Code Quest Used Endpoints')
@ApiBearerAuth('access-token')
@Controller('roadmaps')
export class RoadmapsController {
  constructor(
    private readonly roadmapsService: RoadmapsService,
    private readonly generation: RoadmapGenerationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a learning roadmap for the current user' })
  @ApiCreatedResponse({ description: 'Roadmap created.' })
  create(@GetUser() user: AuthUser, @Body() dto: CreateRoadmapDto) {
    return this.roadmapsService.create(user, dto);
  }

  @Post('generate')
  @Auth(ValidRoles.user)
  @ApiOperation({
    summary: 'Generate a personal roadmap from a completed questionnaire',
    description:
      'Reads the personal questionnaire (goal, area, level, known technologies, and the build or country follow-up). Always stores scope personal, with progress 0 on each course. A second call returns the roadmap already created for that attempt.',
  })
  @ApiCreatedResponse({ description: 'Personal roadmap generated or reused.' })
  @ApiServiceUnavailableResponse({
    description: 'OPENAI_API_KEY is not configured.',
  })
  generate(@GetUser() user: AuthUser, @Body() dto: GenerateRoadmapDto) {
    return this.generation.generate(user, dto.assessmentId);
  }

  @Get()
  @ApiOperation({
    summary: 'List roadmaps visible to the current user',
    description:
      'Students receive their personal roadmaps and every global roadmap. Admins receive global roadmaps.',
  })
  @ApiOkResponse({
    description: 'Personal plus global roadmaps, or global roadmaps for admins.',
  })
  findAll(@GetUser() user: AuthUser) {
    return this.roadmapsService.findAll(user);
  }

  @Post(':id/copies')
  @ApiOperation({
    summary: 'Save a global roadmap into the current student list',
    description:
      'Students get a personal copy with progress at 0. Repeating the call returns that copy. Admins receive 403.',
  })
  @ApiCreatedResponse({ description: 'Personal copy of the global roadmap.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  copy(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.roadmapsService.copyToPersonal(user, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one readable roadmap',
    description:
      'Admins read global roadmaps. Students read their personal roadmaps and any global roadmap.',
  })
  @ApiOkResponse({ description: 'Hydrated roadmap.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  findOne(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.roadmapsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update title and/or replace the course list' })
  @ApiOkResponse({ description: 'Updated roadmap.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  update(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoadmapDto,
  ) {
    return this.roadmapsService.update(user, id, dto);
  }

  @Patch(':id/courses/:courseId/progress')
  @ApiOperation({ summary: 'Set progress for a course on this roadmap' })
  @ApiOkResponse({ description: 'Updated progress.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  updateProgress(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: UpdateRoadmapProgressDto,
  ) {
    return this.roadmapsService.updateProgress(
      user,
      id,
      courseId,
      dto.progress,
    );
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an owned roadmap' })
  @ApiOkResponse({ description: 'Roadmap deleted.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  async remove(
    @GetUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.roadmapsService.remove(user, id);
    return { message: 'Roadmap removed successfully' };
  }
}
