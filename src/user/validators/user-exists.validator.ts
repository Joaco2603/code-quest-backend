import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { UserService } from '../user.service';

@ValidatorConstraint({ async: true })
@Injectable()
export class UserExistsValidator implements ValidatorConstraintInterface {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  async validate(value: string): Promise<boolean> {
    if (!value) return false;
    const model = await this.userService.findOneById(value);

    return !!model;
  }

  defaultMessage() {
    return 'The selected user does not exist';
  }
}