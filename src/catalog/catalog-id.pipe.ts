import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export const MAX_CATALOG_ID = 2_147_483_647;

@Injectable()
export class CatalogIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);
    if (
      !/^\d+$/.test(value) ||
      !Number.isInteger(id) ||
      id < 1 ||
      id > MAX_CATALOG_ID
    ) {
      throw new BadRequestException(
        `ID must be an integer between 1 and ${MAX_CATALOG_ID}`,
      );
    }
    return id;
  }
}
