import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/app.exception';
import type { UserRole } from '../../db/schema/users';
import { UsersRepository } from '../users/users.repository';
import { ROLES_KEY } from './auth.constants';
import type { AuthUser } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Unauthorized',
      );
    }

    const row = await this.users.findById(user.id);
    const role = row?.role;
    if ((role !== 'user' && role !== 'admin') || !roles.includes(role)) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Forbidden');
    }
    return true;
  }
}
