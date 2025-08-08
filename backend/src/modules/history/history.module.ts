import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HistoryService } from './history.service'; // Теперь с батчингом
import { HistoryController } from './history.controller';
import { Candle, CandleSchema } from './schemas/candle.schema';
import { Symbol, SymbolSchema } from '../symbol/schemas/symbol.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Candle.name, schema: CandleSchema },
      { name: Symbol.name, schema: SymbolSchema },
    ]),
  ],
  providers: [HistoryService],
  controllers: [HistoryController],
  exports: [HistoryService],
})
export class HistoryModule {}
