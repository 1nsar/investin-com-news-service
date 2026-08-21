# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# build also copies the .sql migrations into dist/ - tsc does not emit them
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY data/catalogue ./data/catalogue

# The service caches the ~7MB Finnhub US symbol directory under data/catalogue
# on first run. COPY leaves that directory owned by root, so the non-root user
# below could not write it and setup died with EACCES - taking the whole
# `docker compose up` path down, because `api` waits on `setup`.
RUN chown -R node:node /app/data

# Non-root. The only thing it writes outside the database is that cache.
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/api/server.js"]
