import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Notification } from './entities/notification.entity';
import type { AuthenticatedAdmin } from '../../common/auth/authenticated-admin-request';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

interface BaseNotification {
  type: string;
  title: string;
  body: string;
  link?: string;
}

/** Exactly one recipient — the student's `users.id`, or an admin's `admins.id`. */
export type CreateNotification =
  | (BaseNotification & { userId: string; adminId?: never })
  | (BaseNotification & { adminId: string; userId?: never });

/**
 * The in-app inbox — distinct from `src/common/notifications/`, which is the
 * *email* port. This is the feature a bell icon reads from; that is the
 * channel it sometimes rides alongside.
 *
 * A student and an admin are two different identity systems, so this reads
 * as two parallel sets of methods rather than one generic "current person" —
 * the alternative (a union `AuthenticatedUser | AuthenticatedAdmin` param)
 * would only push the branching into every call site instead of here.
 */
@Injectable()
export class NotificationsInboxService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  /** Not exposed publicly — called by whichever service caused the event (e.g. a document rejection). */
  async create(input: CreateNotification): Promise<Notification> {
    return this.notifications.save(
      this.notifications.create({
        userId: input.userId ?? null,
        adminId: input.adminId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      }),
    );
  }

  async listOwn(user: AuthenticatedUser): Promise<Notification[]> {
    return this.notifications.find({ where: { userId: user.id }, order: { createdAt: 'DESC' } });
  }

  async unreadCount(user: AuthenticatedUser): Promise<number> {
    return this.notifications.count({ where: { userId: user.id, readAt: IsNull() } });
  }

  async markRead(user: AuthenticatedUser, id: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id } });
    if (!notification || notification.userId !== user.id) {
      throw new NotFoundException('No notification with that id.');
    }

    return this.markReadRow(notification);
  }

  async listOwnAdmin(admin: AuthenticatedAdmin): Promise<Notification[]> {
    return this.notifications.find({ where: { adminId: admin.id }, order: { createdAt: 'DESC' } });
  }

  async unreadCountAdmin(admin: AuthenticatedAdmin): Promise<number> {
    return this.notifications.count({ where: { adminId: admin.id, readAt: IsNull() } });
  }

  async markReadAdmin(admin: AuthenticatedAdmin, id: string): Promise<Notification> {
    const notification = await this.notifications.findOne({ where: { id } });
    if (!notification || notification.adminId !== admin.id) {
      throw new NotFoundException('No notification with that id.');
    }

    return this.markReadRow(notification);
  }

  private async markReadRow(notification: Notification): Promise<Notification> {
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }

    return notification;
  }
}
