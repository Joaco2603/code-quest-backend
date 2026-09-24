import { AssessmentsModule } from '../assessments/assessments.module.js';
import { RoadmapGenerationService } from './roadmap-generation.service.js';
import { OpenAiRoadmapClient } from './openai-roadmap.client.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { CatalogModule } from '../catalog/catalog.module.js';
import { RoadmapCourse } from './entities/roadmap-course.entity.js';
import { Roadmap } from './entities/roadmap.entity.js';
import { RoadmapsController } from './roadmaps.controller.js';
import { RoadmapsService } from './roadmaps.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Roadmap, RoadmapCourse]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    CatalogModule,
    AssessmentsModule,
  ],
  controllers: [RoadmapsController],
  providers: [RoadmapsService, RoadmapGenerationService, OpenAiRoadmapClient],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}
