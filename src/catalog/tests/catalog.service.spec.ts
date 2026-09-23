import { vi } from 'vitest';
import { CatalogService } from '../catalog.service.js';

describe('CatalogService.listCourses pagination', () => {
  function buildService(total = 0) {
    const builder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([[], total]),
    };
    const db = {
      getRepository: vi.fn(() => ({
        createQueryBuilder: vi.fn(() => builder),
      })),
    };
    return { service: new CatalogService(db as never), builder };
  }

  it('honors an explicit offset of 40 with the default limit', async () => {
    const { service, builder } = buildService(55);

    const result = await service.listCourses({ offset: 40 });

    expect(builder.skip).toHaveBeenCalledWith(40);
    expect(builder.take).toHaveBeenCalledWith(20);
    expect(result).toEqual({ items: [], total: 55, limit: 20, offset: 40 });
  });

  it('keeps the existing page/limit behavior', async () => {
    const { service, builder } = buildService(2);

    const page2 = await service.listCourses({ page: 2, limit: 1 });
    const page1 = await service.listCourses({ page: 1, limit: 1 });

    expect(builder.skip).toHaveBeenNthCalledWith(1, 1);
    expect(builder.skip).toHaveBeenNthCalledWith(2, 0);
    expect(builder.take).toHaveBeenCalledWith(1);
    expect(page2).toEqual({ items: [], total: 2, limit: 1, offset: 1 });
    expect(page1).toEqual({ items: [], total: 2, limit: 1, offset: 0 });
  });

  it('uses pageSize when no explicit limit is given', async () => {
    const { service, builder } = buildService(10);

    const result = await service.listCourses({ pageSize: 5 });

    expect(builder.take).toHaveBeenCalledWith(5);
    expect(result).toMatchObject({ limit: 5, offset: 0 });
  });

  it('prefers an explicit limit over pageSize', async () => {
    const { service, builder } = buildService(10);

    await service.listCourses({ limit: 3, pageSize: 50 });

    expect(builder.take).toHaveBeenCalledWith(3);
  });
});
