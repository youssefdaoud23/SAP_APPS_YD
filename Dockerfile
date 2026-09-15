FROM node:22-alpine

WORKDIR /app
COPY . .
RUN node scripts/generate-build-info.js \
    && rm -rf /app/.git \
    && mkdir -p /app/data \
    && chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=8080
ENV WORKSPACE_FILE=/app/data/workspace.json
EXPOSE 8080

USER node
CMD ["node", "server.js"]
