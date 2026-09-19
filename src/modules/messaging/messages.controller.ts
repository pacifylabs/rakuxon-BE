import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AssignedAdminDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/message.dto';
import { MessagingService } from './messaging.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

/** A student's own threads with the admin(s) assigned to their applications. */
@ApiTags('messages')
@ApiBearerAuth('access-token')
@Controller('messages')
@Roles(Role.Student)
export class MessagesController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('conversations')
  @ApiOperation({ summary: "The caller's own conversations, most recently active first" })
  @ApiOkResponse({ type: [ConversationSummaryDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<ConversationSummaryDto[]> {
    return this.messaging.listForStudent(user);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One conversation, marking the other side read' })
  @ApiOkResponse({ type: ConversationDetailDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ConversationDetailDto> {
    return this.messaging.getForStudent(user, id);
  }

  @Post('conversations/:id/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reply on an existing conversation' })
  @ApiOkResponse({ type: ConversationDetailDto })
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<ConversationDetailDto> {
    return this.messaging.replyAsStudent(user, id, dto);
  }

  @Get('assigned-admins')
  @ApiOperation({ summary: 'Admins currently assigned across the caller\'s applications — who they can message' })
  @ApiOkResponse({ type: [AssignedAdminDto] })
  assignedAdmins(@CurrentUser() user: AuthenticatedUser): Promise<AssignedAdminDto[]> {
    return this.messaging.myAssignedAdmins(user);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start (or continue) a conversation with an admin currently assigned to one of your applications' })
  @ApiOkResponse({ type: ConversationDetailDto })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartConversationDto,
  ): Promise<ConversationDetailDto> {
    return this.messaging.startAsStudent(user, dto);
  }
}
