FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json /app/package.json
COPY apps/api/package.json /app/apps/api/package.json
COPY apps/web/package.json /app/apps/web/package.json
COPY packages/shared/package.json /app/packages/shared/package.json

RUN npm install

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY . /app

ENV NODE_ENV=development
EXPOSE 3000 5173

CMD ["npm", "run", "dev:node"]

