import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/auth.decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái hoạt động của API và Database' })
  checkHealth() {
    const dbStates: Record<number, string> = {
      0: 'DISCONNECTED',
      1: 'CONNECTED',
      2: 'CONNECTING',
      3: 'DISCONNECTING',
    };
    const readyState = this.connection.readyState;

    return {
      status: readyState === 1 ? 'OK' : 'DEGRADED',
      service: 'TravelShare Backend API',
      version: '1.0.0',
      phase: 'Phase 1 - Foundation, Database & Authentication',
      timezone: this.configService.get<string>('timezone') || 'Asia/Ho_Chi_Minh',
      currency: this.configService.get<string>('currency') || 'VND',
      database: {
        provider: 'MongoDB',
        status: dbStates[readyState] || 'UNKNOWN',
      },
      integrations: {
        googleOAuthConfigured: Boolean(
          this.configService.get<string>('google.clientId') &&
            this.configService.get<string>('google.clientSecret'),
        ),
        geminiAiConfigured: Boolean(
          this.configService.get<string>('gemini.apiKey'),
        ),
      },
      serverTime: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
