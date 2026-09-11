import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import {
  AdminArticleDetailDto,
  AdminArticleSummaryDto,
  AdminCountryDto,
  AdminCourseDetailDto,
  AdminCourseSummaryDto,
  AdminInstitutionDetailDto,
  AdminInstitutionSummaryDto,
  CreateArticleDto,
  CreateCourseDto,
  CreateInstitutionDto,
  ListAdminArticlesQueryDto,
  ListAdminCoursesQueryDto,
  ListAdminInstitutionsQueryDto,
  UpdateArticleDto,
  UpdateCourseDto,
  UpdateInstitutionDto,
} from './dto/admin-catalogue.dto';
import { definedEntries } from '../../common/utils/defined-entries';
import { Article } from './entities/article.entity';
import { Country } from './entities/country.entity';
import { Course } from './entities/course.entity';
import { Institution } from './entities/institution.entity';
import { PublishStatus } from '../../contract/enums';

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Catalogue moderation and authoring for admins — list (including drafts and
 * suspended records, which the public CatalogueService never returns),
 * status transitions, field-level create/update, and the countries reference
 * list. Deliberately its own service rather than added to CatalogueService:
 * that service's entire contract is "published-only, no auth," and mixing
 * admin's unscoped queries into it would blur that.
 */
@Injectable()
export class AdminCatalogueService {
  constructor(
    @InjectRepository(Institution) private readonly institutions: Repository<Institution>,
    @InjectRepository(Course) private readonly courses: Repository<Course>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Country) private readonly countries: Repository<Country>,
  ) {}

  async listInstitutions(query: ListAdminInstitutionsQueryDto): Promise<Paged<AdminInstitutionSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.institutions.createQueryBuilder('i');
    if (query.status) builder.andWhere('i.status = :status', { status: query.status });
    if (query.country) builder.andWhere('i.countryCode = :country', { country: query.country });
    if (query.q?.trim()) builder.andWhere('i.name ILIKE :term', { term: `%${query.q.trim()}%` });

    builder.orderBy('i.name', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        countryCode: row.countryCode,
        status: row.status,
      })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getInstitution(id: string): Promise<AdminInstitutionSummaryDto> {
    const row = await this.institutions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No institution with that id.');
    return { id: row.id, slug: row.slug, name: row.name, countryCode: row.countryCode, status: row.status };
  }

  async setInstitutionStatus(id: string, status: PublishStatus): Promise<AdminInstitutionSummaryDto> {
    const row = await this.institutions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No institution with that id.');
    row.status = status;
    const saved = await this.institutions.save(row);
    return { id: saved.id, slug: saved.slug, name: saved.name, countryCode: saved.countryCode, status: saved.status };
  }

  async getInstitutionDetail(id: string): Promise<AdminInstitutionDetailDto> {
    const row = await this.institutions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No institution with that id.');
    return this.toInstitutionDetail(row);
  }

  async updateInstitution(id: string, dto: UpdateInstitutionDto): Promise<AdminInstitutionDetailDto> {
    const row = await this.institutions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No institution with that id.');

    if (dto.slug && dto.slug !== row.slug && (await this.institutions.exist({ where: { slug: dto.slug } }))) {
      throw new ConflictException('That slug is already taken.');
    }

    const merged = { ...row, ...definedEntries(dto) };
    const saved = await this.institutions.save(merged);
    return this.toInstitutionDetail(saved);
  }

  async createInstitution(dto: CreateInstitutionDto): Promise<AdminInstitutionDetailDto> {
    if (await this.institutions.exist({ where: { slug: dto.slug } })) {
      throw new ConflictException('That slug is already taken.');
    }

    const saved = await this.institutions.save(
      this.institutions.create({
        slug: dto.slug,
        name: dto.name,
        country: dto.country,
        countryCode: dto.countryCode,
        aka: dto.aka ?? [],
        city: dto.city ?? null,
        website: dto.website ?? null,
        about: dto.about ?? null,
        status: PublishStatus.Draft,
        source: null,
        sourceUrl: null,
        retrievedAt: null,
      }),
    );

    return this.toInstitutionDetail(saved);
  }

  async listCourses(query: ListAdminCoursesQueryDto): Promise<Paged<AdminCourseSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.courses.createQueryBuilder('c').innerJoinAndSelect('c.institution', 'i');
    if (query.status) builder.andWhere('c.status = :status', { status: query.status });
    if (query.level) builder.andWhere('c.level = :level', { level: query.level });
    if (query.country) builder.andWhere('i.countryCode = :country', { country: query.country });
    if (query.institutionSlug) builder.andWhere('i.slug = :institutionSlug', { institutionSlug: query.institutionSlug });
    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        new Brackets((where) => where.where('c.title ILIKE :term', { term }).orWhere('i.name ILIKE :term', { term })),
      );
    }

    builder.orderBy('c.title', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => this.toCourseSummary(row)),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getCourse(id: string): Promise<AdminCourseSummaryDto> {
    const row = await this.courses.findOne({ where: { id }, relations: ['institution'] });
    if (!row) throw new NotFoundException('No course with that id.');
    return this.toCourseSummary(row);
  }

  async setCourseStatus(id: string, status: PublishStatus): Promise<AdminCourseSummaryDto> {
    const row = await this.courses.findOne({ where: { id }, relations: ['institution'] });
    if (!row) throw new NotFoundException('No course with that id.');
    row.status = status;
    const saved = await this.courses.save(row);
    return this.toCourseSummary(saved);
  }

  async getCourseDetail(id: string): Promise<AdminCourseDetailDto> {
    const row = await this.courses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No course with that id.');
    return this.toCourseDetail(row);
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<AdminCourseDetailDto> {
    const row = await this.courses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No course with that id.');

    if (dto.slug && dto.slug !== row.slug && (await this.courses.exist({ where: { slug: dto.slug } }))) {
      throw new ConflictException('That slug is already taken.');
    }
    if (dto.institutionId && dto.institutionId !== row.institutionId && !(await this.institutions.exist({ where: { id: dto.institutionId } }))) {
      throw new NotFoundException('No institution with that id.');
    }

    const merged = { ...row, ...definedEntries(dto) };
    const saved = await this.courses.save(merged);
    return this.toCourseDetail(saved);
  }

  async createCourse(dto: CreateCourseDto): Promise<AdminCourseDetailDto> {
    if (await this.courses.exist({ where: { slug: dto.slug } })) {
      throw new ConflictException('That slug is already taken.');
    }
    if (!(await this.institutions.exist({ where: { id: dto.institutionId } }))) {
      throw new NotFoundException('No institution with that id.');
    }

    const saved = await this.courses.save(
      this.courses.create({
        slug: dto.slug,
        institutionId: dto.institutionId,
        title: dto.title,
        level: dto.level,
        disciplines: dto.disciplines ?? [],
        status: PublishStatus.Draft,
        source: null,
        sourceUrl: null,
        sourceRef: null,
        retrievedAt: null,
      }),
    );

    return this.toCourseDetail(saved);
  }

  async listArticles(query: ListAdminArticlesQueryDto): Promise<Paged<AdminArticleSummaryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.articles.createQueryBuilder('a');
    if (query.status) builder.andWhere('a.status = :status', { status: query.status });
    if (query.q?.trim()) builder.andWhere('a.title ILIKE :term', { term: `%${query.q.trim()}%` });

    builder.orderBy('a.title', 'ASC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, status: row.status })),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getArticle(id: string): Promise<AdminArticleSummaryDto> {
    const row = await this.articles.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No article with that id.');
    return { id: row.id, slug: row.slug, title: row.title, status: row.status };
  }

  async setArticleStatus(id: string, status: PublishStatus): Promise<AdminArticleSummaryDto> {
    const row = await this.articles.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No article with that id.');
    row.status = status;
    const saved = await this.articles.save(row);
    return { id: saved.id, slug: saved.slug, title: saved.title, status: saved.status };
  }

  async getArticleDetail(id: string): Promise<AdminArticleDetailDto> {
    const row = await this.articles.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No article with that id.');
    return this.toArticleDetail(row);
  }

  async updateArticle(id: string, dto: UpdateArticleDto): Promise<AdminArticleDetailDto> {
    const row = await this.articles.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No article with that id.');

    if (dto.slug && dto.slug !== row.slug && (await this.articles.exist({ where: { slug: dto.slug } }))) {
      throw new ConflictException('That slug is already taken.');
    }

    const patch = definedEntries(dto);
    const merged = {
      ...row,
      ...patch,
      publishedAt: dto.publishedAt !== undefined ? this.toDate(dto.publishedAt) : row.publishedAt,
    };

    const saved = await this.articles.save(merged);
    return this.toArticleDetail(saved);
  }

  async createArticle(dto: CreateArticleDto): Promise<AdminArticleDetailDto> {
    if (await this.articles.exist({ where: { slug: dto.slug } })) {
      throw new ConflictException('That slug is already taken.');
    }

    const saved = await this.articles.save(
      this.articles.create({
        ...dto,
        excerpt: dto.excerpt ?? null,
        heroImageUrl: dto.heroImageUrl ?? null,
        countryCode: dto.countryCode ?? null,
        tags: dto.tags ?? [],
        readMinutes: dto.readMinutes ?? null,
        author: dto.author ?? null,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : null,
        status: PublishStatus.Draft,
        /* Hand-authored, not imported — same provenance label
           scripts/seed-articles.ts already uses for the same reason. */
        source: 'Rakuxon',
        sourceUrl: null,
        retrievedAt: null,
      }),
    );

    return this.toArticleDetail(saved);
  }

  /** The full reference list, not just the ~20 destinations — an admin needs to see what is not yet active too. */
  async listCountries(): Promise<AdminCountryDto[]> {
    const rows = await this.countries.find({ order: { name: 'ASC' } });
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      isDestination: row.isDestination,
      flagEmoji: row.flagEmoji,
    }));
  }

  async setCountryDestination(code: string, isDestination: boolean): Promise<AdminCountryDto> {
    const row = await this.countries.findOne({ where: { code } });
    if (!row) throw new NotFoundException('No country with that code.');

    row.isDestination = isDestination;
    const saved = await this.countries.save(row);

    return { code: saved.code, name: saved.name, isDestination: saved.isDestination, flagEmoji: saved.flagEmoji };
  }

  private toCourseSummary(row: Course): AdminCourseSummaryDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      institutionId: row.institutionId,
      institutionName: row.institution!.name,
      institutionSlug: row.institution!.slug,
      status: row.status,
    };
  }

  private toCourseDetail(row: Course): AdminCourseDetailDto {
    return {
      id: row.id,
      slug: row.slug,
      institutionId: row.institutionId,
      title: row.title,
      level: row.level,
      disciplines: row.disciplines,
      durationMonths: row.durationMonths,
      studyMode: row.studyMode,
      campus: row.campus,
      tuitionAmount: row.tuitionAmount,
      tuitionCurrency: row.tuitionCurrency,
      tuitionPeriod: row.tuitionPeriod,
      tuitionIsEstimate: row.tuitionIsEstimate,
      tuitionIsInternational: row.tuitionIsInternational,
      intakes: row.intakes,
      entryRequirements: row.entryRequirements,
      englishTests: row.englishTests,
      scholarships: row.scholarships,
      overview: row.overview,
      highlights: row.highlights,
      careers: row.careers,
      offerResponseWeeks: row.offerResponseWeeks,
      fastTrackOffer: row.fastTrackOffer,
      status: row.status,
    };
  }

  private toInstitutionDetail(row: Institution): AdminInstitutionDetailDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      aka: row.aka,
      country: row.country,
      countryCode: row.countryCode,
      city: row.city,
      website: row.website,
      about: row.about,
      logoUrl: row.logoUrl,
      heroImageUrl: row.heroImageUrl,
      highlights: row.highlights,
      campuses: row.campuses,
      requiredDocuments: row.requiredDocuments,
      englishTests: row.englishTests,
      faqs: row.faqs,
      qualityRatings: row.qualityRatings,
      employability: row.employability,
      foundedYear: row.foundedYear,
      studentCount: row.studentCount,
      overview: row.overview,
      overviewSourceUrl: row.overviewSourceUrl,
      motto: row.motto,
      memberships: row.memberships,
      tuitionFrom: row.tuitionFrom,
      tuitionCurrency: row.tuitionCurrency,
      upcomingIntake: row.upcomingIntake,
      fastTrackOffer: row.fastTrackOffer,
      status: row.status,
    };
  }

  private toArticleDetail(row: Article): AdminArticleDetailDto {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      body: row.body,
      heroImageUrl: row.heroImageUrl,
      countryCode: row.countryCode,
      tags: row.tags,
      readMinutes: row.readMinutes,
      author: row.author,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      status: row.status,
      source: row.source,
      sourceUrl: row.sourceUrl,
    };
  }

  private toDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
  }
}
