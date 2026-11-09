import {
  createParamDecorator,
  type ExecutionContext,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../../db/schema/users';
import { AppException } from '../../common/app.exception';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants';
import type { AuthUser } from './auth.types';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Unauthorized',
      );
    }
    return request.user;
  },
);
