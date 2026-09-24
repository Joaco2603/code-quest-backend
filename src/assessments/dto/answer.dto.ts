import { Allow, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { AnswerValue } from '../interfaces/index.js';

export class AnswerDto {
  @ApiProperty() @IsInt() @Min(1) questionId: number;
  @ApiProperty({
    description:
      'single_choice: option ID; multiple_choice: option IDs; text, number and boolean: native JSON value.',
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'integer' } },
    ],
  })
  @Allow()
  value: AnswerValue;
}
