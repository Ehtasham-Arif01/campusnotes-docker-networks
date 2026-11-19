FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first to leverage the layer cache
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server.js ./

# Run as the unprivileged user shipped with the node image
USER node

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "server.js"]
