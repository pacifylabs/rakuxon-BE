import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import {
  AssignedAdminDto,
  ComposeMessageDto,
  ComposeResultDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/message.dto';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import type { MessageSenderType } from './entities/message.entity';
import { Admin } from '../admins/entities/admin.entity';
import { ENV } from '../../common/config/config.module';
import { appUrlForRole } from '../../common/config/env.schema';
import type { Env } from '../../common/config/env.schema';
import { NOTIFICATION_PORT } from '../../common/notifications/notification.port';
import type { NotificationPort } from '../../common/notifications/notification.port';
import { NotificationTemplatesService } from '../notification-templates/notification-templates.service';
import { NotificationsInboxService } from '../notifications-inbox/notifications-inbox.service';
import { isOnline } from '../../common/presence/presence';
import { Role } from '../../contract/enums';
import { Student } from '../students/entities/student.entity';
import { StudentsService } from '../students/students.service';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

const PREVIEW_LENGTH = 140;

@Injectable()
export class MessagingService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    private readonly students: StudentsService,
    private readonly inbox: NotificationsInboxService,
    private readonly templates: NotificationTemplatesService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /* -------------------------------------------------------------- student */

  async listForStudent(user: AuthenticatedUser): Promise<ConversationSummaryDto[]> {
    const student = await this.students.getOwnProfile(user);
    const rows = await this.conversations.find({ where: { studentId: student.id }, order: { updatedAt: 'DESC' } });
    return this.toSummaries(rows, 'student');
  }

  async getForStudent(user: AuthenticatedUser, conversationId: string): Promise<ConversationDetailDto> {
    const student = await this.students.getOwnProfile(user);
    const conversation = await this.ownedByStudent(conversationId, student.id);
    return this.detail(conversation, 'student');
  }

  /** Every admin currently assigned across the student's own applications — who they're allowed to start a thread with. */
  async myAssignedAdmins(user: AuthenticatedUser): Promise<AssignedAdminDto[]> {
    const student = await this.students.getOwnProfile(user);
    const rows = await this.conversations.manager.query<
      { id: string; firstName: string; lastName: string; lastSeenAt: Date | null }[]
    >(
      `SELECT DISTINCT a.id, a."firstName", a."lastName", a."lastSeenAt"
         FROM applications app
         JOIN admins a ON a.id = app."assignedAdminId"
        WHERE app."studentId" = $1 AND app."assignedAdminId" IS NOT NULL
        ORDER BY a."firstName"`,
      [student.id],
    );
    return rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      online: isOnline(row.lastSeenAt ? new Date(row.lastSeenAt) : null),
    }));
  }

  async startAsStudent(user: AuthenticatedUser, dto: StartConversationDto): Promise<ConversationDetailDto> {
    const student = await this.students.getOwnProfile(user);
    const eligible = await this.myAssignedAdmins(user);
    if (!eligible.some((admin) => admin.id === dto.adminId)) {
      throw new ForbiddenException(
        'You can only message an admin currently assigned to one of your applications.',
      );
    }

    const conversation = await this.findOrCreateConversation(student.id, dto.adminId);
    await this.appendMessage(conversation, 'student', dto.body);
    return this.detail(conversation, 'student');
  }

  async replyAsStudent(
    user: AuthenticatedUser,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<ConversationDetailDto> {
    const student = await this.students.getOwnProfile(user);
    const conversation = await this.ownedByStudent(conversationId, student.id);
    await this.appendMessage(conversation, 'student', dto.body);
    return this.detail(conversation, 'student');
  }

  /* ---------------------------------------------------------------- admin */

  async listForAdmin(admin: AuthenticatedAdmin): Promise<ConversationSummaryDto[]> {
    const rows = await this.conversations.find({ where: { adminId: admin.id }, order: { updatedAt: 'DESC' } });
    return this.toSummaries(rows, 'admin');
  }

  async getForAdmin(admin: AuthenticatedAdmin, conversationId: string): Promise<ConversationDetailDto> {
    const conversation = await this.ownedByAdmin(conversationId, admin.id);
    return this.detail(conversation, 'admin');
  }

  async replyAsAdmin(
    admin: AuthenticatedAdmin,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<ConversationDetailDto> {
    const conversation = await this.ownedByAdmin(conversationId, admin.id);
    await this.appendMessage(conversation, 'admin', dto.body);
    return this.detail(conversation, 'admin');
  }

  /**
   * "Once and for all" — one message, fanned out to every student the scope
   * resolves to, each as its own private thread. Not idempotent by design: a
   * second call with the same scope sends a second round of messages.
   */
  async compose(admin: AuthenticatedAdmin, dto: ComposeMessageDto): Promise<ComposeResultDto> {
    const studentIds = await this.resolveRecipients(dto);
    for (const studentId of studentIds) {
      const conversation = await this.findOrCreateConversation(studentId, admin.id);
      await this.appendMessage(conversation, 'admin', dto.body);
    }
    return { recipientCount: studentIds.length };
  }

  /* --------------------------------------------------------------- shared */

  private async resolveRecipients(dto: ComposeMessageDto): Promise<string[]> {
    switch (dto.scope) {
      case 'student': {
        if (!dto.studentId) throw new BadRequestException('studentId is required for scope "student".');
        const exists = await this.conversations.manager.existsBy(Student, { id: dto.studentId });
        if (!exists) throw new NotFoundException('No student with that id.');
        return [dto.studentId];
      }
      case 'tenant': {
        if (!dto.tenantId) throw new BadRequestException('tenantId is required for scope "tenant".');
        const rows = await this.conversations.manager.find(Student, {
          where: { tenantId: dto.tenantId },
          select: ['id'],
        });
        return rows.map((row) => row.id);
      }
      case 'status': {
        if (!dto.status) throw new BadRequestException('status is required for scope "status".');
        const rows = await this.conversations.manager.query<{ id: string }[]>(
          `SELECT DISTINCT s.id FROM students s JOIN applications app ON app."studentId" = s.id WHERE app.status = $1`,
          [dto.status],
        );
        return rows.map((row) => row.id);
      }
      case 'all': {
        const rows = await this.conversations.manager.find(Student, { select: ['id'] });
        return rows.map((row) => row.id);
      }
    }
  }

  private async findOrCreateConversation(studentId: string, adminId: string): Promise<Conversation> {
    const existing = await this.conversations.findOne({ where: { studentId, adminId } });
    if (existing) return existing;

    try {
      return await this.conversations.save(this.conversations.create({ studentId, adminId }));
    } catch (error) {
      /* Lost a create race to a concurrent request — the unique index on
         (studentId, adminId) is the real guard, this just recovers the row it kept. */
      const recovered = await this.conversations.findOne({ where: { studentId, adminId } });
      if (recovered) return recovered;
      throw error;
    }
  }

  private async appendMessage(
    conversation: Conversation,
    senderType: MessageSenderType,
    body: string,
  ): Promise<Message> {
    const message = await this.messages.save(
      this.messages.create({ conversationId: conversation.id, senderType, body }),
    );
    await this.conversations.update(conversation.id, { updatedAt: new Date() });
    await this.notifyNewMessage(conversation, senderType, body);
    return message;
  }

  /** In-app + best-effort email to whichever participant did not just send this message. */
  private async notifyNewMessage(
    conversation: Conversation,
    senderType: MessageSenderType,
    body: string,
  ): Promise<void> {
    const preview = body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}…` : body;
    const link = `/dashboard/messages/${conversation.id}`;

    const [studentDetail, admin] = await Promise.all([
      this.students.getAdminDetail(conversation.studentId),
      this.conversations.manager.findOne(Admin, { where: { id: conversation.adminId } }),
    ]);
    if (!admin) return;

    const email = senderType === 'admin' ? studentDetail.email : admin.email;
    const fromName = senderType === 'admin' ? `${admin.firstName} ${admin.lastName}` : studentDetail.fullName;
    const reviewUrl =
      senderType === 'admin'
        ? `${appUrlForRole(this.env, Role.Student)}${link}`
        : `${appUrlForRole(this.env, Role.PlatformAdmin)}${link}`;

    const inApp = await this.templates.renderInApp('new_message', { fromName, preview, reviewUrl }, () => ({
      title: `New message from ${fromName}`,
      body: preview,
    }));

    if (senderType === 'admin') {
      await this.inbox.create({
        userId: studentDetail.userId,
        type: 'new_message',
        title: inApp.title,
        body: inApp.body,
        link,
      });
    } else {
      await this.inbox.create({
        adminId: admin.id,
        type: 'new_message',
        title: inApp.title,
        body: inApp.body,
        link,
      });
    }

    try {
      await this.notifications.sendNewMessage({ to: email, fromName, preview, reviewUrl });
    } catch (error) {
      this.logger.warn(`Could not send new-message email to ${email}: ${String(error)}`);
    }
  }

  private async ownedByStudent(conversationId: string, studentId: string): Promise<Conversation> {
    const conversation = await this.conversations.findOne({ where: { id: conversationId } });
    if (!conversation || conversation.studentId !== studentId) {
      throw new NotFoundException('No conversation with that id.');
    }
    return conversation;
  }

  private async ownedByAdmin(conversationId: string, adminId: string): Promise<Conversation> {
    const conversation = await this.conversations.findOne({ where: { id: conversationId } });
    if (!conversation || conversation.adminId !== adminId) {
      throw new NotFoundException('No conversation with that id.');
    }
    return conversation;
  }

  private async counterpartInfo(
    rows: Conversation[],
    viewer: 'student' | 'admin',
  ): Promise<Map<string, { name: string; online: boolean }>> {
    if (viewer === 'student') {
      const adminIds = [...new Set(rows.map((row) => row.adminId))];
      const admins = await this.conversations.manager.findBy(Admin, { id: In(adminIds) });
      const infoByAdminId = new Map(
        admins.map((admin) => [
          admin.id,
          { name: `${admin.firstName} ${admin.lastName}`, online: isOnline(admin.lastSeenAt) },
        ]),
      );
      return new Map(
        rows.map((row) => [row.id, infoByAdminId.get(row.adminId) ?? { name: 'Admin', online: false }]),
      );
    }

    const studentIds = [...new Set(rows.map((row) => row.studentId))];
    const [summaries, presenceRows] = await Promise.all([
      this.students.getSummariesForAdmin(studentIds),
      this.conversations.manager.query<{ id: string; lastSeenAt: Date | null }[]>(
        `SELECT s.id, u."lastSeenAt" FROM students s JOIN users u ON u.id = s."userId" WHERE s.id = ANY($1)`,
        [studentIds],
      ),
    ]);
    const onlineByStudentId = new Map(
      presenceRows.map((row) => [row.id, isOnline(row.lastSeenAt ? new Date(row.lastSeenAt) : null)]),
    );

    return new Map(
      rows.map((row) => [
        row.id,
        {
          name: summaries.get(row.studentId)?.fullName ?? 'Student',
          online: onlineByStudentId.get(row.studentId) ?? false,
        },
      ]),
    );
  }

  private async toSummaries(rows: Conversation[], viewer: 'student' | 'admin'): Promise<ConversationSummaryDto[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const otherType: MessageSenderType = viewer === 'student' ? 'admin' : 'student';

    const [counterparts, lastMessages, unreadRows] = await Promise.all([
      this.counterpartInfo(rows, viewer),
      this.conversations.manager.query<{ conversationId: string; body: string; createdAt: Date }[]>(
        `SELECT DISTINCT ON ("conversationId") "conversationId", body, "createdAt"
           FROM messages WHERE "conversationId" = ANY($1)
          ORDER BY "conversationId", "createdAt" DESC`,
        [ids],
      ),
      this.conversations.manager.query<{ conversationId: string; count: string }[]>(
        `SELECT "conversationId", COUNT(*) AS count FROM messages
          WHERE "conversationId" = ANY($1) AND "senderType" = $2 AND "readAt" IS NULL
          GROUP BY "conversationId"`,
        [ids, otherType],
      ),
    ]);

    const lastByConversation = new Map(lastMessages.map((row) => [row.conversationId, row]));
    const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, Number(row.count)]));

    return rows.map((row) => {
      const last = lastByConversation.get(row.id);
      const counterpart = counterparts.get(row.id);
      return {
        id: row.id,
        counterpartName: counterpart?.name ?? 'Unknown',
        counterpartOnline: counterpart?.online ?? false,
        lastMessage: last?.body ?? null,
        lastMessageAt: last ? new Date(last.createdAt).toISOString() : null,
        unreadCount: unreadByConversation.get(row.id) ?? 0,
      };
    });
  }

  private async detail(conversation: Conversation, viewer: 'student' | 'admin'): Promise<ConversationDetailDto> {
    const otherType: MessageSenderType = viewer === 'student' ? 'admin' : 'student';

    await this.messages.update(
      { conversationId: conversation.id, senderType: otherType, readAt: IsNull() },
      { readAt: new Date() },
    );

    const [messages, counterparts] = await Promise.all([
      this.messages.find({ where: { conversationId: conversation.id }, order: { createdAt: 'ASC' } }),
      this.counterpartInfo([conversation], viewer),
    ]);
    const counterpart = counterparts.get(conversation.id);

    return {
      id: conversation.id,
      counterpartName: counterpart?.name ?? (viewer === 'student' ? 'Admin' : 'Student'),
      counterpartOnline: counterpart?.online ?? false,
      messages: messages.map((message) => ({
        id: message.id,
        senderType: message.senderType,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt ? message.readAt.toISOString() : null,
      })),
    };
  }
}
