import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SymbolService } from './symbol.service';
import { SymbolController } from './symbol.controller';
import { AuthModule } from '../auth/auth.module';
import { Symbol, SymbolSchema } from './schemas/symbol.schema';
import { BinanceModule } from '../binance/binance.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Symbol.name, schema: SymbolSchema }]),
    BinanceModule,
    forwardRef(() => QueueModule),
  ],
  providers: [SymbolService],
  controllers: [SymbolController],
  exports: [SymbolService],
})
export class SymbolModule {}
