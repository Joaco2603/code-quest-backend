import { ApiProperty } from '@nestjs/swagger';
import { ValidRoles } from '../../auth/interfaces/index.js';
import { PaginationMetaDto } from '../../common/dto/api-response.dto.js';

/**
 * Public output contracts for users.
 *
 * Naming: output uses camelCase (`first_name` -> `firstName`).
 * The rename happens in the serializer, never in columns or input DTOs.
 * `password` and `two_factor_secret` are never part of any output DTO,
 * including nested relations.
 */
export class UserClientSummaryDto {
  @ApiProperty({
    description: 'Client user id.',
    example: 'de69dcfb-ca41-4b7b-9685-aabd64e83982',
  })
  id: string;

  @ApiProperty({ description: 'Client email.', example: 'client@example.com' })
  email: string;

  @ApiProperty({ description: 'Client first name.', example: 'kevin' })
  firstName: string;

  @ApiProperty({
    description: 'Client last name.',
    example: 'diaz',
    nullable: true,
    type: String,
  })
  lastName: string | null;

  @ApiProperty({ description: 'Client role.', enum: ValidRoles })
  role: ValidRoles;

  @ApiProperty({ description: 'Whether the client account is enabled.' })
  isActive: boolean;
}

export class UserDetailResponseDto {
  @ApiProperty({
    description: 'User id.',
    example: '43566ec8-22af-41d3-933a-918b536fe99f',
  })
  id: string;

  @ApiProperty({ description: 'User email.', example: 'user@example.com' })
  email: string;

  @ApiProperty({
    description: 'Discord account id, when linked.',
    example: '123456789',
    nullable: true,
    type: String,
  })
  discordId: string | null;

  @ApiProperty({ description: 'User first name.', example: 'kevin' })
  firstName: string;

  @ApiProperty({
    description: 'User last name.',
    example: 'diaz',
    nullable: true,
    type: String,
  })
  lastName: string | null;

  @ApiProperty({
    description: 'User address.',
    example: 'Code Quest main campus',
    nullable: true,
    type: String,
  })
  address: string | null;

  @ApiProperty({ description: 'User role.', enum: ValidRoles })
  role: ValidRoles;

  @ApiProperty({ description: 'Whether the account is enabled.' })
  isActive: boolean;

  @ApiProperty({ description: 'Whether 2FA is enabled.' })
  isTwoFactorEnabled: boolean;

  @ApiProperty({ description: 'Whether 2FA setup is pending.' })
  isTwoFactorPending: boolean;

  @ApiProperty({ description: 'Whether the user must change password.' })
  mustChangePassword: boolean;

  @ApiProperty({
    description: 'Owning client (one level deep, never nested further).',
    type: () => UserClientSummaryDto,
    nullable: true,
  })
  client: UserClientSummaryDto | null;
}

/**
 * List item for GET /user.
 * Same fields as the detail plus `quantityUsers`, which is only promised
 * by the paginated list where the real count comes from
 * `loadRelationCountAndMap('user.quantity_users', 'user.users')`.
 * Detail, search and byClient responses omit `quantityUsers` entirely.
 */
export class UserListItemResponseDto extends UserDetailResponseDto {
  @ApiProperty({
    description: 'Real count of child users owned by this user.',
    example: 3,
  })
  quantityUsers: number;
}

export class UserDetailDataResponseDto {
  @ApiProperty({ type: () => UserDetailResponseDto })
  data: UserDetailResponseDto;
}

export class UserCollectionDataResponseDto {
  @ApiProperty({ type: () => [UserDetailResponseDto] })
  data: UserDetailResponseDto[];
}

export class UserListPaginatedResponseDto {
  @ApiProperty({ type: () => [UserListItemResponseDto] })
  data: UserListItemResponseDto[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;
}
