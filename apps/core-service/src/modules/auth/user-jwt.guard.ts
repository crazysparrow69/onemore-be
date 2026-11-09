import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../common/app.exception';
import { IS_PUBLIC_KEY } from './auth.constants';
import type { AuthUser } from './auth.types';
import { JwtVerifierService } from './jwt-verifier.service';

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

    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      header(name: string): string | undefined;
    }>();
    const header = request.header('authorization');
    const token = bearerToken(header);
    if (!token) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Unauthorized',
      );
    }
    request.user = await this.verifier.verify(token);
    return true;
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}
