import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { appError } from '../../common/errors';
import { IS_PUBLIC_KEY } from './auth.constants';
import type { AuthRequest, AuthUser } from './auth.types';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) {
      throw appError('UNAUTHORIZED');
    }
    return user;
  },
);
