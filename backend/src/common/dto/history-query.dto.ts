import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';

import { Transform } from 'class-transformer';
import { Timeframe } from '../enums/timeframe.enum';

export class HistoryQueryDto {
  @IsString()
  symbol: string;

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  @Max(1500)
  limit?: number = 1000;
}
