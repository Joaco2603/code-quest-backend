import { RoadmapDataDto } from './dto/index.js';
import { RoadmapGenerationService } from './roadmap-generation.service.js';
import { GenerateRoadmapDto } from './dto/generate-roadmap.dto.js';
import { toDataResponse } from '../common/dto/api-response.dto.js';
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth, GetUser } from '../auth/decorators/index.js';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../auth/guards/two-factor.guard.js';
import {
  CreateRoadmapDto,
  UpdateRoadmapDto,
  UpdateRoadmapProgressDto,
} from './dtos/index.js';
import { RoadmapsService } from './roadmaps.service.js';

@Auth()
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Roadmaps')
@ApiBearerAuth('access-token')
@Controller('roadmaps')
export class RoadmapsController {
  constructor(
    private readonly roadmapsService: RoadmapsService,
    private readonly generation: RoadmapGenerationService,
  ) {}

  @Post('generate')
  @ApiCreatedResponse({ type: RoadmapDataDto })
  @ApiOperation({ summary: 'Generate a roadmap from an owned self-assessment' })
  async generate(@GetUser() user: AuthUser, @Body() dto: GenerateRoadmapDto) {
    return toDataResponse(
      await this.generation.generate(user.id, dto.assessmentId),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a learning roadmap for the current user' })
  @ApiCreatedResponse({ description: 'Roadmap created.' })
  create(@GetUser() user: AuthUser, @Body() dto: CreateRoadmapDto) {
    return this.roadmapsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user roadmaps' })
  @ApiOkResponse({ description: 'Roadmaps owned by the current user.' })
  findAll(@GetUser() user: AuthUser) {
    return this.roadmapsService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one owned roadmap' })
  @ApiOkResponse({ description: 'Hydrated roadmap.' })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  findOne(@GetUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.roadmapsService.findOne(user.id, id);
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
    return this.roadmapsService.update(user.id, id, dto);
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
      user.id,
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
    await this.roadmapsService.remove(user.id, id);
    return { message: 'Roadmap removed successfully' };
  }
}
