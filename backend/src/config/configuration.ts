export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  currency: process.env.CURRENCY || 'VND',
  database: {
    uri:
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017/travelshare',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ||
      'dev-access-secret-key-change-in-production-32chars',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      'dev-refresh-secret-key-change-in-production-32chars',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:4000/api/v1/auth/google/callback',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-4-hydrogen',
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '60000', 10),
  },
});
