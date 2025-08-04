import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';

class CreateTokenDto {
  name: string;
  description?: string;
  expiresInDays?: number;
  permissions?: string[];
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('tokens')
  @ApiOperation({ summary: 'Create a new API token' })
  @ApiResponse({ status: 201, description: 'Token created successfully' })
  async createToken(@Body() createTokenDto: CreateTokenDto) {
    const expiresIn = createTokenDto.expiresInDays
      ? createTokenDto.expiresInDays * 24 * 60 * 60 * 1000
      : undefined;

    const { token, apiToken } = await this.authService.createApiToken(
      createTokenDto.name,
      createTokenDto.description,
      expiresIn,
      createTokenDto.permissions,
    );

    return {
      success: true,
      data: {
        token, // Возвращаем токен только при создании
        id: apiToken._id,
        name: apiToken.name,
        description: apiToken.description,
        permissions: apiToken.permissions,
        expiresAt: apiToken.expiresAt,
      },
      message:
        'API token created successfully. Save this token securely as it will not be shown again.',
    };
  }

  @Get('tokens')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all API tokens' })
  @ApiResponse({ status: 200, description: 'Tokens retrieved successfully' })
  async listTokens() {
    const tokens = await this.authService.listApiTokens();
    return {
      success: true,
      data: tokens,
    };
  }

  @Delete('tokens/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an API token' })
  @ApiResponse({ status: 200, description: 'Token revoked successfully' })
  async revokeToken(@Param('id') tokenId: string) {
    const revoked = await this.authService.revokeApiToken(tokenId);

    if (!revoked) {
      return {
        success: false,
        message: 'Token not found',
      };
    }

    return {
      success: true,
      message: 'Token revoked successfully',
    };
  }
}
