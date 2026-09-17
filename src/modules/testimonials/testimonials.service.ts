import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  AdminTestimonialDetailDto,
  AdminTestimonialListDto,
  AdminTestimonialSummaryDto,
  CreateTestimonialDto,
  ListAdminTestimonialsQueryDto,
  ListTestimonialsQueryDto,
  TestimonialDto,
  UpdateTestimonialDto,
} from './dto/testimonial.dto';
import { Testimonial } from './entities/testimonial.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import { PublishStatus } from '../../contract/enums';

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectRepository(Testimonial) private readonly testimonials: Repository<Testimonial>,
  ) {}

  /** Published only, ordered for display — the public-facing read. */
  async listPublished(query: ListTestimonialsQueryDto): Promise<TestimonialDto[]> {
    const builder = this.testimonials
      .createQueryBuilder('t')
      .where('t.status = :status', { status: PublishStatus.Published });

    if (query.placement) {
      builder.andWhere(':placement = ANY(t.placement)', { placement: query.placement });
    }

    const rows = await builder
      .orderBy('t.displayOrder', 'ASC')
      .take(query.limit ?? 6)
      .getMany();

    return rows.map((row) => this.toPublic(row));
  }

  async listAdmin(query: ListAdminTestimonialsQueryDto): Promise<AdminTestimonialListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.testimonials.createQueryBuilder('t');
    if (query.status) builder.andWhere('t.status = :status', { status: query.status });

    builder.orderBy('t.displayOrder', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getDetail(id: string): Promise<AdminTestimonialDetailDto> {
    const row = await this.findOrThrow(id);
    return this.toDetail(row);
  }

  async create(dto: CreateTestimonialDto): Promise<AdminTestimonialDetailDto> {
    this.assertConsentForPhoto(dto.photoUrl ?? null, dto.consentGiven ?? false);

    const saved = await this.testimonials.save(
      this.testimonials.create({
        quote: dto.quote,
        authorName: dto.authorName,
        detail: dto.detail,
        photoUrl: dto.photoUrl ?? null,
        consentGiven: dto.consentGiven ?? false,
        placement: dto.placement ?? [],
        displayOrder: dto.displayOrder ?? 0,
        status: PublishStatus.Draft,
      }),
    );

    return this.toDetail(saved);
  }

  async update(id: string, dto: UpdateTestimonialDto): Promise<AdminTestimonialDetailDto> {
    const row = await this.findOrThrow(id);
    const patch = definedEntries(dto);
    const merged = { ...row, ...patch };

    this.assertConsentForPhoto(merged.photoUrl, merged.consentGiven);

    const saved = await this.testimonials.save(merged);
    return this.toDetail(saved);
  }

  async setStatus(id: string, status: PublishStatus): Promise<AdminTestimonialSummaryDto> {
    const row = await this.findOrThrow(id);
    row.status = status;
    const saved = await this.testimonials.save(row);
    return this.toSummary(saved);
  }

  /**
   * A photo without consent is exactly the misrepresentation this table
   * exists to prevent — the database's check constraint is the backstop, this
   * is the readable error a caller actually sees instead of a raw constraint
   * violation.
   */
  private assertConsentForPhoto(photoUrl: string | null, consentGiven: boolean): void {
    if (photoUrl && !consentGiven) {
      throw new BadRequestException(
        'A photo cannot be attached without recording that the person consented to it.',
      );
    }
  }

  private async findOrThrow(id: string): Promise<Testimonial> {
    const row = await this.testimonials.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No testimonial with that id.');
    return row;
  }

  private toPublic(row: Testimonial): TestimonialDto {
    return {
      id: row.id,
      quote: row.quote,
      authorName: row.authorName,
      detail: row.detail,
      photoUrl: row.photoUrl,
    };
  }

  private toSummary(row: Testimonial): AdminTestimonialSummaryDto {
    return {
      id: row.id,
      authorName: row.authorName,
      detail: row.detail,
      hasPhoto: row.photoUrl !== null,
      status: row.status,
    };
  }

  private toDetail(row: Testimonial): AdminTestimonialDetailDto {
    return {
      id: row.id,
      quote: row.quote,
      authorName: row.authorName,
      detail: row.detail,
      photoUrl: row.photoUrl,
      consentGiven: row.consentGiven,
      placement: row.placement,
      status: row.status,
      displayOrder: row.displayOrder,
    };
  }
}
