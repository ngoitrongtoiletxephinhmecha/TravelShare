import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEV_ACCESS_FALLBACK = 'dev-access-secret-key-change-in-production-32chars';
const DEV_REFRESH_FALLBACK =
  'dev-refresh-secret-key-change-in-production-32chars';

export function parseAllowedOrigins(
  frontendUrl: string,
  corsOriginsRaw?: string,
  isProduction = false,
): string[] {
  const configured = [
    frontendUrl,
    ...(corsOriginsRaw ? corsOriginsRaw.split(',') : []),
  ]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (!isProduction) {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  return Array.from(new Set(configured));
}

export default () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const frontendUrl = (
    process.env.FRONTEND_URL || 'http://localhost:5173'
  ).replace(/\/+$/, '');

  const rawSameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  const cookieSameSite: 'lax' | 'strict' | 'none' =
    rawSameSite === 'strict' || rawSameSite === 'none' ? rawSameSite : 'lax';

  const cookieSecure =
    cookieSameSite === 'none' ||
    process.env.COOKIE_SECURE === 'true' ||
    (isProduction && frontendUrl.startsWith('https://'));

  const cookieDomainRaw = process.env.COOKIE_DOMAIN?.trim();
  const cookieDomain =
    cookieDomainRaw && cookieDomainRaw !== 'localhost'
      ? cookieDomainRaw
      : undefined;

  const storageDriverRaw = (process.env.STORAGE_DRIVER || 'auto')
    .trim()
    .toLowerCase();
  const storageDriver: 'local' | 'cloudinary' | 'auto' =
    storageDriverRaw === 'cloudinary' || storageDriverRaw === 'local'
      ? storageDriverRaw
      : 'auto';

  const localDir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads');
  const privateDir = process.env.PRIVATE_UPLOAD_DIR
    ? path.resolve(process.env.PRIVATE_UPLOAD_DIR)
    : path.resolve(process.cwd(), 'private_uploads');

  return {
    nodeEnv,
    isProduction,
    port: parseInt(process.env.PORT || '4000', 10),
    apiPrefix: process.env.API_PREFIX || 'api/v1',
    frontendUrl,
    corsOrigins: parseAllowedOrigins(
      frontendUrl,
      process.env.CORS_ORIGINS,
      isProduction,
    ),
    trustProxy: process.env.TRUST_PROXY === 'true' || isProduction,
    timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
    currency: process.env.CURRENCY || 'VND',
    database: {
      uri:
        process.env.MONGODB_URI ||
        (isProduction ? '' : 'mongodb://localhost:27017/travelshare'),
      demoUri:
        process.env.MONGODB_DEMO_URI ||
        'mongodb://localhost:27017/travelshare_demo',
    },
    demo: {
      enabled:
        !isProduction && process.env.ALLOW_DEMO_DATA !== 'false',
      allowSeed:
        !isProduction &&
        (process.env.ALLOW_DEMO_SEED === 'true' ||
          process.env.DEMO_MODE === 'true'),
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    },
    jwt: {
      accessSecret:
        process.env.JWT_ACCESS_SECRET ||
        (isProduction ? '' : DEV_ACCESS_FALLBACK),
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshSecret:
        process.env.JWT_REFRESH_SECRET ||
        (isProduction ? '' : DEV_REFRESH_FALLBACK),
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      cookieSecure,
      cookieSameSite,
      cookieDomain,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:4000/api/v1/auth/google/callback',
    },
    storage: {
      driver: storageDriver,
      localDir,
      privateDir,
      allowLocalInProduction:
        process.env.ALLOW_LOCAL_STORAGE_IN_PROD === 'true',
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
      cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
      cloudinaryFolder: process.env.CLOUDINARY_FOLDER || 'travelshare',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '60000', 10),
    },
  };
};

export function validateRuntimeConfig(configService: ConfigService): void {
  const logger = new Logger('RuntimeConfigValidator');
  const nodeEnv = configService.get<string>('nodeEnv') || 'development';
  const isProduction = nodeEnv === 'production';

  const accessSecret = configService.get<string>('jwt.accessSecret') || '';
  const refreshSecret = configService.get<string>('jwt.refreshSecret') || '';
  const dbUri = configService.get<string>('database.uri') || '';
  const demoUri = configService.get<string>('database.demoUri') || '';
  const frontendUrl = configService.get<string>('frontendUrl') || '';

  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    if (isProduction) {
      throw new Error(
        'CONFIG_ERROR: JWT_ACCESS_SECRET và JWT_REFRESH_SECRET không được phép giống nhau trong môi trường production.',
      );
    }
    logger.warn(
      'JWT_ACCESS_SECRET và JWT_REFRESH_SECRET đang trùng nhau; nên tách 2 secret riêng biệt.',
    );
  }

  if (!isProduction) {
    return;
  }

  const errors: string[] = [];

  if (
    !accessSecret ||
    accessSecret.length < 32 ||
    accessSecret === DEV_ACCESS_FALLBACK
  ) {
    errors.push(
      'JWT_ACCESS_SECRET phải được cấu hình từ biến môi trường (>= 32 ký tự, không dùng khóa mặc định dev).',
    );
  }

  if (
    !refreshSecret ||
    refreshSecret.length < 32 ||
    refreshSecret === DEV_REFRESH_FALLBACK
  ) {
    errors.push(
      'JWT_REFRESH_SECRET phải được cấu hình từ biến môi trường (>= 32 ký tự, không dùng khóa mặc định dev).',
    );
  }

  if (!dbUri) {
    errors.push('MONGODB_URI bắt buộc phải được cấu hình trong production.');
  } else {
    const cleanUriNoQuery = dbUri.split('?')[0].toLowerCase();
    const dbName = cleanUriNoQuery.split('/').pop() || '';
    if (demoUri && dbUri === demoUri) {
      errors.push('MONGODB_URI production không được trùng với MONGODB_DEMO_URI.');
    }
    if (/(_demo|-demo|^demo)$/i.test(dbName)) {
      errors.push(
        `Tên database "${dbName}" có dấu hiệu là database demo, bị chặn trong môi trường production.`,
      );
    }
  }

  if (
    process.env.ALLOW_DEMO_SEED === 'true' ||
    process.env.ALLOW_DEMO_DATA === 'true' ||
    process.env.DEMO_MODE === 'true'
  ) {
    errors.push(
      'Không được phép bật ALLOW_DEMO_SEED / ALLOW_DEMO_DATA / DEMO_MODE trong môi trường production.',
    );
  }

  if (!frontendUrl || frontendUrl.includes('*')) {
    errors.push(
      'FRONTEND_URL phải là domain cụ thể (không dùng wildcard *) trong production.',
    );
  }

  const cookieSameSite = configService.get<string>('jwt.cookieSameSite');
  const cookieSecure = configService.get<boolean>('jwt.cookieSecure');
  if (cookieSameSite === 'none' && !cookieSecure) {
    errors.push(
      'COOKIE_SECURE=true là bắt buộc khi COOKIE_SAME_SITE=none.',
    );
  }

  const storageDriver = configService.get<string>('storage.driver');
  const cloudName = configService.get<string>('storage.cloudinaryCloudName');
  const apiKey = configService.get<string>('storage.cloudinaryApiKey');
  const apiSecret = configService.get<string>('storage.cloudinaryApiSecret');
  const hasCloudinary = Boolean(cloudName && apiKey && apiSecret);
  const allowLocalInProd = configService.get<boolean>(
    'storage.allowLocalInProduction',
  );
  const hasExplicitUploadDir = Boolean(process.env.UPLOAD_DIR);

  if (storageDriver === 'cloudinary' && !hasCloudinary) {
    errors.push(
      'STORAGE_DRIVER=cloudinary yêu cầu đủ CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET.',
    );
  } else if (
    (storageDriver === 'local' || (storageDriver === 'auto' && !hasCloudinary)) &&
    !allowLocalInProd &&
    !hasExplicitUploadDir
  ) {
    errors.push(
      'Production yêu cầu cấu hình Cloudinary hoặc gắn persistent volume qua UPLOAD_DIR / ALLOW_LOCAL_STORAGE_IN_PROD=true.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `PRODUCTION_STARTUP_CONFIG_INVALID:\n- ${errors.join('\n- ')}`,
    );
  }
}
