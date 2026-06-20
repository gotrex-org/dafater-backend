# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build
# precompile the seed to plain JS (dist-seed/prisma/seed.js) so runtime needs no ts-node
RUN npx tsc -p tsconfig.seed.json

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl libc6-compat
COPY package*.json ./
RUN npm install --omit=dev
# generated prisma client + built app + compiled seed
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 4000
CMD ["sh", "./docker-entrypoint.sh"]
