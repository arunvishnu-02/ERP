const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing environment variable ${k}`)
  return v
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  encryptionKey: need('ENCRYPTION_KEY'),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  migrationsDir: process.env.MIGRATIONS_DIR ?? './migrations',
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
  runJobs: process.env.RUN_JOBS !== 'false',
}

if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
if (!/^[0-9a-f]{64}$/i.test(env.encryptionKey)) throw new Error('ENCRYPTION_KEY must be 64 hex characters')
