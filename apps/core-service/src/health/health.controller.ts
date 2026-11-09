import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../modules/auth/auth.decorators';
import type { Env } from '../config/env';
import { DatabaseHealthService } from '../db/database-health.service';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly databaseHealth: DatabaseHealthService,
  ) {}

  @Get()
  getHealth(): { status: 'ok'; version: string } {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
    };
  }

  @Get('ready')
  async getReady(): Promise<{ status: 'ok'; version: string }> {
    try {
      await this.databaseHealth.ping();
    } catch (error) {
      this.logger.error(
        `Database check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return this.getHealth();
  }
}
