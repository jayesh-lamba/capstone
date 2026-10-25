require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  db: {
    url: process.env.DATABASE_URL || 'postgresql://flyrank_user:flyrank_secret_pass@localhost:5432/flyrank_widgets',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'flyrank_user',
    password: process.env.POSTGRES_PASSWORD || 'flyrank_secret_pass',
    database: process.env.POSTGRES_DB || 'flyrank_widgets',
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_key_flyrank_capstone_2026_super_secure_min_32_chars',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
      .split(',')
      .map(origin => origin.trim()),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxPerIp: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_IP || '15', 10),
    maxPerWidget: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_PER_WIDGET || '60', 10),
  },

  maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10kb',

  geo: {
    providerAUrl: process.env.GEO_PROVIDER_A_URL || 'http://ip-api.com/json/',
    providerBUrl: process.env.GEO_PROVIDER_B_URL || 'https://ipapi.co/',
    timeoutMs: parseInt(process.env.GEO_TIMEOUT_MS || '1500', 10),
    mockFailA: process.env.MOCK_GEO_PROVIDER_A_FAIL === 'true',
    mockFailB: process.env.MOCK_GEO_PROVIDER_B_FAIL === 'true',
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || 'console',
    smtpHost: process.env.SMTP_HOST || 'localhost',
    smtpPort: parseInt(process.env.SMTP_PORT || '1025', 10),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    from: process.env.FROM_EMAIL || 'no-reply@flyrank.local',
  },

  sideEffects: {
    webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '2000', 10),
    simulateFailure: process.env.SIMULATE_SIDE_EFFECT_FAILURE === 'true',
  },
};

module.exports = config;
