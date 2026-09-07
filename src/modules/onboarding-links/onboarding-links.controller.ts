import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  ConsumeOnboardingLinkDto,
  ConsumedLinkDto,
  IssueOnboardingLinkDto,
  OnboardingLinkDto,
} from './dto/onboarding-link.dto';
import { OnboardingLinksService } from './onboarding-links.service';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../contract/enums';
import type { AuthenticatedUser } from '../../common/auth/authenticated-request';

@ApiTags('onboarding-links')
@Controller('onboarding-links')
export class OnboardingLinksController {
  constructor(private readonly links: OnboardingLinksService) {}

  @Post()
  @Roles(Role.AgencyAdmin, Role.Counselor)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Issue a student invitation link',
    description:
      'The URL is returned once and never again — only a hash is stored. The tenant comes ' +
      'from your token, not from the request body.',
  })
  @ApiCreatedResponse({ type: OnboardingLinkDto })
  @ApiForbiddenResponse({ description: 'Only an agency admin or counselor may issue links.' })
  async issue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueOnboardingLinkDto,
  ): Promise<OnboardingLinkDto> {
    return this.links.issue({
      tenantId: user.tenantId as string,
      issuedByUserId: user.id,
      inviteeEmail: dto.inviteeEmail,
      expiresInDays: dto.expiresInDays,
    });
  }

  @Public()
  @Post('consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem an invitation link',
    description:
      'Public, because the student has no account yet. Expired, revoked, already-used and ' +
      'unknown tokens all return the same message.',
  })
  @ApiOkResponse({ type: ConsumedLinkDto })
  @ApiUnauthorizedResponse({ description: 'The link is not valid.' })
  async consume(@Body() dto: ConsumeOnboardingLinkDto): Promise<ConsumedLinkDto> {
    return this.links.consume(dto.token);
  }

  @Delete(':id')
  @Roles(Role.AgencyAdmin, Role.Counselor)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke an invitation link' })
  @ApiNoContentResponse()
  async revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.links.revoke(id, user.tenantId as string);
  }
}
