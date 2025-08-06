import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { QueueService } from './queue.service';
import { CreateDownloadJobDto } from '../../common/dto/download-job.dto';

@ApiTags('queue')
@Controller('queue')
@ApiBearerAuth()
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('download')
  @ApiOperation({ summary: 'Create a new download job' })
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @HttpCode(HttpStatus.CREATED)
  async createDownloadJob(@Body() createJobDto: CreateDownloadJobDto) {
    const job = await this.queueService.createDownloadJob(createJobDto);
    return {
      success: true,
      data: {
        jobId: job._id,
        symbol: job.symbol,
        timeframe: job.timeframe,
        status: job.status,
        startDate: job.startDate,
        endDate: job.endDate,
      },
    };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get all jobs' })
  @ApiResponse({ status: 200, description: 'Jobs retrieved successfully' })
  async getAllJobs() {
    const jobs = await this.queueService.getAllJobs();
    return {
      success: true,
      data: jobs,
    };
  }

  @Get('jobs/active')
  @ApiOperation({ summary: 'Get active jobs' })
  @ApiResponse({
    status: 200,
    description: 'Active jobs retrieved successfully',
  })
  async getActiveJobs() {
    const jobs = await this.queueService.getActiveJobs();
    return {
      success: true,
      data: jobs,
    };
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get job status' })
  @ApiResponse({
    status: 200,
    description: 'Job status retrieved successfully',
  })
  async getJobStatus(@Param('id') jobId: string) {
    const job = await this.queueService.getJobStatus(jobId);
    return {
      success: true,
      data: job,
    };
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Cancel a job' })
  @ApiResponse({ status: 200, description: 'Job cancelled successfully' })
  async cancelJob(@Param('id') jobId: string) {
    await this.queueService.cancelJob(jobId);
    return {
      success: true,
      message: 'Job cancelled successfully',
    };
  }
}
