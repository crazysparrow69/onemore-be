import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ApiErrorResponses } from '../common/api-error-responses.decorator';
import { Public } from '../modules/auth/auth.decorators';
import type { Env } from '../config/env';
import { DatabaseHealthService } from '../db/database-health.service';
import { HealthResponseDto, type HealthResponse } from './health.schema';

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly databaseHealth: DatabaseHealthService,
  ) {}

  @Get()
  @ZodResponse({
    status: 200,
    description: 'The service is up. Does not touch the database.',
    type: HealthResponseDto,
  })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      version: this.config.get('APP_VERSION', { infer: true }),
    };
  }

  @Get('ready')
  @ZodResponse({
    status: 200,
    description: 'The service is up and the database answers SELECT 1.',
    type: HealthResponseDto,
  })
  @ApiErrorResponses(503)
  async getReady(): Promise<HealthResponse> {
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
