import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  ComposeMessageDto,
  ComposeResultDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  SendMessageDto,
} from './dto/message.dto';
import { MessagingService } from './messaging.service';
import { AdminJwtAuthGuard } from '../../common/auth/admin-jwt-auth.guard';
import { CurrentAdmin } from '../../common/auth/current-admin.decorator';
import { Public } from '../../common/auth/public.decorator';
import { PermissionGuard } from '../../common/rbac/permission.guard';
import { RequirePermission } from '../../common/rbac/require-permission.decorator';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';

/**
 * List, get and reply act on the caller's own conversations — being a
 * signed-in admin who is that conversation's assigned admin is the only gate
 * that makes sense, the same reasoning as `AdminNotificationsController`.
 * Only `compose` (starting a broadcast to students who have not written in)
 * needs `messaging.manage`.
 */
@ApiTags('admin-messages')
@Controller('admin/messages')
@Public()
@UseGuards(AdminJwtAuthGuard, PermissionGuard)
@ApiBearerAuth('admin-access-token')
export class AdminMessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('conversations')
  @ApiOperation({ summary: "The caller's own conversations, most recently active first" })
  @ApiOkResponse({ type: [ConversationSummaryDto] })
  list(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<ConversationSummaryDto[]> {
    return this.messaging.listForAdmin(admin);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation, marking the student\'s messages read' })
  @ApiOkResponse({ type: ConversationDetailDto })
  get(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
  ): Promise<ConversationDetailDto> {
    return this.messaging.getForAdmin(admin, id);
  }

  @Post('conversations/:id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply on an existing conversation' })
  @ApiOkResponse({ type: ConversationDetailDto })
  reply(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<ConversationDetailDto> {
    return this.messaging.replyAsAdmin(admin, id, dto);
  }

  @Post('compose')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('messaging.manage')
  @ApiOperation({
    summary: 'Send one message to a targeted or broadcast audience of students',
    description: 'Fans out into one private conversation per recipient — sent once, immediately, to whoever the scope resolves to right now.',
  })
  @ApiOkResponse({ type: ComposeResultDto })
  compose(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ComposeMessageDto,
  ): Promise<ComposeResultDto> {
    return this.messaging.compose(admin, dto);
  }
}
