import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { AuditLogEntryDto, ListAuditLogQueryDto } from './dto/audit-log.dto';
import type { AuditActorType } from './entities/audit-log.entity';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  description: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  async record(entry: RecordAuditEntry): Promise<void> {
    await this.logs.save(
      this.logs.create({
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        description: entry.description,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata ?? {},
      }),
    );
  }

  /** Platform-wide — every actor, every resource. Gated by `platform.audit`. */
  async listPlatform(query: ListAuditLogQueryDto): Promise<Paged<AuditLogEntryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const builder = this.logs.createQueryBuilder('l');
    if (query.actorType) builder.andWhere('l."actorType" = :actorType', { actorType: query.actorType });
    if (query.resourceType) builder.andWhere('l."resourceType" = :resourceType', { resourceType: query.resourceType });

    builder.orderBy('l."createdAt"', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();
    return { items: rows.map((row) => this.toDto(row)), total, page, pageCount: Math.max(1, Math.ceil(total / limit)) };
  }

  /** One resource's own history — whatever permission already lets the caller view that resource is the gate. */
  async listForResource(resourceType: string, resourceId: string): Promise<AuditLogEntryDto[]> {
    const rows = await this.logs.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: AuditLog): AuditLogEntryDto {
    return {
      id: row.id,
      actorType: row.actorType,
      actorId: row.actorId,
      actorName: row.actorName,
      action: row.action,
      description: row.description,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
