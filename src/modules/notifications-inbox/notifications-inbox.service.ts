import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Notification } from './entities/notification.entity';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

export interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

/**
 * The in-app inbox — distinct from `src/common/notifications/`, which is the
 * *email* port. This is the feature a bell icon reads from; that is the
 * channel it sometimes rides alongside.
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
        userId: input.userId,
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

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }

    return notification;
  }
}
