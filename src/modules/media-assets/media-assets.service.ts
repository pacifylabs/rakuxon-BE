import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { In, Repository } from 'typeorm';

import {
  CreateMediaAssetDto,
  ListMediaAssetsQueryDto,
  MediaAssetDto,
  MediaAssetListDto,
  UpdateMediaAssetDto,
} from './dto/media-asset.dto';
import { MediaAsset } from './entities/media-asset.entity';
import { Admin } from '../admins/entities/admin.entity';
import { definedEntries } from '../../common/utils/defined-entries';

@Injectable()
export class MediaAssetsService {
  constructor(
    @InjectRepository(MediaAsset) private readonly assets: Repository<MediaAsset>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  async list(query: ListMediaAssetsQueryDto): Promise<MediaAssetListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.assets.createQueryBuilder('m');
    if (query.category) builder.andWhere('m.category = :category', { category: query.category });
    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere('(m.title ILIKE :term OR m.description ILIKE :term)', { term });
    }

    builder.orderBy('m.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: await this.toDtos(rows),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(id: string): Promise<MediaAssetDto> {
    const row = await this.findOrThrow(id);
    const [dto] = await this.toDtos([row]);
    return dto!;
  }

  async create(adminId: string, dto: CreateMediaAssetDto): Promise<MediaAssetDto> {
    const saved = await this.assets.save(
      this.assets.create({
        title: dto.title,
        description: dto.description ?? null,
        category: dto.category,
        fileUrl: dto.fileUrl,
        cloudinaryPublicId: dto.cloudinaryPublicId,
        mimeType: dto.mimeType ?? null,
        bytes: dto.bytes ?? null,
        uploadedByAdminId: adminId,
      }),
    );
    const [result] = await this.toDtos([saved]);
    return result!;
  }

  async update(id: string, dto: UpdateMediaAssetDto): Promise<MediaAssetDto> {
    const row = await this.findOrThrow(id);
    const saved = await this.assets.save({ ...row, ...definedEntries(dto) });
    const [result] = await this.toDtos([saved]);
    return result!;
  }

  /** Removes the row and, best-effort, the underlying Cloudinary file — a leaked file costs storage, not correctness. */
  async remove(id: string): Promise<void> {
    const row = await this.findOrThrow(id);
    await this.assets.remove(row);
    try {
      await cloudinary.uploader.destroy(row.cloudinaryPublicId, { resource_type: 'auto' });
    } catch {
      /* The row is already gone — a failed Cloudinary cleanup is not worth surfacing to the caller. */
    }
  }

  private async findOrThrow(id: string): Promise<MediaAsset> {
    const row = await this.assets.findOne({ where: { id } });
    if (!row) throw new NotFoundException('No media asset with that id.');
    return row;
  }

  private async toDtos(rows: MediaAsset[]): Promise<MediaAssetDto[]> {
    const adminIds = [...new Set(rows.flatMap((row) => (row.uploadedByAdminId ? [row.uploadedByAdminId] : [])))];
    const admins = adminIds.length ? await this.admins.find({ where: { id: In(adminIds) } }) : [];
    const nameById = new Map(admins.map((admin) => [admin.id, `${admin.firstName} ${admin.lastName}`]));

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      fileUrl: row.fileUrl,
      mimeType: row.mimeType,
      bytes: row.bytes,
      uploadedByAdminName: row.uploadedByAdminId ? (nameById.get(row.uploadedByAdminId) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
