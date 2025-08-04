import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Timeframe } from '../../../common/enums/timeframe.enum';
import type { HydratedDocument } from 'mongoose';

@Schema({
  timestamps: false,
  collection: 'candles',
})
export class Candle {
  @Prop({ required: true })
  symbol: string;

  @Prop({ required: true, enum: Timeframe })
  timeframe: Timeframe;

  @Prop({ required: true, type: Date })
  openTime: Date;

  @Prop({ required: true, type: Date })
  closeTime: Date;

  @Prop({ required: true, type: String })
  open: string;

  @Prop({ required: true, type: String })
  high: string;

  @Prop({ required: true, type: String })
  low: string;

  @Prop({ required: true, type: String })
  close: string;

  @Prop({ required: true, type: String })
  volume: string;

  @Prop({ required: true })
  trades: number;

  @Prop({ required: true, type: String })
  takerBuyBaseVolume: string;

  @Prop({ required: true, type: String })
  takerBuyQuoteVolume: string;
}

export type CandleDocument = HydratedDocument<Candle>;
export const CandleSchema = SchemaFactory.createForClass(Candle);

// Составные индексы для быстрого поиска
CandleSchema.index({ symbol: 1, timeframe: 1, openTime: 1 }, { unique: true });
CandleSchema.index({ symbol: 1, timeframe: 1, openTime: -1 });
CandleSchema.index({ openTime: 1 });
