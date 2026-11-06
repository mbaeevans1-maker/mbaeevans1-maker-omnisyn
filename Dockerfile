# ---------- build stage ----------
# Alpine/musl base: avoids the unfixed Debian glibc advisories that block the image scan.
FROM node:22-alpine AS build

# Build toolchain is required because better-sqlite3 compiles from source on musl.
RUN apk upgrade --no-cache \
 && apk add --no-cache python3 make g++

WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime

RUN apk upgrade --no-cache \
 && apk add --no-cache libstdc++ tini

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
