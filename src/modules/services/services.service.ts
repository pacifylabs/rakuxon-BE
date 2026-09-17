import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AdminServiceDetailDto,
  AdminServiceListDto,
  AdminServiceSummaryDto,
  CreateServiceDto,
  ListAdminServicesQueryDto,
  ServiceDto,
  UpdateServiceDto,
} from './dto/service.dto';
import { Service } from './entities/service.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import { PublishStatus } from '../../contract/enums';

@Injectable()
export class ServicesService {
  constructor(@InjectRepository(Service) private readonly services: Repository<Service>) {}

  /** Published only, ordered for display — the public-facing list read. */
  async listPublished(): Promise<ServiceDto[]> {
    const rows = await this.services.find({
      where: { status: PublishStatus.Published },
      order: { displayOrder: 'ASC' },
    });

    return rows.map((row) => this.toPublic(row));
  }

  async getPublishedBySlug(slug: string): Promise<ServiceDto> {
    const row = await this.services.findOne({ where: { slug, status: PublishStatus.Published } });
    if (!row) throw new NotFoundException('No published service with that slug.');
    return this.toPublic(row);
  }

  async listAdmin(query: ListAdminServicesQueryDto): Promise<AdminServiceListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.services.createQueryBuilder('s');
    if (query.status) builder.andWhere('s.status = :status', { status: query.status });

    builder.orderBy('s.displayOrder', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getDetail(id: string): Promise<AdminServiceDetailDto> {
    const row = await this.findOrThrow(id);
    return this.toDetail(row);
  }

  async create(dto: CreateServiceDto): Promise<AdminServiceDetailDto> {
    const saved = await this.services.save(
      this.services.create({
        slug: dto.slug,
        iconName: dto.iconName,
        title: dto.title,
        summary: dto.summary,
        description: dto.description,
        strand: dto.strand,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        whatsIncluded: dto.whatsIncluded ?? [],
        faqs: dto.faqs ?? [],
        relatedArticleSlugs: dto.relatedArticleSlugs ?? null,
        displayOrder: dto.displayOrder ?? 0,
        status: PublishStatus.Draft,
      }),
    );

    return this.toDetail(saved);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<AdminServiceDetailDto> {
    const row = await this.findOrThrow(id);
    const patch = definedEntries(dto);
    const merged = { ...row, ...patch };

    const saved = await this.services.save(merged);
    return this.toDetail(saved);
  }

  async setStatus(id: string, status: PublishStatus): Promise<AdminServiceSummaryDto> {
    const row = await this.findOrThrow(id);
    row.status = status;
    const saved = await this.services.save(row);
    return this.toSummary(saved);
  }

  private async findOrThrow(id: string): Promise<Service> {
    const row = await this.services.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No service with that id.');
    return row;
  }

  private toPublic(row: Service): ServiceDto {
    return {
      id: row.id,
      slug: row.slug,
      iconName: row.iconName,
      title: row.title,
      summary: row.summary,
      description: row.description,
      strand: row.strand,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      whatsIncluded: row.whatsIncluded,
      faqs: row.faqs,
      relatedArticleSlugs: row.relatedArticleSlugs,
    };
  }

  private toSummary(row: Service): AdminServiceSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      strand: row.strand,
      status: row.status,
    };
  }

  private toDetail(row: Service): AdminServiceDetailDto {
    return {
      ...this.toPublic(row),
      status: row.status,
      displayOrder: row.displayOrder,
    };
  }
}
