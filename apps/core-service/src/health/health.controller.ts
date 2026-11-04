import { Controller, Get, Inject } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

@Controller('health')
export class HealthController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  getHealth(): { status: 'ok'; version: string } {
    return { status: 'ok', version: this.env.APP_VERSION };
  }
}
