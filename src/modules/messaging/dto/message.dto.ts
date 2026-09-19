import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

import { ApplicationStatus } from '../../../contract/enums';
import type { MessageSenderType } from '../entities/message.entity';

/*
 * A UUID shape, not `@IsUUID()`: the house tenant's id (HOUSE_TENANT_ID,
 * src/contract/constants.ts) is a fixed, all-zero-version-nibble constant
 * that fails class-validator's strict version check — see
 * `admin-application.dto.ts`'s `tenantId` filter for the same reasoning.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['student', 'admin'] }) senderType!: MessageSenderType;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: string | null;
}

export class ConversationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() counterpartName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) lastMessage!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) lastMessageAt!: string | null;
  @ApiProperty() unreadCount!: number;
}

export class ConversationDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() counterpartName!: string;
  @ApiProperty({ type: [MessageDto] }) messages!: MessageDto[];
}

export class SendMessageDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) body!: string;
}

export class StartConversationDto extends SendMessageDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  adminId!: string;
}

export class AssignedAdminDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

export type ComposeScope = 'student' | 'tenant' | 'status' | 'all';
const COMPOSE_SCOPES: ComposeScope[] = ['student', 'tenant', 'status', 'all'];

export class ComposeMessageDto {
  @ApiProperty({ enum: COMPOSE_SCOPES })
  @IsString()
  @IsEnum(COMPOSE_SCOPES)
  scope!: ComposeScope;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Required when scope is "student".' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Required when scope is "tenant".' })
  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'tenantId must be a UUID' })
  tenantId?: string;

  @ApiPropertyOptional({
    enum: ApplicationStatus,
    enumName: 'ApplicationStatus',
    description: 'Required when scope is "status".',
  })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(4000) body!: string;
}

export class ComposeResultDto {
  @ApiProperty({ description: 'How many students this message was sent to.' })
  recipientCount!: number;
}
