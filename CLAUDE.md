# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **GitLab OAuth Application** that integrates Claude AI directly into GitLab workflows. It provides a web-based dashboard for managing Claude integration across multiple GitLab projects, with intelligent webhook handling for real-time responses to issues, merge requests, and comments.

## Architecture

### Technology Stack

- **Backend**: Node.js + Express.js + TypeScript
- **Frontend**: React 18 + Vite + TypeScript
- **Package Manager**: Bun (for dependency management)
- **Runtime**: Node.js (for production deployment)
- **Storage**: Encrypted JSON files (no database required)
- **Authentication**: GitLab OAuth2 with session management
- **Deployment**: Docker + Docker Compose with optional Cloudflare Tunnel

### Project Structure

```
gitlab-app/
├── server/                    # Express.js backend
│   ├── routes/               # API and auth routes
│   ├── services/             # Claude AI integration
│   ├── utils/                # Configuration and utilities
│   └── server.ts             # Main server entry point
├── client/                   # React frontend (SPA)
│   ├── src/
│   │   ├── components/       # Reusable React components
│   │   ├── pages/            # Page components (Dashboard, Settings)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # API client utilities
│   ├── index.html            # HTML entry point
│   ├── vite.config.ts        # Vite configuration
│   └── package.json          # Client dependencies
├── docker-compose.yml        # Multi-service deployment
├── Dockerfile               # Multi-stage build
└── package.json             # Server dependencies and scripts
```

## Development Environment

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Bun**: v1.0.0 or higher (for package management)
- **Docker**: For containerized deployment

### Setup and Installation

```bash
# Install all dependencies (server + client)
cd gitlab-app && bun run install:all

# Or install separately
bun install                    # Server dependencies
cd client && bun install      # Client dependencies
```

### Development Commands

```bash
# Development (runs both server and client in parallel)
bun run dev:both              # Recommended for full-stack development
bun run dev:server            # Backend only (port 3000)
bun run dev:client            # Frontend only (port 5173)

# Building
bun run build                 # Build both server and client
bun run build:server          # TypeScript compilation
bun run build:client          # Vite production build

# Type checking
bun run typecheck             # Check both server and client

# Production
bun run start                 # Start production server
```

### Development Workflow

1. **Backend Development**: Express server runs on `http://localhost:3000`
2. **Frontend Development**: Vite dev server runs on `http://localhost:5173` with proxy to backend
3. **Full-Stack**: Use `bun run dev:both` to run both servers simultaneously

## Key Components

### Backend (Express.js)

- **OAuth Routes** (`server/routes/auth.ts`): GitLab OAuth2 flow and session management
- **API Routes** (`server/routes/api.ts`): Project management and configuration APIs
- **Webhook Handler** (`server/routes/webhook.ts`): GitLab webhook processing
- **Claude Integration** (`server/services/claude-handler.ts`): AI response generation
- **Data Storage** (`server/utils/config.ts`): Encrypted JSON storage with AES encryption

### Frontend (React SPA)

- **Authentication** (`client/src/hooks/useAuth.tsx`): Session-based auth with React Query
- **Project Management** (`client/src/hooks/useProjects.tsx`): GitLab project integration
- **Dashboard** (`client/src/pages/Dashboard.tsx`): Main project overview and management
- **Settings** (`client/src/pages/ProjectSettings.tsx`): Per-project Claude configuration
- **Components**: Reusable UI components with inline styling (no CSS framework dependency)

## Authentication & Security

### GitLab OAuth2 Flow

1. User clicks "Login with GitLab" → redirects to GitLab OAuth
2. GitLab redirects back with authorization code
3. Server exchanges code for access/refresh tokens
4. User session created with encrypted token storage
5. React app receives user data via `/auth/me` endpoint

### Data Encryption

- **User tokens**: AES-256-GCM encryption for OAuth tokens
- **Session data**: Express-session with configurable secrets
- **Storage**: JSON files with encrypted sensitive fields

### Security Features

- **CORS**: Configured for development and production origins
- **Helmet**: Security headers and CSP policies
- **Session Management**: HTTPOnly cookies with configurable expiration
- **Token Refresh**: Automatic OAuth token renewal

## Claude AI Integration

### Webhook Processing

1. GitLab sends webhook to `/webhook/:projectId`
2. Server validates webhook signature and processes event
3. Claude handler analyzes event context (issue, MR, comment)
4. If `@claude` mentioned, generates AI response
5. Response posted back to GitLab via API

### Configuration Options

Per-project settings available in React dashboard:

- **Trigger Phrase**: Customize mention trigger (default: `@claude`)
- **System Prompt**: Project-specific AI instructions
- **Auto-reply**: Enable/disable automatic responses
- **Code Context**: Include relevant code files in AI context
- **Max Context Files**: Limit number of files for context

## Deployment

### Docker Deployment

```bash
# Basic deployment
docker-compose up -d

# With Cloudflare Tunnel
docker-compose --profile tunnel up -d

# With Redis and monitoring
docker-compose --profile full up -d
```

### Environment Configuration

Required environment variables:

```bash
# GitLab OAuth
GITLAB_APP_ID=your_gitlab_app_id
GITLAB_APP_SECRET=your_gitlab_app_secret
GITLAB_URL=https://gitlab.com  # or your GitLab instance

# Claude AI (choose one)
ANTHROPIC_API_KEY=your_anthropic_key
CLAUDE_CODE_OAUTH_TOKEN=your_claude_oauth_token

# Security
SESSION_SECRET=random_secure_string
ENCRYPTION_KEY=random_32_byte_key

# Optional: Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token
```

### Production Considerations

- **Reverse Proxy**: Use Nginx or Cloudflare Tunnel for SSL termination
- **Session Storage**: Consider Redis for multi-instance deployments
- **Monitoring**: Optional Prometheus/Grafana stack included
- **Backups**: Backup `./data` directory for user configurations
- **Updates**: Use GitHub Container Registry images for updates

## Important Implementation Notes

- **Hybrid Architecture**: Server-side OAuth with client-side React SPA
- **No Database**: Uses encrypted JSON files for simplicity and portability
- **Multi-Project**: Single installation supports unlimited GitLab projects
- **Real-time**: Webhook-based responses for immediate AI assistance
- **Responsive**: React frontend works on desktop and mobile devices
- **Docker-First**: Designed for containerized deployment with Docker Compose
