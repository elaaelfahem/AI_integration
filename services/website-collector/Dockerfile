FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node server.mjs dns.mjs /app/
USER node
EXPOSE 8082
CMD ["node", "/app/server.mjs"]
