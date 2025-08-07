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

// 1. ОСНОВНОЙ УНИКАЛЬНЫЙ ИНДЕКС
CandleSchema.index(
  { symbol: 1, timeframe: 1, openTime: 1 },
  {
    unique: true,
    name: 'primary_unique_constraint',
    background: true,
  },
);

// 2. ИНДЕКС ДЛЯ ПОИСКА ПОСЛЕДНИХ ДАННЫХ (DESC)
CandleSchema.index(
  { symbol: 1, timeframe: 1, openTime: -1 },
  {
    name: 'latest_data_desc',
    background: true,
  },
);

// 3. ИНДЕКС ДЛЯ CURSOR ПАГИНАЦИИ
CandleSchema.index(
  { openTime: 1, symbol: 1, timeframe: 1 },
  {
    name: 'cursor_pagination',
    background: true,
  },
);

// 4. ИНДЕКС ДЛЯ СТАТИСТИКИ (БЕЗ времени)
CandleSchema.index(
  { symbol: 1, timeframe: 1 },
  {
    name: 'statistics_fast',
    background: true,
  },
);
