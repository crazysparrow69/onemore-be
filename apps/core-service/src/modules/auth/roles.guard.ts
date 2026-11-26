import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { appError } from '../../common/errors';
import type { UserRole } from '../../db/schema/users';
import { UsersService } from '../users/users.service';
import { ROLES_KEY } from './auth.constants';
import type { AuthRequest } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) {
      throw appError('UNAUTHORIZED');
    }

    const row = await this.users.findById(user.id);
    if (!row || !roles.includes(row.role)) {
      throw appError('FORBIDDEN');
    }
    return true;
  }
}
