import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { validateRuntimeConfig } from './config/configuration';
import { MediaService } from './modules/media/media.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Fail-fast production & secret validation before binding ports
  validateRuntimeConfig(configService);

  if (configService.get<boolean>('trustProxy')) {
    app.set('trust proxy', 1);
  }

  const port = configService.get<number>('port') || 4000;
  const apiPrefix = configService.get<string>('apiPrefix') || 'api/v1';
  const isProduction = configService.get<boolean>('isProduction') || false;
  const corsOrigins = configService.get<string[]>('corsOrigins') || [
    'http://localhost:5173',
  ];
  const localUploadDir =
    configService.get<string>('storage.localDir') ||
    path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(localUploadDir)) {
    fs.mkdirSync(localUploadDir, { recursive: true });
  }

  app.setGlobalPrefix(apiPrefix);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  // Guard /uploads static serving so private/booking evidence is never served unauthenticated
  const mediaService = app.get(MediaService);
  app.use('/uploads', async (req: any, res: any, next: any) => {
    const cleanPath = String(req.path || '').replace(/^\/+/, '');
    if (
      !cleanPath ||
      cleanPath.includes('..') ||
      cleanPath.toLowerCase().startsWith('private')
    ) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Không có quyền truy cập trực tiếp tài nguyên riêng tư',
      });
    }
    const isPrivate = await mediaService.isPublicFilenameRestricted(cleanPath);
    if (isPrivate) {
      return res.status(403).json({
        statusCode: 403,
        message:
          'Ảnh chứng cứ giao dịch yêu cầu xác thực thành viên tham gia booking',
      });
    }
    return next();
  });

  // Serve public uploaded media files statically at /uploads/* from persistent storage dir
  app.useStaticAssets(localUploadDir, {
    prefix: '/uploads',
  });

  app.enableCors({
    origin: (origin, callback) => {
      // Allow server-to-server, curl, Swagger same-origin, or configured CORS origins
      if (!origin) {
        return callback(null, true);
      }
      const normalized = origin.replace(/\/+$/, '');
      if (corsOrigins.includes(normalized)) {
        return callback(null, true);
      }
      if (
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} không nằm trong danh sách CORS cho phép`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TravelShare API')
      .setDescription(
        'Tài liệu RESTful API cho nền tảng mạng xã hội chia sẻ đồ dùng du lịch tích hợp AI (TravelShare)',
      )
      .setVersion('2.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  await app.listen(port);
  logger.log(
    `TravelShare Backend đang chạy tại: http://localhost:${port}/${apiPrefix} (env=${configService.get<string>('nodeEnv')})`,
  );
  if (!isProduction || process.env.ENABLE_SWAGGER === 'true') {
    logger.log(
      `Swagger OpenAPI Docs: http://localhost:${port}/${apiPrefix}/docs`,
    );
  }
}
bootstrap();
