#!/bin/bash
set -e

# Generate MCP_TOKEN if not provided
if [ -z "$MCP_TOKEN" ]; then
  MCP_TOKEN=$(openssl rand -hex 32)
  export MCP_TOKEN
  echo "Generated MCP_TOKEN: $MCP_TOKEN"
  echo "You can set this as an environment variable to keep it consistent across restarts."
fi

# Run Prisma migrations if DATABASE_PATH is set
if [ -n "$DATABASE_PATH" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy
fi

# Set WAL mode for main database if DATABASE_PATH is set
if [ -n "$DATABASE_PATH" ]; then
  echo "Setting WAL mode for main database..."
  sqlite3 "$DATABASE_PATH" "PRAGMA journal_mode = WAL;"
fi

# Set WAL mode for cache database if CACHE_DATABASE_PATH is set
if [ -n "$CACHE_DATABASE_PATH" ]; then
  echo "Setting WAL mode for cache database..."
  sqlite3 "$CACHE_DATABASE_PATH" "PRAGMA journal_mode = WAL;"
fi

# Start the application
echo "Starting application..."
npm start
