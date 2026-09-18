import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import {
  CreateUserDto,
  ListUsersByClientDto,
  UpdateUserDto,
  UserCollectionDataResponseDto,
  UserDetailDataResponseDto,
  UserListPaginatedResponseDto,
} from './dtos/index.js';
import {
  serializeUserDetail,
  serializeUserDetails,
  serializeUserListItems,
} from './serializers/user.serializer.js';
import {
  toDataResponse,
  toPaginatedResponse,
} from '../common/dto/api-response.dto.js';
import { Auth, GetUser } from '../auth/decorators/index.js';
import { ValidRoles } from '../auth/interfaces/index.js';
import type { AuthUser } from '../auth/interfaces/auth-user.type.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../auth/guards/jwt.guard.js';
import { TwoFactorGuard } from '../auth/guards/two-factor.guard.js';
import {
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@Auth()
@UseGuards(JwtAuthGuard, TwoFactorGuard)
@ApiTags('Code Quest Used Endpoints', 'Users')
@ApiBearerAuth('access-token')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({
    summary: 'Create user from user module',
    description:
      'Creates an admin or standard user depending on the authenticated user role.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserDetailDataResponseDto,
  })
  @UseGuards(AuthGuard())
  @Auth(ValidRoles.admin, ValidRoles.client)
  async createAdmin(
    @GetUser() user: AuthUser,
    @Body() createUserDto: CreateUserDto,
  ) {
    const created =
      user.role !== ValidRoles.admin
        ? await this.userService.create({
            ...createUserDto,
            role: ValidRoles.user,
            client_id: user.id,
          })
        : await this.userService.create(createUserDto);

    return toDataResponse(serializeUserDetail(created));
  }

  @Get()
  @ApiOperation({
    summary: 'List users',
    description:
      'Returns users for administration screens. Use `all=true` for full lists.',
  })
  @ApiOkResponse({
    description: 'User list.',
    type: UserListPaginatedResponseDto,
  })
  @Auth(ValidRoles.admin, ValidRoles.client)
  async findAll(
    @GetUser() actor: AuthUser,
    @Query() paginationDto: PaginationDto,
  ) {
    const { items, total, limit, offset } = await this.userService.findAll(
      paginationDto,
      actor,
    );

    return toPaginatedResponse(serializeUserListItems(items), {
      total,
      limit,
      offset,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by id',
    description: 'Returns one user by UUID.',
  })
  @ApiOkResponse({
    description: 'User detail.',
    type: UserDetailDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User was not found.' })
  @Auth(ValidRoles.admin, ValidRoles.client)
  async findOneById(
    @GetUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = await this.userService.findOneById(id, actor);

    return toDataResponse(serializeUserDetail(user));
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search users',
    description: 'Searches users by the provided criteria.',
  })
  @ApiOkResponse({
    description: 'Users matching the search criteria.',
    type: UserCollectionDataResponseDto,
  })
  @Auth(ValidRoles.admin, ValidRoles.client)
  async search(@GetUser() actor: AuthUser, @Body() search: { key: string }) {
    const users = await this.userService.search(search, actor);

    return toDataResponse(serializeUserDetails(users));
  }

  @Post('byClient')
  @ApiOperation({
    summary: 'List users by client',
    description: 'Returns users belonging to a client.',
  })
  @ApiOkResponse({
    description: 'Users linked to the client.',
    type: UserCollectionDataResponseDto,
  })
  @Auth(ValidRoles.client)
  async byClient(
    @GetUser() actor: AuthUser,
    @Body() data: ListUsersByClientDto,
  ) {
    const users = await this.userService.byClient(data, actor);

    return toDataResponse(serializeUserDetails(users));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update user',
    description: 'Updates user status, profile fields, or role information.',
  })
  @ApiOkResponse({
    description: 'Updated user.',
    type: UserDetailDataResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User was not found.' })
  @Auth(ValidRoles.admin, ValidRoles.client)
  async update(
    @GetUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const updated = await this.userService.update(id, updateUserDto, actor);

    return toDataResponse(serializeUserDetail(updated));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user',
    description: 'Deletes a user account. Admin role is required.',
  })
  @ApiOkResponse({
    description: 'User deleted successfully.',
    schema: {
      example: {
        message:
          'User with id 43566ec8-22af-41d3-933a-918b536fe99f has been deleted',
      },
    },
  })
  @Auth(ValidRoles.admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.remove(id);
  }
}
