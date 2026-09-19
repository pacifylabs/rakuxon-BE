import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Who sent a message — the conversation itself already pins exactly one student and one admin, so this alone disambiguates the sender. */
export type MessageSenderType = 'student' | 'admin';

@Entity('messages')
@ForeignKey('conversations', ['conversationId'], ['id'], {
  name: 'messages_conversationId_fkey',
  onDelete: 'CASCADE',
})
@Index('messages_conversation_idx', ['conversationId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  conversationId!: string;

  @Column({ type: 'text' })
  senderType!: MessageSenderType;

  @Column({ type: 'text' })
  body!: string;

  /** Set when the *other* participant reads it — never the sender's own read state. */
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
