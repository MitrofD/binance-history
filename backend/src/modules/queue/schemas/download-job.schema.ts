import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Timeframe } from '../../../common/enums/timeframe.enum';
import { JobStatus } from '../../../common/enums/job-status.enum';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class DownloadJob {
  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: Timeframe })
  timeframe: Timeframe;

  @Prop({ required: true, type: Date })
  startDate: Date;

  @Prop({ required: true, type: Date })
  endDate: Date;

  @Prop({ required: true, enum: JobStatus, default: JobStatus.PENDING })
  status: JobStatus;

  @Prop({ default: 0 })
  progress: number;

  @Prop({ default: 0 })
  processedCandles: number;

  @Prop({ default: 0 })
  totalCandles: number;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop()
  error?: string;

  @Prop()
  bullJobId?: string;

  @Prop({ type: Date })
  lastProgressUpdate?: Date;

  @Prop()
  userId?: string;
}

export type DownloadJobDocument = HydratedDocument<DownloadJob>;
export const DownloadJobSchema = SchemaFactory.createForClass(DownloadJob);

DownloadJobSchema.index({ symbol: 1, timeframe: 1 });
DownloadJobSchema.index({ status: 1 });
DownloadJobSchema.index({ bullJobId: 1 });
DownloadJobSchema.index({ createdAt: -1 });