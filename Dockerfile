# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
