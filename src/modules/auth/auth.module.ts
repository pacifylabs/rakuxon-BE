import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SsoIdentity } from './entities/sso-identity.entity';
import { PasswordService } from './password.service';
import { GoogleSsoProvider } from './sso/google-sso.provider';
import { SSO_PROVIDERS } from './sso/sso.port';
import { TokenService } from './token.service';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import type { SsoProvider } from './sso/sso.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Tenant, RefreshToken, PasswordResetToken, SsoIdentity]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    {
      /*
       * Registered by name so adding a provider is one entry here. Credentials
       * are optional: a deployment that has not configured Google still boots,
       * and the callback answers 400 rather than the process refusing to start.
       */
      provide: SSO_PROVIDERS,
      useFactory: (): Map<string, SsoProvider> => {
        const providers = new Map<string, SsoProvider>();
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

        if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          providers.set('google', new GoogleSsoProvider(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET));
        }

        return providers;
      },
    },
  ],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
