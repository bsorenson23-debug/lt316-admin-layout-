FROM node:20-alpine AS base
WORKDIR /srv
RUN apk add --no-cache fontconfig ttf-dejavu ttf-freefont

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3100
ENV JOB_STORAGE_ROOT=/data/jobs
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /srv/dist ./dist
EXPOSE 3100
CMD ["node", "dist/index.js"]
