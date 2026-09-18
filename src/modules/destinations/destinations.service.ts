import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AdminDestinationDetailDto,
  AdminDestinationListDto,
  AdminDestinationSummaryDto,
  CreateDestinationDto,
  DestinationCardDto,
  DestinationDto,
  ListAdminDestinationsQueryDto,
  UpdateDestinationDto,
} from './dto/destination.dto';
import { Destination } from './entities/destination.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import { PublishStatus } from '../../contract/enums';

@Injectable()
export class DestinationsService {
  constructor(
    @InjectRepository(Destination) private readonly destinations: Repository<Destination>,
  ) {}

  /** Published only, ordered for display — /destinations' card grid. */
  async listPublished(): Promise<DestinationCardDto[]> {
    const rows = await this.destinations.find({
      where: { status: PublishStatus.Published },
      order: { displayOrder: 'ASC' },
    });
    return rows.map((row) => this.toCard(row));
  }

  /** One published guide, by slug — /destinations/[slug]. Not found if unpublished, same as if it never existed. */
  async getPublishedBySlug(slug: string): Promise<DestinationDto> {
    const row = await this.destinations.findOne({ where: { slug, status: PublishStatus.Published } });
    if (!row) throw new NotFoundException('No destination guide with that slug.');
    return this.toPublic(row);
  }

  async listAdmin(query: ListAdminDestinationsQueryDto): Promise<AdminDestinationListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.destinations.createQueryBuilder('d');
    if (query.status) builder.andWhere('d.status = :status', { status: query.status });

    builder.orderBy('d.displayOrder', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getDetail(id: string): Promise<AdminDestinationDetailDto> {
    return this.toDetail(await this.findOrThrow(id));
  }

  async create(dto: CreateDestinationDto): Promise<AdminDestinationDetailDto> {
    const slug = dto.slug.toLowerCase();
    if (await this.destinations.exist({ where: { slug } })) {
      throw new ConflictException('A destination with that slug already exists.');
    }

    const saved = await this.destinations.save(
      this.destinations.create({
        slug,
        name: dto.name,
        shortName: dto.shortName,
        tagline: dto.tagline,
        intro: dto.intro,
        whyHeading: dto.whyHeading,
        why: dto.why,
        status: PublishStatus.Draft,
      }),
    );

    return this.toDetail(saved);
  }

  async update(id: string, dto: UpdateDestinationDto): Promise<AdminDestinationDetailDto> {
    const row = await this.findOrThrow(id);

    if (dto.slug !== undefined) {
      const slug = dto.slug.toLowerCase();
      if (slug !== row.slug && (await this.destinations.exist({ where: { slug } }))) {
        throw new ConflictException('A destination with that slug already exists.');
      }
      dto.slug = slug;
    }

    const merged = { ...row, ...definedEntries(dto) };
    const saved = await this.destinations.save(merged);
    return this.toDetail(saved);
  }

  async setStatus(id: string, status: PublishStatus): Promise<AdminDestinationSummaryDto> {
    const row = await this.findOrThrow(id);
    row.status = status;
    const saved = await this.destinations.save(row);
    return this.toSummary(saved);
  }

  private async findOrThrow(id: string): Promise<Destination> {
    const row = await this.destinations.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No destination with that id.');
    return row;
  }

  private toCard(row: Destination): DestinationCardDto {
    return {
      slug: row.slug,
      shortName: row.shortName,
      cardImageUrl: row.cardImageUrl,
      cardImageAlt: row.cardImageAlt,
      tagline: row.tagline,
    };
  }

  private toPublic(row: Destination): DestinationDto {
    return {
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      cardImageUrl: row.cardImageUrl,
      cardImageAlt: row.cardImageAlt,
      heroImageUrl: row.heroImageUrl,
      heroImageAlt: row.heroImageAlt,
      tagline: row.tagline,
      intro: row.intro,
      whyHeading: row.whyHeading,
      why: row.why,
      whyPoints: row.whyPoints,
      facts: row.facts,
      universities: row.universities,
      helpPoints: row.helpPoints,
    };
  }

  private toSummary(row: Destination): AdminDestinationSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      shortName: row.shortName,
      tagline: row.tagline,
      status: row.status,
      displayOrder: row.displayOrder,
    };
  }

  private toDetail(row: Destination): AdminDestinationDetailDto {
    return {
      id: row.id,
      ...this.toPublic(row),
      status: row.status,
      displayOrder: row.displayOrder,
    };
  }
}
