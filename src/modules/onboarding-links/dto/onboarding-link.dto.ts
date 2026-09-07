import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class IssueOnboardingLinkDto {
  @ApiProperty({ example: 'student@example.com', description: 'Who the invitation is for.' })
  @IsEmail()
  inviteeEmail!: string;

  @ApiProperty({
    example: 14,
    minimum: 1,
    maximum: 90,
    required: false,
    description: 'Days until the link expires. Defaults to 14.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiresInDays?: number;
}

export class OnboardingLinkDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'The full invitation URL. Shown once, at issue time — only a hash is stored, so it ' +
      'cannot be retrieved again.',
  })
  url!: string;

  @ApiProperty({ example: 'student@example.com' })
  inviteeEmail!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}

export class ConsumeOnboardingLinkDto {
  @ApiProperty({ description: 'The token from the invitation link.' })
  @IsString()
  token!: string;
}

export class ConsumedLinkDto {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ example: 'student@example.com' })
  inviteeEmail!: string;
}
