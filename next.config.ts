import type { NextConfig } from 'next'

const config: NextConfig = {
  poweredByHeader: false,
  // Types are checked in development and in `npm run typecheck`. Set SKIP_TYPECHECK=1 on a small host to make the build lighter.
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === '1' },
  // Database and mail drivers are loaded from node_modules at run time instead of being bundled.
  serverExternalPackages: ['mariadb', '@prisma/adapter-mariadb', 'nodemailer'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
export default config
