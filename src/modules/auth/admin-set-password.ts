import { DataSource, IsNull } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

/** A password set by an admin invalidates prior refresh sessions and reset links atomically. */
export async function adminSetPassword(db: DataSource, userId: string, passwordHash: string): Promise<void> {
  await db.transaction(async manager => {
    await manager.update(User, userId, { passwordHash });
    await manager.update(RefreshToken, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    await manager.update(PasswordResetToken, { userId, consumedAt: IsNull() }, { consumedAt: new Date() });
  });
}
