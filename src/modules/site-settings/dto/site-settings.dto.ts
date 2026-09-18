import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

import type { SiteAddress, SiteSocial } from '../entities/site-settings.entity';

class SiteAddressDto implements SiteAddress {
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) lines!: string[];
}

class SiteSocialDto implements SiteSocial {
  @ApiProperty() @IsString() @IsNotEmpty() label!: string;
  @ApiProperty() @IsString() @IsNotEmpty() href!: string;
}

export class SiteSettingsDto {
  @ApiProperty() contactEmail!: string;
  @ApiProperty({ type: [String] }) contactPhones!: string[];
  @ApiProperty({ type: [SiteAddressDto] }) contactAddresses!: SiteAddress[];
  @ApiProperty({ type: [SiteSocialDto] }) socials!: SiteSocial[];
  @ApiProperty() footerTagline!: string;
  @ApiProperty() footerBlurb!: string;
  @ApiProperty() logoUrl!: string;
  @ApiProperty() logoDarkUrl!: string;
}

export class AdminSiteSettingsDto extends SiteSettingsDto {}

export class UpdateSiteSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() contactEmail?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contactPhones?: string[];

  @ApiPropertyOptional({ type: [SiteAddressDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteAddressDto)
  contactAddresses?: SiteAddress[];

  @ApiPropertyOptional({ type: [SiteSocialDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteSocialDto)
  socials?: SiteSocial[];

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() footerTagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() footerBlurb?: string;
  /*
   * Not @IsUrl(): the seeded default is a relative `/public` asset path
   * (`/logo-light.png`), not an absolute URL, and stays valid until an admin
   * uploads a real one — same reasoning as Testimonial's own `photoUrl`.
   */
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() logoDarkUrl?: string;
}
