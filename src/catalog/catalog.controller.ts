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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  toDataResponse,
  toPaginatedResponse,
} from '../common/dto/api-response.dto.js';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminGuard } from './guards/catalog-admin.guard.js';
import { CatalogIdPipe } from './pipes/catalog-id.pipe.js';
import {
  AdminCourseQueryDto,
  CatalogSummaryCollectionDataResponseDto,
  CatalogSummaryDataResponseDto,
  CourseDataResponseDto,
  CoursePaginatedResponseDto,
  CourseQueryDto,
  CreateCourseDto,
  LevelCollectionDataResponseDto,
  NameDto,
  UpdateCourseDto,
} from './dto/catalog.dto.js';
import { CourseStatus, SkillLevel } from './entities/catalog.entities.js';

@ApiTags('Courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List published courses' })
  @ApiOkResponse({
    description: 'Paginated published courses.',
    type: CoursePaginatedResponseDto,
  })
  async list(@Query() query: CourseQueryDto) {
    const { items, total, limit, offset } =
      await this.catalog.listCourses(query);
    return toPaginatedResponse(items, { total, limit, offset });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a published course' })
  @ApiOkResponse({
    description: 'Course detail.',
    type: CourseDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Course was not found.' })
  async get(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.catalog.getCourse(id));
  }
}

@ApiTags('Catalog administration')
@ApiBearerAuth('access-token')
@UseGuards(CatalogAdminGuard)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOkResponse({
    description: 'Paginated courses including drafts and archived.',
    type: CoursePaginatedResponseDto,
  })
  async list(@Query() query: AdminCourseQueryDto) {
    const { items, total, limit, offset } = await this.catalog.listCourses(
      query,
      true,
    );
    return toPaginatedResponse(items, { total, limit, offset });
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Course detail.',
    type: CourseDataResponseDto,
  })
  async get(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.catalog.getCourse(id, true));
  }

  @Post()
  @ApiCreatedResponse({
    description: 'Draft course created.',
    type: CourseDataResponseDto,
  })
  async create(@Body() dto: CreateCourseDto) {
    return toDataResponse(await this.catalog.createCourse(dto));
  }

  @Patch(':id')
  @ApiOkResponse({
    description: 'Updated course.',
    type: CourseDataResponseDto,
  })
  async update(
    @Param('id', CatalogIdPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return toDataResponse(await this.catalog.updateCourse(id, dto));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'Published course.',
    type: CourseDataResponseDto,
  })
  async publish(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(
      await this.catalog.changeStatus(id, CourseStatus.Published),
    );
  }

  @Post(':id/draft')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'Course moved to draft.',
    type: CourseDataResponseDto,
  })
  async draft(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(
      await this.catalog.changeStatus(id, CourseStatus.Draft),
    );
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ApiOkResponse({
    description: 'Archived course.',
    type: CourseDataResponseDto,
  })
  async archive(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(
      await this.catalog.changeStatus(id, CourseStatus.Archived),
    );
  }
}

@ApiTags('Catalog')
@Controller('levels')
export class LevelsController {
  @Get()
  @ApiOperation({ summary: 'List fixed skill levels' })
  @ApiOkResponse({
    description: 'Skill levels.',
    type: LevelCollectionDataResponseDto,
  })
  list() {
    return toDataResponse(Object.values(SkillLevel));
  }
}

@ApiTags('Catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOkResponse({
    description: 'Categories ordered by name.',
    type: CatalogSummaryCollectionDataResponseDto,
  })
  async list() {
    return toDataResponse(await this.catalog.listTaxonomy('categories'));
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Category detail.',
    type: CatalogSummaryDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Catalog entry was not found.' })
  async get(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.catalog.getTaxonomy('categories', id));
  }

  @Post()
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiCreatedResponse({
    description: 'Category created.',
    type: CatalogSummaryDataResponseDto,
  })
  async create(@Body() dto: NameDto) {
    return toDataResponse(
      await this.catalog.saveTaxonomy('categories', dto.name),
    );
  }

  @Patch(':id')
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOkResponse({
    description: 'Renamed category.',
    type: CatalogSummaryDataResponseDto,
  })
  async update(@Param('id', CatalogIdPipe) id: number, @Body() dto: NameDto) {
    return toDataResponse(
      await this.catalog.saveTaxonomy('categories', dto.name, id),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiNoContentResponse({ description: 'Category deleted.' })
  delete(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.deleteTaxonomy('categories', id);
  }
}

@ApiTags('Catalog')
@Controller('technologies')
export class TechnologiesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOkResponse({
    description: 'Technologies ordered by name.',
    type: CatalogSummaryCollectionDataResponseDto,
  })
  async list() {
    return toDataResponse(await this.catalog.listTaxonomy('technologies'));
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Technology detail.',
    type: CatalogSummaryDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Catalog entry was not found.' })
  async get(@Param('id', CatalogIdPipe) id: number) {
    return toDataResponse(await this.catalog.getTaxonomy('technologies', id));
  }

  @Post()
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiCreatedResponse({
    description: 'Technology created.',
    type: CatalogSummaryDataResponseDto,
  })
  async create(@Body() dto: NameDto) {
    return toDataResponse(
      await this.catalog.saveTaxonomy('technologies', dto.name),
    );
  }

  @Patch(':id')
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOkResponse({
    description: 'Renamed technology.',
    type: CatalogSummaryDataResponseDto,
  })
  async update(@Param('id', CatalogIdPipe) id: number, @Body() dto: NameDto) {
    return toDataResponse(
      await this.catalog.saveTaxonomy('technologies', dto.name, id),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(CatalogAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiNoContentResponse({ description: 'Technology deleted.' })
  delete(@Param('id', CatalogIdPipe) id: number) {
    return this.catalog.deleteTaxonomy('technologies', id);
  }
}
