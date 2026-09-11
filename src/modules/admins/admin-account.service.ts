import { randomBytes, createHash } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import QRCode from 'qrcode';
import speakeasy from 'speakeasy';
import { Repository } from 'typeorm';

import type { ChangeAdminPasswordDto, UpdateAdminProfileDto } from './dto/admin-account.dto';
import { Admin } from './entities/admin.entity';
import { definedEntries } from '../../common/utils/defined-entries';
import { PasswordService } from '../auth/password.service';

const BACKUP_CODE_COUNT = 8;
const TOTP_ISSUER = 'Rakuxon Admin';

/**
 * Self-service on an admin's own account — profile, password, and 2FA.
 * Distinct from `AdminsService`, which is one admin managing *another's*
 * account (permissions, suspension) and requires `admins.manage`; every
 * route here works for any authenticated admin acting on themselves, no
 * permission check beyond being signed in.
 */
@Injectable()
export class AdminAccountService {
  constructor(
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly passwords: PasswordService,
  ) {}

  async getAccount(adminId: string): Promise<Admin> {
    return this.getOrThrow(adminId);
  }

  async updateProfile(adminId: string, patch: UpdateAdminProfileDto): Promise<Admin> {
    const admin = await this.getOrThrow(adminId);
    Object.assign(admin, definedEntries(patch));
    return this.admins.save(admin);
  }

  async changePassword(adminId: string, dto: ChangeAdminPasswordDto): Promise<void> {
    const admin = await this.withPasswordHash(adminId);
    const valid = await this.passwords.verify(admin.passwordHash, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Your current password is not correct.');

    admin.passwordHash = await this.passwords.hash(dto.newPassword);
    await this.admins.save(admin);
  }

  /**
   * Generates a secret and stashes it on the account, unconfirmed — 2FA is
   * not actually on until `verifyAndEnableTotp` proves the admin scanned it
   * correctly. Calling this again before enabling just replaces the pending
   * secret, so an abandoned setup never leaves an account half-configured.
   */
  async setupTotp(adminId: string): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const admin = await this.getOrThrow(adminId);

    const { base32: secret } = speakeasy.generateSecret({ length: 20 });
    const otpauthUrl = speakeasy.otpauthURL({ secret, label: admin.email, issuer: TOTP_ISSUER, encoding: 'base32' });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    const updated = await this.admins.update({ id: adminId, totpEnabled: false }, { totpSecret: secret });
    if (!updated.affected) throw new BadRequestException('Disable 2FA before starting a new setup.');

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /** Confirms the pending secret with a real code, turns 2FA on, and mints one-time backup codes. */
  async verifyAndEnableTotp(adminId: string, code: string): Promise<{ backupCodes: string[] }> {
    const admin = await this.admins
      .createQueryBuilder('admin')
      .addSelect('admin.totpSecret')
      .where('admin.id = :id', { id: adminId })
      .getOne();

    if (!admin) throw new NotFoundException('No admin with that id.');
    if (!admin.totpSecret) throw new BadRequestException('Start 2FA setup first.');

    const valid = speakeasy.totp.verify({ secret: admin.totpSecret, encoding: 'base32', token: code.trim(), window: 1 });
    if (!valid) throw new UnauthorizedException('That code is not valid.');

    const backupCodes = this.generateBackupCodes();
    await this.admins.update(adminId, {
      totpEnabled: true,
      totpBackupCodesHash: backupCodes.map((backupCode) => this.hashBackupCode(backupCode)),
    });

    return { backupCodes };
  }

  async disableTotp(adminId: string, currentPassword: string): Promise<void> {
    const admin = await this.withPasswordHash(adminId);
    const valid = await this.passwords.verify(admin.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Your current password is not correct.');

    await this.admins.update(adminId, { totpEnabled: false, totpSecret: null, totpBackupCodesHash: [] });
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
  }

  private hashBackupCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async getOrThrow(id: string): Promise<Admin> {
    const admin = await this.admins.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('No admin with that id.');
    return admin;
  }

  private async withPasswordHash(id: string): Promise<Admin> {
    const admin = await this.admins
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.id = :id', { id })
      .getOne();
    if (!admin) throw new NotFoundException('No admin with that id.');
    return admin;
  }
}
