import { ApiProperty } from '@nestjs/swagger';

export class HealthDependenciesDto {
  @ApiProperty({ enum: ['up', 'down'], description: 'Postgres reachability.' })
  database!: 'up' | 'down';
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ enum: ['development', 'test', 'production'] })
  environment!: string;

  @ApiProperty({ example: 'a1b2c3d', description: 'Commit the running build came from.' })
  version!: string;

  @ApiProperty({ example: 42 })
  uptimeSeconds!: number;

  @ApiProperty({ type: HealthDependenciesDto })
  dependencies!: HealthDependenciesDto;
}
