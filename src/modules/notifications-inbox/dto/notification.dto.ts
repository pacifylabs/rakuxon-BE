import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, nullable: true }) link!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class UnreadCountDto {
  @ApiProperty() count!: number;
}
