FROM node:22-alpine
WORKDIR /app
COPY server.mjs model.mjs ./
USER node
EXPOSE 8085
CMD ["node","server.mjs"]
