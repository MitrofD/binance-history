import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Timeframe } from '../../../common/enums/timeframe.enum';
import type { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Symbol {
  @Prop({ required: true, unique: true })
  symbol: string;

  @Prop({ required: true })
  baseAsset: string;

  @Prop({ required: true })
  quoteAsset: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: Object,
    default: () => {
      const timeframes = {};
      Object.values(Timeframe).forEach((tf) => {
        timeframes[tf] = {
          earliestData: null,
          latestData: null,
          totalCandles: 0,
          lastUpdated: null,
        };
      });
      return timeframes;
    },
  })
  timeframes: {
    [key in Timeframe]: {
      earliestData: Date | null;
      latestData: Date | null;
      totalCandles: number;
      lastUpdated: Date | null;
    };
  };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export type SymbolDocument = HydratedDocument<Symbol>;
export const SymbolSchema = SchemaFactory.createForClass(Symbol);

// Индексы
SymbolSchema.index({ isActive: 1 });
