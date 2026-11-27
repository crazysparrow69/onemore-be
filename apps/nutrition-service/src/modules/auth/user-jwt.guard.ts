import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { appError } from '../../common/errors';
import { IS_PUBLIC_KEY } from './auth.constants';
import type { AuthRequest } from './auth.types';
import { JwtVerifierService } from './jwt-verifier.service';

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class UserJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifierService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(request.header('authorization'));
    if (!token) {
      throw appError('UNAUTHORIZED');
    }
    request.user = await this.verifier.verify(token);
    return true;
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  return header.slice(BEARER_PREFIX.length).trim() || undefined;
}
