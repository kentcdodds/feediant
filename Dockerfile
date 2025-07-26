# Feediant Docker Image
#
# This is a zero-configuration Docker image for Feediant.
# The container will auto-generate an MCP_TOKEN if not provided.
#
# BUILD:
#   docker build -t feediant .
#
# USAGE EXAMPLES:
#
# Basic usage (auto-generates MCP_TOKEN):
#   docker run -d --name feediant -p 5678:3000 feediant
#
# With custom MCP_TOKEN:
#   docker run -d --name feediant -p 5678:3000 -e MCP_TOKEN=my-custom-token feediant
#
# With data persistence:
#   docker run -d --name feediant -p 5678:3000 -v /host/data:/data feediant
#
# With multiple media paths:
#   docker run -d --name feediant -p 5678:3000 \
#     -v /host/data:/data \
#     -v /host/music:/music \
#     -v /host/audiobooks:/audiobooks \
#     -v /host/podcasts:/podcasts \
#     -e MEDIA_PATHS="/music:/audiobooks:/podcasts" \
#     feediant
#
# Complete example with all options:
#   docker run -d --name feediant -p 5678:3000 \
#     -v /Users/kentcdodds/media:/data \
#     -v /Users/kentcdodds/music:/music \
#     -v /Users/kentcdodds/audiobooks:/audiobooks \
#     -v /Users/kentcdodds/podcasts:/podcasts \
#     -e MEDIA_PATHS="/music:/audiobooks:/podcasts" \
#     -e MCP_TOKEN=your-secret-token \
#     feediant
#
# ENVIRONMENT VARIABLES:
#   MCP_TOKEN     - Authentication token (auto-generated if not set)
#   DATA_PATH     - Database storage path (default: /data)
#   MEDIA_PATHS   - Colon-separated media directories (default: /media)
#   PORT          - Application port (default: 3000, internal only)
#
# VOLUMES:
#   /data         - Database files (sqlite.db, cache.db)
#   /media*       - Media directories (mount your media here)

FROM node:24-bookworm-slim AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:24-bookworm-slim AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npx prisma generate
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y ffmpeg sqlite3 && rm -rf /var/lib/apt/lists/*
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=build-env /app/generated /app/generated
COPY --from=build-env /app/prisma /app/prisma
COPY ./startup.sh /app/startup.sh
WORKDIR /app

# Required env variables:
# ENV MCP_TOKEN

ENV DATA_PATH="/data"
ENV MEDIA_PATHS="/media"
ENV NODE_ENV="production"
# For WAL support: https://github.com/prisma/prisma-engines/issues/4675#issuecomment-1914383246
ENV PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK="1"

# Derived env variables:
ENV DATABASE_FILENAME="sqlite.db"
ENV DATABASE_PATH="$DATA_PATH/$DATABASE_FILENAME"
ENV DATABASE_URL="file:$DATABASE_PATH"
ENV CACHE_DATABASE_FILENAME="cache.db"
ENV CACHE_DATABASE_PATH="$DATA_PATH/$CACHE_DATABASE_FILENAME"

# add shortcut for connecting to database CLI
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$DATABASE_PATH" > /usr/local/bin/database-cli && chmod +x /usr/local/bin/database-cli
# and one for the cache database
RUN echo "#!/bin/sh\nset -x\nsqlite3 \$CACHE_DATABASE_PATH" > /usr/local/bin/cache-database-cli && chmod +x /usr/local/bin/cache-database-cli

RUN chmod +x /app/startup.sh

CMD ["/app/startup.sh"]
