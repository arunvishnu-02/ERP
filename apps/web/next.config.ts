import type { NextConfig } from 'next'

// In production Caddy sends /api to the API container. This rewrite covers local development,
// and also works as a fallback if the web app is reached directly.
const api = process.env.API_URL ?? 'http://localhost:4000'

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]
  },
}
export default config
