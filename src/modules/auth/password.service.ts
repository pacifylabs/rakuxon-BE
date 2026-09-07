import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing.
 *
 * Argon2id, which is the current password-hashing recommendation: memory-hard,
 * so a GPU farm gains far less over a defender than it does against bcrypt.
 * Parameters are named here rather than left to defaults so that raising them
 * later is a visible, reviewable change.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB — OWASP's floor for argon2id
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, this.options);
  }

  /**
   * Never throws on a malformed digest: argon2 rejects garbage by throwing,
   * and letting that escape would turn "this user signs in via SSO and has no
   * password" into a 500 instead of a failed login.
   */
  async verify(digest: string | null | undefined, plaintext: string): Promise<boolean> {
    if (!digest) return false;
    try {
      return await argon2.verify(digest, plaintext);
    } catch {
      return false;
    }
  }
}
