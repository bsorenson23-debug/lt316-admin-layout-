FROM node:20-alpine AS deps
WORKDIR /srv
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS build
WORKDIR /srv
COPY --from=deps /srv/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /srv
ENV NODE_ENV=production
ENV PORT=3100
ENV JOB_STORAGE_ROOT=/data/jobs
COPY --from=build /srv/package.json ./package.json
COPY --from=build /srv/node_modules ./node_modules
COPY --from=build /srv/dist ./dist
EXPOSE 3100
CMD ["node", "dist/index.js"]
