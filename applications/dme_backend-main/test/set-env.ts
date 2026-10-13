process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'access-secret-for-e2e-tests';
process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-e2e-tests';
process.env.COOKIE_SECURE = 'false';
process.env.SESSION_IDLE_TIMEOUT_MS = '12000';
process.env.TOUCH_INTERVAL_MS = '1000';
