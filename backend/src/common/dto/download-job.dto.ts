import { IsString, IsEnum, IsDateString } from 'class-validator';
import { Timeframe } from '../enums/timeframe.enum';

export class CreateDownloadJobDto {
  @IsString()
  symbol: string;

  @IsEnum(Timeframe)
  timeframe: Timeframe;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
