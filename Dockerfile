FROM node:22-bookworm-slim AS base

RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# No build step needed for this project since it's plain JavaScript

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/index.js /app/index.js
COPY --from=build /app/discord-service.js /app/discord-service.js
COPY --from=build /app/public /app/public

EXPOSE 3000

CMD ["pnpm", "start"]
