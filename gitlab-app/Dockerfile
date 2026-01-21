FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies only
RUN bun install --production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build pipeline runner for GitLab CI
RUN bun build src/pipeline-runner.ts --target=node --outfile=dist/pipeline-runner.js

# Create non-root user
RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]