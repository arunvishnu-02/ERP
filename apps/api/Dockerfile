# API: Node.js + Express. The Prisma client is already generated in src/generated, so the image
# build does not need the Prisma command line tool.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY src ./src
RUN npx --yes esbuild@0.28.2 src/server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server.js

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
