import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class ApiToken {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: 0 })
  requestCount: number;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: [String], default: ['read'] })
  permissions: string[]; // ['read', 'write', 'admin']
}

export type ApiTokenDocument = HydratedDocument<ApiToken>;
export const ApiTokenSchema = SchemaFactory.createForClass(ApiToken);

// Индексы
ApiTokenSchema.index({ token: 1 }, { unique: true });
ApiTokenSchema.index({ isActive: 1 });
ApiTokenSchema.index({ expiresAt: 1 });
