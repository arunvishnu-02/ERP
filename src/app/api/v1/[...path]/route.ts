// Every REST endpoint under /api/v1 is served from here. The routes themselves are in src/server.
import { handleApi } from '@/server/app'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const handler = (request: Request) => handleApi(request)
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS }
