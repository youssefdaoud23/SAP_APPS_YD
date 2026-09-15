FROM node:22-alpine

WORKDIR /app
COPY . .
RUN node scripts/generate-build-info.js \
    && rm -rf /app/.git \
    && mkdir -p /app/data \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=8081
ENV WORKSPACE_FILE=/app/data/workspace.json
EXPOSE 8081

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD node -e "const http=require('http');const r=http.get('http://127.0.0.1:8081/healthz',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(2000,()=>{r.destroy();process.exit(1)})"

USER node
CMD ["node", "server.js"]
