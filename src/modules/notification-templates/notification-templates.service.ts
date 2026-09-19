import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  NotificationTemplateDetailDto,
  NotificationTemplatePreviewDto,
  NotificationTemplateSummaryDto,
  PreviewNotificationTemplateDto,
  UpdateNotificationTemplateDto,
} from './dto/notification-template.dto';
import { NotificationTemplate } from './entities/notification-template.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import { interpolate } from '../../common/notifications/interpolate';
import type { InAppContent, NotificationTemplateRenderer } from '../../common/notifications/notification.port';
import { renderLayout } from '../../common/notifications/templates/layout';
import type { EmailContent } from '../../common/notifications/templates/layout';

/**
 * The `{{tokens}}` each key's call site actually fills in, with one
 * realistic value per token — doubles as the editor's "available tokens"
 * hint and the data the live preview pane renders against, since there is
 * no real submitted application or admin session to render a preview from.
 */
const SAMPLE_CONTEXT: Record<string, Record<string, string>> = {
  password_reset: {
    resetUrl: 'https://admin.rakuxon.com/auth/reset-password/sample-token',
    expiresIn: 'in about an hour',
  },
  email_verification: {
    verifyUrl: 'https://app.rakuxon.com/auth/verify-email/sample-token',
    expiresIn: 'in about a day',
  },
  document_rejected: {
    documentType: 'passport',
    reason: 'The scan is illegible',
    reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
  },
  document_approved: {
    documentType: 'passport',
    reviewUrl: 'https://app.rakuxon.com/dashboard/documents',
  },
  application_submitted: {
    courseName: 'BSc Computer Science',
    institutionName: 'Example University',
    reviewUrl: 'https://app.rakuxon.com/dashboard/applications/sample-id',
  },
  case_assigned: {
    studentName: 'Ada Lovelace',
    courseName: 'BSc Computer Science',
    institutionName: 'Example University',
    reviewUrl: 'https://admin.rakuxon.com/dashboard/applications/sample-id',
  },
};

@Injectable()
export class NotificationTemplatesService implements NotificationTemplateRenderer {
  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templates: Repository<NotificationTemplate>,
  ) {}

  async listAdmin(): Promise<NotificationTemplateSummaryDto[]> {
    const rows = await this.templates.find({ order: { key: 'ASC' } });
    return rows.map((row) => this.toSummary(row));
  }

  async getDetail(id: string): Promise<NotificationTemplateDetailDto> {
    const row = await this.findOrThrow(id);
    return this.toDetail(row);
  }

  async update(id: string, dto: UpdateNotificationTemplateDto): Promise<NotificationTemplateDetailDto> {
    const row = await this.findOrThrow(id);
    const patch = definedEntries(dto);
    const saved = await this.templates.save({ ...row, ...patch });
    return this.toDetail(saved);
  }

  /** Renders the editor's in-progress, not-yet-saved fields against that key's sample data. */
  async preview(id: string, dto: PreviewNotificationTemplateDto): Promise<NotificationTemplatePreviewDto> {
    const row = await this.findOrThrow(id);
    const context = SAMPLE_CONTEXT[row.key] ?? {};
    const rendered = this.render(dto, context);

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      inAppTitle: rendered.heading,
      inAppBody: rendered.paragraphs[0] ?? '',
    };
  }

  /** DB-first email rendering — `fallback()` runs only when the row is missing, disabled, or scoped to `in_app` only. */
  async renderEmail(
    key: string,
    context: Record<string, string>,
    fallback: () => EmailContent,
  ): Promise<EmailContent> {
    const row = await this.templates.findOne({ where: { key, enabled: true } });
    if (!row || row.channel === 'in_app') return fallback();

    const rendered = this.render(row, context);
    return { subject: rendered.subject, html: rendered.html, text: rendered.text };
  }

  /** DB-first in-app rendering — only the heading and the first paragraph ever reach the bell, same as the hardcoded copy it replaces. */
  async renderInApp(
    key: string,
    context: Record<string, string>,
    fallback: () => InAppContent,
  ): Promise<InAppContent> {
    const row = await this.templates.findOne({ where: { key, enabled: true } });
    if (!row || row.channel === 'email') return fallback();

    return {
      title: interpolate(row.heading, context),
      body: interpolate(row.body[0] ?? '', context),
    };
  }

  private render(
    fields: { subject?: string | null; heading: string; body: string[]; ctaLabel?: string | null; ctaUrl?: string | null; footnote?: string | null },
    context: Record<string, string>,
  ): EmailContent & { heading: string; paragraphs: string[] } {
    const subject = fields.subject ? interpolate(fields.subject, context) : '';
    const heading = interpolate(fields.heading, context);
    const paragraphs = fields.body.map((paragraph) => interpolate(paragraph, context));
    const cta =
      fields.ctaLabel && fields.ctaUrl
        ? { label: interpolate(fields.ctaLabel, context), url: interpolate(fields.ctaUrl, context) }
        : undefined;
    const footnote = fields.footnote ? interpolate(fields.footnote, context) : undefined;

    const { html, text } = renderLayout({ preheader: heading, heading, paragraphs, cta, footnote });
    return { subject, html, text, heading, paragraphs };
  }

  private async findOrThrow(id: string): Promise<NotificationTemplate> {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No notification template with that id.');
    return row;
  }

  private toSummary(row: NotificationTemplate): NotificationTemplateSummaryDto {
    return { id: row.id, key: row.key, channel: row.channel, heading: row.heading, enabled: row.enabled };
  }

  private toDetail(row: NotificationTemplate): NotificationTemplateDetailDto {
    return {
      id: row.id,
      key: row.key,
      channel: row.channel,
      subject: row.subject,
      heading: row.heading,
      body: row.body,
      ctaLabel: row.ctaLabel,
      ctaUrl: row.ctaUrl,
      footnote: row.footnote,
      enabled: row.enabled,
      availableTokens: Object.keys(SAMPLE_CONTEXT[row.key] ?? {}),
    };
  }
}
