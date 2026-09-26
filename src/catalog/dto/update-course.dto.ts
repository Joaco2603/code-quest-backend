import { PartialType } from '@nestjs/swagger';
import { CreateCourseDto } from './create-course.dto.js';

export class UpdateCourseDto extends PartialType(CreateCourseDto, {
  skipNullProperties: false,
}) {}
