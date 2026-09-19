import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminMessagesController } from './admin-messages.controller';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessagesController } from './messages.controller';
import { MessagingService } from './messaging.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsInboxModule } from '../notifications-inbox/notifications-inbox.module';
import { NotificationTemplatesModule } from '../notification-templates/notification-templates.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    StudentsModule,
    NotificationsInboxModule,
    NotificationTemplatesModule,
    AdminAuthModule,
  ],
  controllers: [MessagesController, AdminMessagesController],
  providers: [MessagingService],
})
export class MessagingModule {}
