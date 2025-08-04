import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ApiToken, ApiTokenDocument } from './schemas/api-token.schema';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(ApiToken.name) private apiTokenModel: Model<ApiTokenDocument>,
    private jwtService: JwtService,
  ) {}

  async validateApiToken(token: string): Promise<ApiTokenDocument | null> {
    const apiToken = await this.apiTokenModel.findOne({
      token,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (apiToken) {
      // Обновляем статистику использования
      apiToken.requestCount += 1;
      apiToken.lastUsedAt = new Date();
      await apiToken.save();
    }

    return apiToken;
  }

  async createApiToken(
    name: string,
    description?: string,
    expiresIn?: number,
    permissions: string[] = ['read'],
  ): Promise<{ token: string; apiToken: ApiTokenDocument }> {
    const token = this.generateSecureToken();

    const apiToken = new this.apiTokenModel({
      token,
      name,
      description,
      permissions,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn) : undefined,
    });

    const savedToken = await apiToken.save();

    return { token, apiToken: savedToken };
  }

  async revokeApiToken(tokenId: string): Promise<boolean> {
    const result = await this.apiTokenModel.findByIdAndUpdate(
      tokenId,
      { isActive: false },
      { new: true },
    );

    return !!result;
  }

  async listApiTokens(): Promise<ApiTokenDocument[]> {
    return this.apiTokenModel
      .find({ isActive: true })
      .select('-token') // Не возвращаем сам токен в списке
      .sort({ createdAt: -1 });
  }

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateJwtToken(payload: any): string {
    return this.jwtService.sign(payload);
  }
}
