import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminGuard } from './catalog-access.js';
import { CatalogIdPipe } from './catalog-id.pipe.js';
import {
  AdminCourseQueryDto,
  CourseQueryDto,
  CreateCourseDto,
  NameDto,
  UpdateCourseDto,
} from './dto.js';
import { CourseStatus, SkillLevel } from './entities.js';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List published courses' })
  list(@Query() query: CourseQueryDto) {
    return this.catalog.listCourses(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a published course' })
  get(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.getCourse(id);
  }
}

@ApiTags('Catalog administration')
@ApiBearerAuth('access-token')
@UseGuards(CatalogAdminGuard)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list(@Query() query: AdminCourseQueryDto) {
    return this.catalog.listCourses(query, true);
  }

  @Get(':id') get(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.getCourse(id, true);
  }

  @Post() create(@Body() dto: CreateCourseDto) {
    return this.catalog.createCourse(dto);
  }

  @Patch(':id') update(
    @Param('id', CatalogIdPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.catalog.updateCourse(id, dto);
  }

  @Post(':id/publish') @HttpCode(200) publish(
    @Param('id', CatalogIdPipe) id: number,
  ) {
    return this.catalog.changeStatus(id, CourseStatus.Published);
  }

  @Post(':id/draft') @HttpCode(200) draft(
    @Param('id', CatalogIdPipe) id: number,
  ) {
    return this.catalog.changeStatus(id, CourseStatus.Draft);
  }

  @Post(':id/archive') @HttpCode(200) archive(
    @Param('id', CatalogIdPipe) id: number,
  ) {
    return this.catalog.changeStatus(id, CourseStatus.Archived);
  }
}

@ApiTags('Catalog')
@Controller('levels')
export class LevelsController {
  @Get() list() {
    return Object.values(SkillLevel);
  }
}

@ApiTags('Catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list() {
    return this.catalog.listTaxonomy('categories');
  }

  @Get(':id') get(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.getTaxonomy('categories', id);
  }

  @Post()
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  create(@Body() dto: NameDto) {
    return this.catalog.saveTaxonomy('categories', dto.name);
  }

  @Patch(':id')
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  update(@Param('id', CatalogIdPipe) id: number, @Body() dto: NameDto) {
    return this.catalog.saveTaxonomy('categories', dto.name, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  delete(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.deleteTaxonomy('categories', id);
  }
}

@ApiTags('Catalog')
@Controller('technologies')
export class TechnologiesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list() {
    return this.catalog.listTaxonomy('technologies');
  }

  @Get(':id') get(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.getTaxonomy('technologies', id);
  }

  @Post()
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  create(@Body() dto: NameDto) {
    return this.catalog.saveTaxonomy('technologies', dto.name);
  }

  @Patch(':id')
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  update(@Param('id', CatalogIdPipe) id: number, @Body() dto: NameDto) {
    return this.catalog.saveTaxonomy('technologies', dto.name, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  delete(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.deleteTaxonomy('technologies', id);
  }
}
