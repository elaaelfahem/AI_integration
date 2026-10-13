FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node server.mjs qualify.mjs /app/
RUN mkdir -p /var/cache/discovery && chown node:node /var/cache/discovery
USER node
EXPOSE 8080
CMD ["node", "/app/server.mjs"]

