import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationDto } from '../dto/pagination.dto.js';
import { resolvePagination } from '../helpers/pagination.js';

describe('resolvePagination', () => {
  it('prefers an explicit limit over pageSize', () => {
    expect(resolvePagination({ limit: 5, pageSize: 10 }, 1000)).toEqual({
      limit: 5,
      offset: 0,
    });
  });

  it('uses pageSize as the limit when no explicit limit is given', () => {
    expect(resolvePagination({ pageSize: 25 }, 1000)).toEqual({
      limit: 25,
      offset: 0,
    });
  });

  it('applies defaultLimit when neither limit nor pageSize is given', () => {
    expect(resolvePagination({}, 10)).toEqual({ limit: 10, offset: 0 });
    expect(resolvePagination({}, 20)).toEqual({ limit: 20, offset: 0 });
    expect(resolvePagination({}, 1000)).toEqual({ limit: 1000, offset: 0 });
  });

  it('derives offset from page when there is no explicit offset', () => {
    expect(resolvePagination({ page: 3, pageSize: 10 }, 1000)).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it('keeps one limit precedence on every page (explicit limit wins)', () => {
    expect(
      resolvePagination({ page: 3, pageSize: 10, limit: 1 }, 1000),
    ).toEqual({ limit: 1, offset: 2 });
    expect(
      resolvePagination({ page: 2, pageSize: 10, limit: 1 }, 1000),
    ).toEqual({ limit: 1, offset: 1 });
  });

  it('treats offset 0 as no explicit offset so page still applies', () => {
    expect(
      resolvePagination({ page: 3, pageSize: 10, limit: 1, offset: 0 }, 1000),
    ).toEqual({ limit: 1, offset: 2 });
    expect(resolvePagination({ page: 1, offset: 0 }, 20)).toEqual({
      limit: 20,
      offset: 0,
    });
  });

  it('accepts a non-zero offset that matches the page', () => {
    expect(resolvePagination({ page: 2, limit: 5, offset: 5 }, 1000)).toEqual({
      limit: 5,
      offset: 5,
    });
    expect(resolvePagination({ offset: 40 }, 20)).toEqual({
      limit: 20,
      offset: 40,
    });
  });

  it('rejects a non-zero offset that disagrees with page', () => {
    expect(() =>
      resolvePagination({ page: 2, limit: 5, offset: 30 }, 1000),
    ).toThrow(BadRequestException);
    expect(() =>
      resolvePagination({ page: 1, limit: 10, offset: 5 }, 20),
    ).toThrow(BadRequestException);
  });
});

describe('PaginationDto', () => {
  async function violations(query: Record<string, unknown>) {
    const dto = plainToInstance(PaginationDto, query);
    const errors = await validate(dto);
    return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
  }

  it('rejects an empty, zero, or non-numeric limit', async () => {
    expect(await violations({ limit: '' })).toEqual(
      expect.arrayContaining(['min']),
    );
    expect(await violations({ limit: '0' })).toEqual(
      expect.arrayContaining(['min']),
    );
    expect(await violations({ limit: 'abc' })).toEqual(
      expect.arrayContaining(['isInt']),
    );
  });

  it('rejects an isActive value that is not true or false', async () => {
    expect(await violations({ isActive: 'maybe' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({ isActive: '1' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({ isActive: 'True' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({})).toEqual([]);
    expect(await violations({ isActive: 'true' })).toEqual([]);
    expect(await violations({ isActive: 'false' })).toEqual([]);
  });

  it('rejects an all value that is not true or false', async () => {
    expect(await violations({ all: 'maybe' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({ all: '1' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({ all: 'TRUE' })).toEqual(
      expect.arrayContaining(['isBoolean']),
    );
    expect(await violations({ all: 'true' })).toEqual([]);
    expect(await violations({ all: 'false' })).toEqual([]);
  });

  it('rejects a non-numeric page, pageSize, or offset', async () => {
    expect(await violations({ page: 'abc' })).toEqual(
      expect.arrayContaining(['isInt']),
    );
    expect(await violations({ pageSize: '' })).toEqual(
      expect.arrayContaining(['min']),
    );
    expect(await violations({ offset: 'abc' })).toEqual(
      expect.arrayContaining(['isInt']),
    );
  });
});
