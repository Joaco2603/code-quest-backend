import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import { Category, Course, CourseStatus, Technology } from './entities.js';
import type {
  AdminCourseQueryDto,
  CreateCourseDto,
  UpdateCourseDto,
} from './dto.js';

const relations = { categories: true, technologies: true, prerequisites: true };

type Taxonomy = 'categories' | 'technologies';

const taxonomyEntities = { categories: Category, technologies: Technology };

@Injectable()
export class CatalogService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  // Serialize catalog writes across processes: cycle and publication checks must
  // see the previous committed graph, even under concurrent requests.
  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(1789600000)');
        return work(manager);
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code === '23505')
          throw new ConflictException(
            'This name or relationship already exists',
          );
        if (code === '23503' || code === '23001')
          throw new ConflictException(
            'This resource is referenced or a related resource no longer exists',
          );
      }
      throw error;
    }
  }

  listTaxonomy(kind: Taxonomy) {
    return this.db
      .getRepository(taxonomyEntities[kind])
      .find({ order: { name: 'ASC', id: 'ASC' } });
  }

  async getTaxonomy(kind: Taxonomy, id: number) {
    const item = await this.db
      .getRepository(taxonomyEntities[kind])
      .findOneBy({ id });
    if (!item) throw new NotFoundException('Catalog entry not found');
    return item;
  }

  saveTaxonomy(kind: Taxonomy, name: string, id?: number) {
    return this.write(async (manager) => {
      const repository = manager.getRepository(taxonomyEntities[kind]);
      if (id !== undefined && !(await repository.existsBy({ id })))
        throw new NotFoundException('Catalog entry not found');
      return repository.save(
        repository.create({
          ...(id === undefined ? {} : { id }),
          name: name.trim(),
        }),
      );
    });
  }

  deleteTaxonomy(kind: Taxonomy, id: number) {
    return this.write(async (manager) => {
      const result = await manager
        .getRepository(taxonomyEntities[kind])
        .delete(id);
      if (!result.affected)
        throw new NotFoundException('Catalog entry not found');
    });
  }

  async listCourses(query: AdminCourseQueryDto, admin = false) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.db
      .getRepository(Course)
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.categories', 'category')
      .leftJoinAndSelect('course.technologies', 'technology')
      .leftJoinAndSelect('course.prerequisites', 'prerequisite');

    const status = admin ? query.status : CourseStatus.Published;

    if (status) builder.andWhere('course.status = :status', { status });
    if (query.level)
      builder.andWhere('course.level = :level', { level: query.level });
    if (query.search) {
      // Literal substring search; user-entered SQL wildcard characters are escaped.
      const escaped = query.search.replace(/[\\%_]/g, (value) => '\\' + value);
      builder.andWhere('course.title ILIKE :search', {
        search: `%${escaped}%`,
      });
    }
    if (query.categoryId)
      builder.andWhere(
        'EXISTS (SELECT 1 FROM course_categories cc WHERE cc.course_id = course.id AND cc.category_id = :categoryId)',
        { categoryId: query.categoryId },
      );
    if (query.technologyId)
      builder.andWhere(
        'EXISTS (SELECT 1 FROM course_technologies ct WHERE ct.course_id = course.id AND ct.technology_id = :technologyId)',
        { technologyId: query.technologyId },
      );
    const [courses, total] = await builder
      .orderBy('course.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: courses.map((course) => this.present(course)),
      total,
      page,
      limit,
    };
  }

  private async load(manager: EntityManager, id: number) {
    const course = await manager.findOne(Course, { where: { id }, relations });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private present(course: Course) {
    const { prerequisites, ...data } = course;
    return {
      ...data,
      prerequisiteIds: (prerequisites ?? [])
        .map((item) => item.id)
        .sort((a, b) => a - b),
    };
  }

  async getCourse(id: number, admin = false) {
    const course = await this.load(this.db.manager, id);
    if (!admin && course.status !== CourseStatus.Published)
      throw new NotFoundException('Course not found');
    return this.present(course);
  }

  private async assign(
    manager: EntityManager,
    course: Course,
    dto: CreateCourseDto | UpdateCourseDto,
  ) {
    const { categoryIds, technologyIds, prerequisiteIds, ...fields } = dto;
    Object.assign(course, fields);
    if (categoryIds !== undefined) {
      course.categories = await manager.findBy(Category, {
        id: In(categoryIds),
      });
      if (course.categories.length !== categoryIds.length)
        throw new BadRequestException('Unknown category IDs');
    }
    if (technologyIds !== undefined) {
      course.technologies = await manager.findBy(Technology, {
        id: In(technologyIds),
      });
      if (course.technologies.length !== technologyIds.length)
        throw new BadRequestException('Unknown technology IDs');
    }
    if (prerequisiteIds !== undefined) {
      if (prerequisiteIds.includes(course.id))
        throw new BadRequestException('A course cannot require itself');
      course.prerequisites = await manager.findBy(Course, {
        id: In(prerequisiteIds),
      });
      if (course.prerequisites.length !== prerequisiteIds.length)
        throw new BadRequestException('Unknown prerequisite IDs');
      if (course.id && prerequisiteIds.length) {
        const cycles: { id: number }[] = await manager.query(
          `
          WITH RECURSIVE reachable(id) AS (
            SELECT unnest($1::int[])
            UNION SELECT cp.prerequisite_id FROM course_prerequisites cp JOIN reachable r ON cp.course_id = r.id
          ) SELECT id FROM reachable WHERE id = $2`,
          [prerequisiteIds, course.id],
        );
        if (cycles.length)
          throw new ConflictException('Prerequisites would create a cycle');
      }
    }
  }

  private validatePublication(course: Course) {
    const required = [
      'description',
      'url',
      'imageUrl',
      'durationMinutes',
      'instructor',
      'level',
    ] as const;
    const missing: string[] = required.filter((key) => !course[key]);
    if (!course.categories?.length) missing.push('categoryIds');
    if (!course.technologies?.length) missing.push('technologyIds');
    if (missing.length)
      throw new BadRequestException({
        message: 'Complete the course before publishing',
        missing,
      });
    if (
      course.prerequisites.some(
        (item) => item.status !== CourseStatus.Published,
      )
    )
      throw new ConflictException('Publish all prerequisites first');
  }

  createCourse(dto: CreateCourseDto) {
    return this.write(async (manager) => {
      const course = manager.create(Course, {
        status: CourseStatus.Draft,
        categories: [],
        technologies: [],
        prerequisites: [],
      });
      await this.assign(manager, course, dto);
      await manager.save(course);
      return this.present(await this.load(manager, course.id));
    });
  }

  updateCourse(id: number, dto: UpdateCourseDto) {
    return this.write(async (manager) => {
      const course = await this.load(manager, id);
      if (course.status === CourseStatus.Archived)
        throw new ConflictException(
          'Restore the course to draft before editing',
        );
      await this.assign(manager, course, dto);
      if (course.status === CourseStatus.Published)
        this.validatePublication(course);
      await manager.save(course);
      return this.present(await this.load(manager, id));
    });
  }

  changeStatus(id: number, status: CourseStatus) {
    return this.write(async (manager) => {
      const course = await this.load(manager, id);
      if (status === CourseStatus.Published) this.validatePublication(course);
      else {
        const dependents: { id: number }[] = await manager.query(
          `SELECT c.id FROM courses c
          JOIN course_prerequisites cp ON cp.course_id = c.id
          WHERE cp.prerequisite_id = $1 AND c.status = 'published'`,
          [id],
        );
        if (dependents.length)
          throw new ConflictException(
            'Unpublish or archive dependent courses first',
          );
      }
      course.status = status;
      await manager.save(course);
      return this.present(course);
    });
  }

  // Internal contract for the roadmap module. Archived courses remain resolvable
  // for existing roadmaps; drafts must never be exposed to students.
  async getCoursesForExistingRoadmap(ids: number[]) {
    if (!ids.length) return [];
    const courses = await this.db.manager.find(Course, {
      where: {
        id: In(ids),
        status: In([CourseStatus.Published, CourseStatus.Archived]),
      },
      relations,
    });
    const byId = new Map(
      courses.map((course) => [course.id, this.present(course)]),
    );
    if (ids.some((id) => !byId.has(id)))
      throw new NotFoundException('A roadmap course is unavailable');
    return ids.map((id) => byId.get(id)!);
  }

  async getPublishedCatalog() {
    const courses = await this.db.manager.find(Course, {
      where: { status: CourseStatus.Published },
      relations,
      order: { id: 'ASC' },
    });
    return courses.map((course) => this.present(course));
  }

  // completedIds must come from trusted persisted progress, never LLM output.
  async validateRoadmapSelection(ids: number[], completedIds: number[] = []) {
    if (
      !ids.length ||
      ids.some((id) => !Number.isInteger(id) || id < 1) ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException('Provide unique positive course IDs');
    const courses = await this.getPublishedCatalog();
    const byId = new Map(courses.map((course) => [course.id, course]));
    const available = new Set(completedIds);
    for (const id of ids) {
      const course = byId.get(id);
      if (!course)
        throw new BadRequestException(`Course ${id} is not published`);
      if (course.prerequisiteIds.some((required) => !available.has(required)))
        throw new BadRequestException(
          `Course ${id} has missing or incorrectly ordered prerequisites`,
        );
      available.add(id);
    }
    return ids.map((id) => byId.get(id)!);
  }
}
