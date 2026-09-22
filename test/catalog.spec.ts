import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { readEnvironment, parseAllowedOrigins } from '../dist/config/envs.js';
import { buildCorsOptions } from '../dist/config/setup.js';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CourseQueryDto,
} from '../dist/catalog/dto.js';
import { CatalogAdminGuard } from '../dist/catalog/catalog-access.js';
import type { ExecutionContext } from '@nestjs/common';

describe('configuration', () => {
  it('requires explicit database credentials in production', () => {
    expect(() => readEnvironment({ NODE_ENV: 'production' })).toThrow(
      'DB_HOST',
    );
    expect(() =>
      readEnvironment({
        NODE_ENV: 'production',
        DB_HOST: 'db',
        DB_NAME: 'db',
        DB_USERNAME: 'db',
      }),
    ).toThrow('DB_PASSWORD');
  });
  it.each(['0', '-1', '3.5', 'Infinity', '65536', ''])(
    'rejects invalid ports: %s',
    (PORT) => {
      expect(() => readEnvironment({ PORT })).toThrow('PORT');
    },
  );
  it('disables schema synchronization and validates booleans', () => {
    expect(() => readEnvironment({ DB_SYNCHRONIZE: 'true' })).toThrow(
      'migrations',
    );
    expect(() => readEnvironment({ DB_SSL: 'yes' })).toThrow('DB_SSL');
  });
  it('rejects wildcard credentialed CORS and honors an empty explicit allowlist', () => {
    expect(() => parseAllowedOrigins('*')).toThrow('explicit');
    const callback = vi.fn();
    buildCorsOptions([]).origin('http://localhost:3000', callback);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
describe('DTO validation', () => {
  const errors = (value: object) =>
    validate(plainToInstance(CreateCourseDto, value));
  it('accepts a title-only draft and trims it', async () => {
    const dto = plainToInstance(CreateCourseDto, { title: '  Basics  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.title).toBe('Basics');
  });
  it.each([
    { title: ' ' },
    { title: 'A', durationMinutes: '60' },
    { title: 'A', categoryIds: null },
    { title: 'A', prerequisiteIds: [1, 1] },
    { title: 'A', url: 'javascript:alert(1)' },
    { title: 'A', imageUrl: 'ftp://example.com/image.png' },
  ])('rejects malformed fields %j', async (dto) => {
    expect((await errors(dto)).length).toBeGreaterThan(0);
  });
  it('rejects null title on update while allowing nullable draft fields', async () => {
    expect(
      (await validate(plainToInstance(UpdateCourseDto, { title: null })))
        .length,
    ).toBeGreaterThan(0);
    expect(
      await validate(plainToInstance(UpdateCourseDto, { description: null })),
    ).toEqual([]);
  });
  it('bounds pagination and explicitly converts query numbers', async () => {
    const dto = plainToInstance(CourseQueryDto, { page: '2', limit: '100' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.page).toBe(2);
    expect(
      (await validate(plainToInstance(CourseQueryDto, { limit: '101' })))
        .length,
    ).toBeGreaterThan(0);
  });
  it('accepts offset and pageSize query inputs', async () => {
    const dto = plainToInstance(CourseQueryDto, {
      offset: '40',
      pageSize: '50',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.offset).toBe(40);
    expect(dto.pageSize).toBe(50);
    expect(dto.limit).toBeUndefined();
    expect(
      (await validate(plainToInstance(CourseQueryDto, { offset: '-1' })))
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(CourseQueryDto, { pageSize: '101' })))
        .length,
    ).toBeGreaterThan(0);
  });
});
it('denies administrative operations until trusted authentication is integrated', () => {
  expect(new CatalogAdminGuard().canActivate({} as ExecutionContext)).toBe(
    false,
  );
});
