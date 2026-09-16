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
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { User } from './entities/user.entity.js';
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
  createAdmin(@GetUser() user: User, @Body() createUserDto: CreateUserDto) {
    if (user.role !== ValidRoles.admin) {
      return this.userService.create({ ...createUserDto, role: ValidRoles.user });
    }

    return this.userService.create({ ...createUserDto, role: ValidRoles.admin });
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
  findAll(@Query() paginationDto: PaginationDto) {
    return this.userService.findAll(paginationDto);
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
  findOneById(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOneById(id);
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
  search(@Body() search: { key: string }) {
    return this.userService.search(search);
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
  byClient(@Body() data: ListUsersByClientDto) {
    return this.userService.byClient(data);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.update(id, updateUserDto);
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
