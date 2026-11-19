FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server.mjs evidence-policy.mjs contacts.mjs /app/
USER node
EXPOSE 8083
CMD ["node", "/app/server.mjs"]
