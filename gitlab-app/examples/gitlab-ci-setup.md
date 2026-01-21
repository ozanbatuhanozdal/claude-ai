# GitLab CI Setup for Claude Code Integration

This guide explains how to set up GitLab CI/CD to work with the Claude webhook server.

## Prerequisites

1. Claude webhook server deployed and running
2. GitLab project with CI/CD enabled
3. GitLab personal access token with `api` scope
4. Either Anthropic API key or Claude Code OAuth token

## Setup Steps

### 1. Add CI/CD Variables

In your GitLab project, go to Settings → CI/CD → Variables and add:

```yaml
# Required
GITLAB_TOKEN: your-gitlab-personal-access-token # With 'api' scope
WEBHOOK_SECRET: your-webhook-secret # Same as configured in webhook server

# Choose one authentication method:
ANTHROPIC_API_KEY: your-anthropic-api-key
# OR
CLAUDE_CODE_OAUTH_TOKEN: your-claude-oauth-token

# Optional
CLAUDE_MODEL: sonnet # Or another model
CLAUDE_INSTRUCTIONS: |
  Custom instructions for Claude...
```

### 2. Add GitLab CI Configuration

Copy the `.gitlab-ci.yml` file from this repository to your project root, or include it:

```yaml
include:
  - remote: "https://raw.githubusercontent.com/RealMikeChong/claude-code-for-gitlab/main/gitlab-app/.gitlab-ci.yml"
```

### 3. Configure Webhook in GitLab

1. Go to Settings → Webhooks
2. Add a new webhook:
   - URL: `https://your-webhook-server.com/webhook`
   - Secret Token: Same as `WEBHOOK_SECRET`
   - Trigger: Comments
   - Enable SSL verification

### 4. Configure Push Access (Optional)

If you want Claude to push changes directly:

1. Create a deploy key with write access
2. Add the private key as `CLAUDE_DEPLOY_KEY` CI/CD variable

Or use a GitLab token with push access.

## Usage

Once configured, mention `@claude` in:

- **Issue comments**: Creates a new branch and implements the requested changes
- **Merge request comments**: Makes changes on the existing MR branch

Examples:

```
@claude fix the type error in src/index.ts

@claude add error handling to the API endpoints

@claude implement the user authentication feature described above
```

## Pipeline Flow

1. User mentions `@claude` in a comment
2. Webhook server receives the event
3. Webhook server triggers GitLab pipeline with context
4. Pipeline runs Claude Code with the request
5. Claude makes changes and commits them
6. Pipeline posts results back to the issue/MR

## Customization

### Custom Branch Naming

Edit the `.gitlab-ci.yml` to change branch naming:

```yaml
variables:
  CLAUDE_BRANCH_PREFIX: "ai/" # Default: "claude/"
```

### Custom Claude Instructions

Add project-specific instructions:

```yaml
variables:
  CLAUDE_INSTRUCTIONS: |
    Always follow our coding standards:
    - Use TypeScript
    - Write tests for new features
    - Update documentation
```

### Different Models

Use different Claude models:

```yaml
variables:
  CLAUDE_MODEL: "claude-3-5-haiku-latest" # Faster, cheaper
```

## Troubleshooting

### Pipeline Not Triggering

- Check webhook secret matches
- Verify webhook is enabled and receiving events
- Check pipeline rules in `.gitlab-ci.yml`

### Authentication Errors

- Ensure GitLab token has `api` scope
- Verify Anthropic API key or Claude OAuth token is set

### Push Failures

- Check deploy key has write access
- Verify branch protection rules allow bot pushes
- Ensure git user is configured in pipeline

## Security Considerations

1. Use CI/CD variables for sensitive data (never commit secrets)
2. Restrict webhook endpoint to GitLab IPs if possible
3. Use branch protection to require reviews before merging
4. Consider rate limiting in the webhook server
5. Audit Claude's changes before merging

## Advanced Configuration

### Using with Self-Hosted GitLab

Update the `GITLAB_URL` in your webhook server:

```env
GITLAB_URL=https://gitlab.company.com
```

### Multi-Project Setup

The webhook server supports multiple projects. Each project needs:

1. Its own webhook configured
2. The same `WEBHOOK_SECRET`
3. The `.gitlab-ci.yml` file

### Custom MCP Tools

Add MCP configuration to give Claude additional capabilities:

```yaml
variables:
  CLAUDE_MCP_CONFIG: |
    {
      "mcpServers": {
        "database": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-postgres"],
          "env": {
            "DATABASE_URL": "$DATABASE_URL"
          }
        }
      }
    }
```
