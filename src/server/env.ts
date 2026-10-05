import os from 'node:os'
import path from 'node:path'

/** A setting is missing or wrong. The message is safe to show: it names the setting, never its value. */
export class ConfigError extends Error {}

const need = (k: string) => {
  const v = process.env[k]
  if (!v) throw new ConfigError(`${k} is not set. Add it to the environment variables of the app.`)
  return v
}

// The address people use in the browser, remembered from the first request when APP_URL is not set.
let seenOrigin: string | undefined
export const rememberOrigin = (origin: string) => { seenOrigin ??= origin }

/**
 * Settings are read when they are first used, not when the file is loaded,
 * so `next build` works without a database or secrets.
 */
export const env = {
  /** postgresql://user:password@host:5432/database */
  get databaseUrl() { return need('DATABASE_URL') },
  /** 64 hex characters. Encrypts stored website passwords and the mailbox password. */
  get encryptionKey() {
    const k = need('ENCRYPTION_KEY')
    if (!/^[0-9a-f]{64}$/i.test(k)) throw new ConfigError('ENCRYPTION_KEY must be 64 hex characters. Make one with: openssl rand -hex 32')
    return k
  },
  /** Uploaded files. Kept outside the app folder by default, because hosts replace the app folder on every deployment. */
  get uploadDir() { return process.env.UPLOAD_DIR || path.join(os.homedir(), 'cx-crm-erp-data', 'uploads') },
  get appUrl() { return (process.env.APP_URL || seenOrigin || 'http://localhost:3000').replace(/\/$/, '') },
  get cookieSecure() { return process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : this.appUrl.startsWith('https://') },
  get timezone() { return process.env.APP_TIMEZONE || 'Asia/Kolkata' },
  get runJobs() { return process.env.RUN_JOBS !== 'false' },
  get poolSize() { return Math.max(1, Number(process.env.DATABASE_POOL_SIZE) || 5) },
}

/**
 * The database address. It comes from DATABASE_URL, or, when that is not set, from DB_HOST, DB_PORT,
 * DB_USER, DB_PASSWORD and DB_NAME (handy when the password has characters that are awkward in an address).
 */
export function dbUrl() {
  if (!process.env.DATABASE_URL && process.env.DB_USER && process.env.DB_NAME) {
    const host = process.env.DB_HOST || 'localhost'
    const port = process.env.DB_PORT || '5432'
    const auth = `${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD ?? '')}`
    return `postgresql://${auth}@${host}:${port}/${encodeURIComponent(process.env.DB_NAME)}`
  }
  const address = env.databaseUrl
  let u: URL
  try { u = new URL(address) } catch { throw new ConfigError('DATABASE_URL is not a valid address. It should look like postgresql://user:password@host:5432/database') }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') throw new ConfigError('DATABASE_URL must start with postgresql://')
  return address
}
