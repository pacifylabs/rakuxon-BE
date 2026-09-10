import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({
    description:
      'The full invitation URL. Shown once, at issue time — only a hash is stored, so it ' +
      'cannot be retrieved again.',
  })
  url!: string;

  @ApiProperty({ example: 'student@example.com' })
  inviteeEmail!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class ConsumeOnboardingLinkDto {
  @ApiProperty({ description: 'The token from the invitation link.' })
  @IsString()
  token!: string;
}

export class ConsumedLinkDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ example: 'student@example.com' })
  inviteeEmail!: string;
}

export class PeekOnboardingLinkDto {
  @ApiProperty({ description: 'The token from the invitation link.' })
  @IsString()
  token!: string;
}

export class PeekedLinkDto {
  @ApiProperty({ example: 'Northwind Education' })
  tenantName!: string;

  @ApiProperty({ example: 'student@example.com' })
  inviteeEmail!: string;
}

export class RegisterViaOnboardingLinkDto {
  @ApiProperty({ description: 'The token from the invitation link.' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'correct-horse-battery', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}
