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

  it('prefers an explicit non-zero offset over a page-derived one', () => {
    expect(
      resolvePagination({ page: 2, limit: 5, offset: 30 }, 1000),
    ).toEqual({ limit: 5, offset: 30 });
    expect(resolvePagination({ offset: 40 }, 20)).toEqual({
      limit: 20,
      offset: 40,
    });
  });
});
