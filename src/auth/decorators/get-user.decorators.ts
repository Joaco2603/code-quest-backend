import {
    ExecutionContext,
    InternalServerErrorException,
    createParamDecorator,
  } from '@nestjs/common';
  
  export const GetUser = createParamDecorator(
    (data: string[] = null, ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      const user = req.user;
  
      if (!user)
        throw new InternalServerErrorException('User not found (request)');
  
      if (!data) return req.user;
  
      const selectData = {};
  
      data.forEach((dataSelect) => {
        selectData[dataSelect] = req.user[dataSelect];
      });
  
      return selectData;
    },
  );