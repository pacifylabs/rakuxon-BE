import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { ENV } from '../config/config.module';
import type { Env } from '../config/env.schema';
import { HealthResponseDto } from './dto/health-response.dto';

/** Set by CI so a deployed instance can be traced back to a commit. */
const BUILD_SHA = process.env.GIT_COMMIT_SHA ?? 'local';
const STARTED_AT = Date.now();

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and dependency check',
    description:
      'Returns build information and the reachability of each dependency. Always 200 so a ' +
      'load balancer can distinguish "process is up" from "database is down" by reading the body.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    return {
      status: 'ok',
      environment: this.env.NODE_ENV,
      version: BUILD_SHA,
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      dependencies: { database: await this.pingDatabase() },
    };
  }

  /** Never throws: a database outage is reported in the body, not as a 500. */
  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      if (!this.dataSource.isInitialized) return 'down';
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
