// Test configuration. The app connects as the restricted application role so that
// every test also exercises the database grants and RLS policies.
const base = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432";
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://techtitans_app_test:test_app_password@localhost:5432/techtitans_test";
process.env.TEST_OWNER_URL = `${base}/techtitans_test`;
process.env.APP_SECRET_PEPPER = "test-pepper-test-pepper-test-pepper-0123456789";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.OTP_PROVIDER = "dev";
process.env.STORAGE_DRIVER = "database";
process.env.DATABASE_POOL_MAX = "30";
