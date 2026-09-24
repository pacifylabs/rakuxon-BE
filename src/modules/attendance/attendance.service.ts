import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  AttendanceRecordDto,
  AttendanceRecordListDto,
  ListAttendanceQueryDto,
} from './dto/attendance.dto';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { Admin } from '../admins/entities/admin.entity';

/** The calendar day a clock-in/out belongs to — server UTC, not the admin's local time. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  async clockIn(adminId: string): Promise<AttendanceRecordDto> {
    const date = todayUtc();
    if (await this.records.exist({ where: { adminId, date } })) {
      throw new ConflictException('Already clocked in today.');
    }

    const saved = await this.records.save(
      this.records.create({ adminId, date, clockInAt: new Date(), clockOutAt: null }),
    );
    const [dto] = await this.toDtos([saved]);
    return dto!;
  }

  async clockOut(adminId: string): Promise<AttendanceRecordDto> {
    const date = todayUtc();
    const row = await this.records.findOne({ where: { adminId, date } });
    if (!row) throw new NotFoundException("You haven't clocked in today.");
    if (row.clockOutAt) throw new ConflictException('Already clocked out today.');

    row.clockOutAt = new Date();
    const saved = await this.records.save(row);
    const [dto] = await this.toDtos([saved]);
    return dto!;
  }

  async today(adminId: string): Promise<AttendanceRecordDto | null> {
    const row = await this.records.findOne({ where: { adminId, date: todayUtc() } });
    if (!row) return null;
    const [dto] = await this.toDtos([row]);
    return dto!;
  }

  async listMine(adminId: string, query: ListAttendanceQueryDto): Promise<AttendanceRecordListDto> {
    return this.list({ ...query, adminId });
  }

  async list(query: ListAttendanceQueryDto): Promise<AttendanceRecordListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const builder = this.records.createQueryBuilder('r');
    if (query.adminId) builder.andWhere('r.adminId = :adminId', { adminId: query.adminId });
    if (query.from) builder.andWhere('r.date >= :from', { from: query.from });
    if (query.to) builder.andWhere('r.date <= :to', { to: query.to });

    builder.orderBy('r.date', 'DESC').addOrderBy('r.clockInAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    return {
      items: await this.toDtos(rows),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async toDtos(rows: AttendanceRecord[]): Promise<AttendanceRecordDto[]> {
    const adminIds = [...new Set(rows.map((row) => row.adminId))];
    const admins = adminIds.length ? await this.admins.find({ where: { id: In(adminIds) } }) : [];
    const nameById = new Map(admins.map((admin) => [admin.id, `${admin.firstName} ${admin.lastName}`]));

    return rows.map((row) => ({
      id: row.id,
      adminId: row.adminId,
      adminName: nameById.get(row.adminId) ?? 'Unknown',
      date: row.date,
      clockInAt: row.clockInAt.toISOString(),
      clockOutAt: row.clockOutAt ? row.clockOutAt.toISOString() : null,
    }));
  }
}
