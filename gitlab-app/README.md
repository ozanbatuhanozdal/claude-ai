# GitLab Claude Webhook Server

A lightweight webhook server that listens for `@claude` mentions in GitLab issues and merge requests, then triggers pipelines automatically.

## Features

- Single webhook endpoint for all projects
- Triggers pipelines when `@claude` is mentioned in comments
- Rate limiting (3 triggers per user per resource per 15 minutes)
- Works with personal access tokens (no OAuth required)
- Minimal dependencies (Hono + Redis)
- Docker-ready deployment
- Optional Discord notifications for pipeline triggers and rate limits

## Quick Start

### Using Pre-built Docker Image

> **Note:** The Docker image needs to be made public first. Go to the [package settings](https://github.com/RealMikeChong/claude-code-for-gitlab/pkgs/container/claude-code-gitlab-app) and change the visibility to "Public".

```bash
docker run -d \
  --name gitlab-claude-webhook \
  -p 3000:3000 \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -e WEBHOOK_SECRET=your-webhook-secret-here \
  ghcr.io/realmikechong/claude-code-gitlab-app:latest
```

### Building from Source

If the pre-built image is not accessible, you can build it locally:

```bash
# Clone the repository
git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git
cd claude-code-for-gitlab/gitlab-app

# Build the Docker image
docker build -t gitlab-claude-webhook .

# Run the locally built image
docker run -d \
  --name gitlab-claude-webhook \
  -p 3000:3000 \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -e WEBHOOK_SECRET=your-webhook-secret-here \
  gitlab-claude-webhook
```

### Using Docker Compose

1. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your GitLab personal access token:

   ```env
   GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
   WEBHOOK_SECRET=your-webhook-secret-here
   ```

3. Choose your deployment method:

   **Option A: Simple deployment (with local Redis)**

   ```bash
   docker-compose -f docker-compose.simple.yml up -d
   ```

   **Option B: With Cloudflare Tunnel (no port exposure needed)**

   ```bash
   # Add your Cloudflare tunnel token to .env:
   # CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here
   docker-compose up -d
   ```

## GitLab Setup

1. In your GitLab instance or group:

   - Go to **Settings > Webhooks**
   - Add webhook URL: `https://your-server.com/webhook`
   - Secret token: Use the same value as `WEBHOOK_SECRET` in `.env`
   - Enable trigger: **Comments**
   - Save webhook

2. In your project's `.gitlab-ci.yml`, add a job that runs when triggered:

   ```yaml
   workflow:
     rules:
       - if: $CLAUDE_TRIGGER == "true"

   claude:
     stage: claude
     script:
       - echo "Triggered by @claude"
       -  # Your Claude integration here
     interruptible: true
     timeout: 10m
   ```

## Environment Variables

- `GITLAB_URL`: GitLab instance URL (default: https://gitlab.com)
- `GITLAB_TOKEN`: Personal access token with `api` scope
- `WEBHOOK_SECRET`: Secret token for webhook verification
- `PORT`: Server port (default: 3000)
- `REDIS_URL`: Redis connection URL
- `RATE_LIMIT_MAX`: Max requests per window (default: 3)
- `RATE_LIMIT_WINDOW`: Time window in seconds (default: 900)
- `CANCEL_OLD_PIPELINES`: Cancel older pending pipelines (default: true)
- `ADMIN_TOKEN`: Optional admin token for /admin endpoints
- `TRIGGER_PHRASE`: Custom trigger phrase instead of @claude (default: @claude)
- `DISCORD_WEBHOOK_URL`: Optional Discord webhook URL for notifications

## Pipeline Variables

When a pipeline is triggered, these variables are available:

- `CLAUDE_TRIGGER`: Always "true"
- `CLAUDE_AUTHOR`: Username who mentioned @claude
- `CLAUDE_RESOURCE_TYPE`: "merge_request" or "issue"
- `CLAUDE_RESOURCE_ID`: MR/Issue IID
- `CLAUDE_NOTE`: The full comment text
- `TRIGGER_PHRASE`: The trigger phrase used (e.g., "@claude")
- `DIRECT_PROMPT`: The text after the trigger phrase
- `CLAUDE_PROJECT_PATH`: Project path with namespace
- `GITLAB_WEBHOOK_PAYLOAD`: Full webhook payload as JSON string

## Admin Endpoints

- `GET /health` - Health check
- `GET /admin/disable` - Disable bot (requires Bearer token)
- `GET /admin/enable` - Enable bot (requires Bearer token)

## Discord Notifications

When configured with a Discord webhook URL, the bot will send notifications for:

- **Pipeline Triggers**: Rich embed with project info, author, resource details, branch, pipeline ID, and direct prompt
- **Rate Limit Events**: Alerts when users hit the rate limit

To enable Discord notifications:

1. Create a Discord webhook in your server settings
2. Set the `DISCORD_WEBHOOK_URL` environment variable
3. Notifications will be sent automatically (fire-and-forget)

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run typecheck
```

## Branch Creation Behavior

When Claude is triggered from a GitLab issue comment:

1. **Automatic Branch Creation**: A new branch is created with the format `claude/issue-{IID}-{sanitized-title}-{timestamp}`
2. **Unique Branch Names**: Timestamps ensure each branch is unique, preventing conflicts
3. **No Main Branch Execution**: If branch creation fails, the webhook returns an error. Claude will **never** execute on the main/default branch
4. **Merge Request Source**: For existing merge requests, Claude uses the MR's source branch

This ensures that:

- Protected branches remain safe from automated changes
- Each Claude execution has its own isolated branch
- Failed branch creation stops the process entirely (fail-safe behavior)
