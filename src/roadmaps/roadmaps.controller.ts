import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator.js';
import { GetUser } from '../auth/decorators/get-user.decorators.js';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { CatalogIdPipe } from '../catalog/catalog-id.pipe.js';
import { toDataResponse } from '../common/dto/api-response.dto.js';
import { GenerateRoadmapDto } from './dto/generate-roadmap.dto.js';
import { RoadmapDataDto, RoadmapListDataDto } from './dto/index.js';
import { RoadmapsService } from './roadmaps.service.js';

@ApiTags('Roadmaps')
@ApiBearerAuth('access-token')
@Auth()
@Controller('roadmaps')
export class RoadmapsController {
  constructor(private readonly roadmaps: RoadmapsService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate and save a roadmap from an owned assessment',
  })
  @ApiCreatedResponse({ type: RoadmapDataDto })
  @ApiConflictResponse({
    description: 'The profile is incomplete or no published course matches it.',
  })
  async generate(@GetUser() user: AuthUser, @Body() dto: GenerateRoadmapDto) {
    return toDataResponse(
      await this.roadmaps.generate(user.id, dto.assessmentId),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List roadmaps owned by the current user' })
  @ApiOkResponse({ type: RoadmapListDataDto })
  async findAll(@GetUser() user: AuthUser) {
    return toDataResponse(await this.roadmaps.findAll(user.id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one roadmap owned by the current user' })
  @ApiOkResponse({ type: RoadmapDataDto })
  @ApiNotFoundResponse({ description: 'Roadmap was not found.' })
  async findOne(
    @GetUser() user: AuthUser,
    @Param('id', CatalogIdPipe) id: number,
  ) {
    return toDataResponse(await this.roadmaps.findOne(user.id, id));
  }
}
