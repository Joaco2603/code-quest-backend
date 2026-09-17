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
} from './dtos/index.js';
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
    schema: {
      example: {
        id: '43566ec8-22af-41d3-933a-918b536fe99f',
        email: 'user@example.com',
        first_name: 'user',
        last_name: 'quest',
        role: 'user',
        isActive: true,
      },
    },
  })
  @UseGuards(AuthGuard())
  @Auth(ValidRoles.admin, ValidRoles.client)
  createAdmin(@GetUser() user: AuthUser, @Body() createUserDto: CreateUserDto) {
    if (user.role !== ValidRoles.admin) {
      return this.userService.create({
        ...createUserDto,
        role: ValidRoles.user,
        client_id: user.id,
      });
    }

    return this.userService.create(createUserDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List users',
    description:
      'Returns users for administration screens. Use `all=true` for full lists.',
  })
  @ApiOkResponse({
    description: 'User list.',
    schema: {
      example: [
        {
          id: '43566ec8-22af-41d3-933a-918b536fe99f',
          email: 'user@example.com',
          first_name: 'user',
          last_name: 'quest',
          role: 'user',
          is_two_factor_enabled: true,
        },
      ],
    },
  })
  @Auth(ValidRoles.admin, ValidRoles.client)
  findAll(
    @GetUser() actor: AuthUser,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.userService.findAll(paginationDto, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by id',
    description: 'Returns one user by UUID.',
  })
  @ApiOkResponse({
    description: 'User detail.',
    schema: {
      example: {
        id: '43566ec8-22af-41d3-933a-918b536fe99f',
        email: 'user@example.com',
        first_name: 'user',
        last_name: 'quest',
        role: 'user',
      },
    },
  })
  @ApiNotFoundResponse({ description: 'User was not found.' })
  @Auth(ValidRoles.admin, ValidRoles.client)
  findOneById(
    @GetUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userService.findOneById(id, actor);
  }

  @Post('search')
  @ApiOperation({
    summary: 'Search users',
    description: 'Searches users by the provided criteria.',
  })
  @ApiOkResponse({
    description: 'Users matching the search criteria.',
    schema: {
      example: [
        { id: '43566ec8-22af-41d3-933a-918b536fe99f', email: 'user@example.com' },
      ],
    },
  })
  @Auth(ValidRoles.admin, ValidRoles.client)
  search(@GetUser() actor: AuthUser, @Body() search: { key: string }) {
    return this.userService.search(search, actor);
  }

  @Post('byClient')
  @ApiOperation({
    summary: 'List users by client',
    description: 'Returns users belonging to a client.',
  })
  @ApiOkResponse({
    description: 'Users linked to the client.',
    schema: {
      example: [
        {
          id: '43566ec8-22af-41d3-933a-918b536fe99f',
          email: 'operator@example.com',
          first_name: 'operator',
          role: 'user',
        },
      ],
    },
  })
  @Auth(ValidRoles.client)
  byClient(@GetUser() actor: AuthUser, @Body() data: ListUsersByClientDto) {
    return this.userService.byClient(data, actor);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update user',
    description: 'Updates user status, profile fields, or role information.',
  })
  @ApiOkResponse({
    description: 'Updated user.',
    schema: {
      example: {
        id: '43566ec8-22af-41d3-933a-918b536fe99f',
        email: 'operator@example.com',
        isActive: true,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'User was not found.' })
  @Auth(ValidRoles.admin, ValidRoles.client)
  update(
    @GetUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(id, updateUserDto, actor);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user',
    description: 'Deletes a user account. Admin role is required.',
  })
  @ApiOkResponse({
    description: 'User deleted successfully.',
    schema: { example: { message: 'User removed successfully' } },
  })
  @Auth(ValidRoles.admin)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.remove(id);
  }
}
