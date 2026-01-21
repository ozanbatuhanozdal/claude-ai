# O3 model response

Below are the **core, copy-paste-ready files** you need to turn the design into a running “@claude” GitLab bot that listens at one URL and works across your whole instance or top-level group.

---

## 1 Directory layout

```
claude-bot/
├─ docker-compose.yml
├─ Dockerfile
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ src/
   ├─ index.ts
   ├─ gitlab.ts
   └─ limiter.ts
```

---

## 2 Runtime: Hono + TypeScript

### 2.1 `src/index.ts`

```ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";
import { triggerPipeline, cancelOldPipelines } from "./gitlab";
import { limitByUser } from "./limiter";

const app = new Hono();

app.use("*", logger()); // simple access log
app.use("/healthz", (c) => c.text("ok")); // readiness probe

// Bearer-auth protects an optional “kill-switch” endpoint
app.get(
  "/admin/disable",
  bearerAuth({ token: process.env.ADMIN_TOKEN! }),
  (c) => {
    process.env.CLAUDE_DISABLED = "true";
    return c.text("disabled");
  },
);

app.post("/gitlab/events", async (c) => {
  // 1. Verify secret token
  if (c.req.header("x-gitlab-token") !== process.env.WEBHOOK_SECRET)
    return c.text("unauthorized", 401);

  // 2. Ignore everything but Note hooks
  if (c.req.header("x-gitlab-event") !== "Note Hook") return c.text("ignored");

  const body = await c.req.json<any>();
  const note: string = body.object_attributes?.note ?? "";
  const projectId: number = body.project?.id;
  const ref = body.merge_request?.source_branch || "main";
  const mrIid = body.merge_request?.iid; // internal MR id
  const authorUsername: string = body.user?.username;

  // 3. Check mention pattern
  if (!/@claude\b/i.test(note) || process.env.CLAUDE_DISABLED === "true")
    return c.text("skipped");

  // 4. Simple rate-limit: 3 triggers / author / MR / 15 min
  const key = `${authorUsername}:${projectId}:${mrIid}`;
  if (!(await limitByUser(key))) {
    console.log("rate-limited", key);
    return c.text("rate-limited", 429);
  }

  // 5. Launch pipeline & cancel older ones
  const pipelineId = await triggerPipeline(projectId, ref, {
    CLAUDE_TRIGGER: "true",
  });
  await cancelOldPipelines(projectId, pipelineId, ref);

  return c.json({ status: "started", pipelineId });
});

export default app;
```

### 2.2 `src/gitlab.ts`

```ts
import { request } from "undici";

const BASE = process.env.GITLAB_URL ?? "https://gitlab.com";
const TOKEN = process.env.BOT_TOKEN!; // personal / group access token

export async function triggerPipeline(
  projectId: number,
  ref: string,
  variables?: Record<string, string>,
) {
  const params = new URLSearchParams({ ref });
  if (variables) {
    for (const [k, v] of Object.entries(variables))
      params.append(`variables[${k}]`, v);
  }

  const res = await request(`${BASE}/api/v4/projects/${projectId}/pipeline`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": TOKEN },
    body: params,
  });
  if (res.statusCode >= 400)
    throw new Error(`GitLab API error ${res.statusCode}`);
  const json: any = await res.body.json();
  return json.id as number;
}

export async function cancelOldPipelines(
  projectId: number,
  keepPipelineId: number,
  ref: string,
) {
  const res = await request(
    `${BASE}/api/v4/projects/${projectId}/pipelines?ref=${encodeURIComponent(ref)}`,
    { headers: { "PRIVATE-TOKEN": TOKEN } },
  );
  const list: any[] = await res.body.json();
  const older = list.filter(
    (p) => p.id !== keepPipelineId && p.status === "pending",
  );
  await Promise.all(
    older.map((p) =>
      request(`${BASE}/api/v4/projects/${projectId}/pipelines/${p.id}/cancel`, {
        method: "POST",
        headers: { "PRIVATE-TOKEN": TOKEN },
      }),
    ),
  );
}
```

_`POST /projects/:id/pipeline` is the generic “create pipeline” endpoint (works with one bot token across repos). ([GitLab Docs][1])_

### 2.3 `src/limiter.ts`

```ts
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

const MAX = 3,
  WINDOW = 60 * 15; // 15 min

export async function limitByUser(key: string) {
  const now = Math.floor(Date.now() / 1000);
  await redis.zremrangebyscore(key, 0, now - WINDOW); // trim old
  const count = await redis.zcard(key);
  if (count >= MAX) return false;
  await redis.zadd(key, now, `${now}`); // add ts as member
  await redis.expire(key, WINDOW);
  return true;
}
```

---

## 3 TypeScript & tooling

### 3.1 `package.json`

```jsonc
{
  "name": "gitlab-claude-bot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
  },
  "dependencies": {
    "hono": "^4.1.0",
    "undici": "^6.16.1",
    "ioredis": "^5.4.3",
  },
  "devDependencies": {
    "@types/node": "^20.11.4",
    "tsx": "^4.7.1",
    "typescript": "^5.4.0",
  },
}
```

### 3.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "noImplicitAny": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

---

## 4 Containerisation

### 4.1 `Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 4.2 `docker-compose.yml`

```yaml
version: "3.9"

services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    restart: unless-stopped
```

---

## 5 Environment sample – `.env.example`

```env
# Webhook secret configured in System/Group hook
WEBHOOK_SECRET=supersecret

# GitLab base URL (omit for gitlab.com)
# GITLAB_URL=https://gitlab.yourcompany.com

# Personal or Group access token with `api` scope
BOT_TOKEN=glpat-xxxxxxxxxxxxxxxx

# Optional admin kill-switch token
ADMIN_TOKEN=adminkey123

# Redis connection
REDIS_URL=redis://redis:6379
```

---

## 6 Auto-included CI template

Add this file to a **template repo** or instance-level CI config.

```yaml
workflow:
  rules:
    - if: $CLAUDE_TRIGGER == "true"

claude:
  stage: claude
  script:
    - echo "Triggered by @claude"
    -  # your real work here
  interruptible: true
  timeout: 10m
```

Tie it in once through **Admin ▶ Settings ▶ CI/CD ▶ Default pipeline config** (self-managed) or “Compliance pipeline configuration” at the group level so every new repo inherits it—no per-project edits needed.

---

## 7 Quick start

```bash
cp .env.example .env                 # edit secrets & tokens
docker compose up -d --build         # runs bot + redis
```

1. **Add one System or top-group webhook** (`/gitlab/events`, secret above) with **Note events** checked. ([GitLab Docs][2], [GitLab Docs][3])
2. **Invite the bot user** as _Developer_ to every project / group it must access.
3. Mention `@claude` in any issue or MR comment → a pipeline called _claude_ appears.

The snippets above cover **HTTP handling (Hono)**, **GitLab API calls**, **rate-limiting via Redis**, **container build**, **orchestration** and the **CI template**—all you need to deploy the bot anywhere Docker runs.

[1]: https://docs.gitlab.com/api/pipelines/?utm_source=chatgpt.com "Pipelines API - GitLab Docs"
[2]: https://docs.gitlab.com/administration/system_hooks/?utm_source=chatgpt.com "System hooks - GitLab Docs"
[3]: https://docs.gitlab.com/user/project/integrations/webhook_events/?utm_source=chatgpt.com "Webhook events - GitLab Docs"

# PPLX response:

## Building a GitLab App with Docker, Node.js, and TypeScript

Building a GitLab app that reacts to webhooks, such as mentions in issues or merge requests (MRs) to trigger pipelines, involves creating a server-side application. This app can listen for events like a bot mention (e.g., @claude) and manually trigger CI/CD pipelines[1][2]. It's similar to GitHub apps but tailored for GitLab, using webhooks and the GitLab API. The app can be containerized with Docker for deployment, built using Node.js and TypeScript for robustness.

This guide assumes you have a self-managed GitLab instance or access to GitLab.com. The app's single responsibility is to handle webhook events and trigger pipelines, with features like instance-wide operation and rate limiting to prevent abuse[3].

### Is This a GitLab OAuth App?

Yes, this can be implemented as a GitLab OAuth app, which you register on the GitLab dashboard[4][5][6][7]. OAuth allows secure authentication and authorization for the app to access GitLab resources (e.g., reading issues, triggering pipelines) without exposing user credentials. Register it as an instance-wide application to avoid per-repo setup, though some pipeline configurations may still require repo-specific tweaks[8][9].

To register:

- Log in to GitLab and navigate to **User Settings > Applications** (or **Admin Area > Applications** for instance-wide)[4][5][7].
- Create a new application with:
  - Name: e.g., "Claude Bot App".
  - Redirect URI: Your app's callback URL (e.g., `http://your-app-url/callback`).
  - Scopes: Select `api`, `read_repository`, `write_repository` for pipeline triggers and event handling[4][6].
- Save to get Client ID and Secret[5][6].
- For instance-wide access, mark it as trusted in the admin area to skip user authorization[7].

This setup enables the app to act on behalf of users or the instance, reacting to mentions across projects[10].

### Requirements and Design Overview

Your app should:

- React to webhook events, such as mentions (@claude) in issues or MR comments[2][10][11].
- Trigger manual pipelines with predefined names (e.g., via GitLab API calls)[1][12].
- Work instance-wide, not limited to specific repos, reducing configuration needs[8][9][13].
- Handle rate limiting: e.g., kill excessive triggers to avoid abuse (configurable via app logic or GitLab limits)[3].
- Note: While instance-wide, manual pipeline triggers may require per-repo .gitlab-ci.yml files with predefined jobs, as pipelines are repo-specific by design[1][14][12]. You can't fully automate without some repo config.

The app runs as a Node.js server in a Docker container, listening for GitLab webhooks[15][16].

### Step-by-Step Guide to Build the App

#### 1. Set Up Node.js and TypeScript Project

- Initialize a Node.js project: `npm init -y`.
- Install dependencies: `npm install express typescript @types/express @types/node ts-node dotenv axios` (for API calls)[17].
- Add TypeScript config (`tsconfig.json`):
  ```
  {
    "compilerOptions": {
      "target": "ES6",
      "module": "commonjs",
      "strict": true,
      "esModuleInterop": true
    }
  }
  ```
- Create `src/index.ts` for the server:

  ```typescript
  import express from "express";
  import axios from "axios";
  import dotenv from "dotenv";

  dotenv.config();
  const app = express();
  app.use(express.json());

  // Webhook endpoint
  app.post("/webhook", async (req, res) => {
    const event = req.body;
    if (event.object_kind === "note" && event.note.body.includes("@claude")) {
      // Trigger pipeline logic here
      await triggerPipeline(event.project_id, event.merge_request.iid);
    }
    res.status(200).send("OK");
  });

  async function triggerPipeline(projectId: number, ref: string) {
    const token = process.env.GITLAB_TOKEN;
    await axios.post(
      `https://gitlab.example.com/api/v4/projects/${projectId}/trigger/pipeline?token=${token}&ref=${ref}`,
    );
  }

  app.listen(3000, () => console.log("App running on port 3000"));
  ```

  This listens for note events (comments) and checks for @claude mentions to trigger a pipeline[1][2][10][11].

#### 2. Integrate OAuth and Webhooks

- Use OAuth for authentication: Add `passport` and `passport-gitlab2` packages[6].
- Configure webhooks instance-wide or per-project via GitLab API to point to your app's `/webhook` endpoint[2][10][11].
- For mentions in issues/MRs: Parse the webhook payload for `note` events and check the body[2][10].
- To trigger pipelines: Use the GitLab API with a trigger token (generated per project or via OAuth)[1][12].

#### 3. Dockerize the App

- Create a `Dockerfile` for multi-stage build (build TypeScript, then run Node.js)[18][19][20][15][17][16]:

  ```
  # Build stage
  FROM node:18-alpine AS build
  WORKDIR /app
  COPY package*.json ./
  RUN npm install
  COPY . .
  RUN npx tsc

  # Production stage
  FROM node:18-alpine
  WORKDIR /app
  COPY --from=build /app/dist ./
  COPY package*.json ./
  RUN npm install --only=production
  CMD ["node", "index.js"]
  ```

- Build and run: `docker build -t gitlab-app .` then `docker run -p 3000:3000 -e GITLAB_TOKEN=your-token gitlab-app`[18][20][15].
- Use GitLab CI/CD for automated builds: Add `.gitlab-ci.yml` with stages for build and deploy[18][19][20][14][16].

#### 4. Instance-Wide Configuration

- Register the OAuth app as instance-wide to avoid per-repo setup[8][9][7][13].
- Configure a single webhook at the group or instance level if possible, or use the API to automate webhook addition across projects[10].
- For pipelines: Define manual jobs in each repo's `.gitlab-ci.yml` (e.g., a job named "claude-trigger" that runs on manual trigger)[1][12]. The app calls the trigger API with predefined refs[1].
- Limitation: Full automation without per-repo config is challenging, as pipelines and webhooks are often repo-scoped[8][11]. Use GitLab's instance limits to enforce boundaries[3].

#### 5. Rate Limiting and Abuse Prevention

- Implement in-app logic: Track requests per user/IP and reject if exceeding a threshold (e.g., 10 triggers/hour)[3].
- Use GitLab's built-in rate limits for API calls and webhooks[3].
- To "kill" excessive triggers: Add a kill switch in your app (e.g., blacklist users) or leverage GitLab's instance limits to cap CI/CD variables or jobs[3].

### Deployment and Testing

- Deploy the Docker container to a server (e.g., via GitLab Runner or Kubernetes)[15][16][9][13].
- Test: Mention @claude in an issue/MR, verify the webhook hits your app, and check if the pipeline triggers[2][10][11].
- Secure with environment variables for tokens and secrets[17].

This setup creates a responsive GitLab app with the desired functionality. For advanced features, refer to GitLab's API documentation[1][7].

[1] https://docs.gitlab.com/ci/triggers/
[2] https://gitlab.com/gitlab-org/gitlab/-/issues/31197
[3] https://docs.gitlab.com/administration/instance_limits/
[4] https://www.feathery.io/blog/gitlab-oauth
[5] https://workos.com/docs/integrations/gitlab-oauth/what-you-will-need/2-generate-client-credentials
[6] https://stateful.com/blog/gitlab-oauth
[7] https://docs.gitlab.com/integration/oauth_provider/
[8] https://docs.gitlab.com/administration/cicd/
[9] https://www.aldec.com/en/support/resources/documentation/articles/2243
[10] https://github.com/qodo-ai/pr-agent/issues/1774
[11] https://stackoverflow.com/questions/75592970/executing-a-gitlab-pipeline-from-receiving-a-webhook
[12] https://developer.harness.io/docs/platform/triggers/triggering-pipelines/
[13] https://docs.gitlab.com/runner/configuration/advanced-configuration/
[14] https://dev.to/lloyds-digital/structuring-a-cicd-workflow-in-gitlab-nodejs-example-2500
[15] https://github.com/tcallsen/node-docker-gitlab-ci
[16] https://docs.gitlab.com/ci/docker/using_docker_images/
[17] https://stackoverflow.com/questions/62294876/when-to-build-typescript-node-js-app-with-docker
[18] https://www.youtube.com/watch?v=R6U13niXtFc
[19] https://docs.gitlab.com/ci/docker/using_docker_build/
[20] https://stackoverflow.com/questions/54271852/building-a-docker-image-for-a-node-js-app-in-gitlab-ci

# Grok

Here’s a comprehensive guide to building a GitLab app using Docker, Node.js, and TypeScript that reacts to webhooks (e.g., mentions of "@claude" in projects) and triggers pipelines manually, similar to the Claude GitHub app concept. I’ll also address whether this requires a GitLab OAuth app and if it can be registered on the GitLab dashboard.

---

## Building the GitLab App

### Overview

The app’s single responsibility is to:

1. Listen for GitLab webhooks triggered by events (e.g., comments in issues or merge requests).
2. Check if the comment contains the mention "@claude".
3. If detected, manually trigger a pipeline in the corresponding project.

You’ll use:

- **Node.js** with **TypeScript** for the application logic.
- **Docker** to containerize the app for easy deployment.
- GitLab’s API and webhook system to handle events and trigger pipelines.

---

### Step 1: Set Up the Node.js + TypeScript Application

#### Prerequisites

- Install Node.js (v16 or later recommended).
- Install TypeScript globally: `npm install -g typescript`.
- Initialize a new project:
  ```bash
  mkdir gitlab-claude-app
  cd gitlab-claude-app
  npm init -y
  npm install typescript ts-node @types/node --save-dev
  npm install express node-gitlab-webhook axios
  npm install @types/express --save-dev
  tsc --init
  ```

#### Project Structure

```
gitlab-claude-app/
├── src/
│   └── index.ts
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env
```

#### Code Implementation

Create `src/index.ts`:

```typescript
import express from "express";
import GitlabWebhook from "node-gitlab-webhook";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Initialize GitLab webhook handler
const gitlab = new GitlabWebhook({ path: "/webhook" });

// Mock storage for project ID to trigger token mapping (replace with a database in production)
const triggerTokens: { [projectId: string]: string } = {
  // Example: '123': 'trigger-token-xyz'
};

// Handle webhook events
gitlab.on("issue", async (event) => {
  const payload = event.payload;
  const projectId = payload.project.id;
  const comment = payload.object_attributes?.description || "";

  if (comment.includes("@claude")) {
    console.log(`@claude mentioned in project ${projectId}`);
    await triggerPipeline(projectId);
  }
});

gitlab.on("merge_request", async (event) => {
  const payload = event.payload;
  const projectId = payload.project.id;
  const comment = payload.object_attributes?.description || "";

  if (comment.includes("@claude")) {
    console.log(`@claude mentioned in project ${projectId}`);
    await triggerPipeline(projectId);
  }
});

// Register webhook handler with Express
app.use(gitlab.handler());

// Function to trigger a pipeline
async function triggerPipeline(projectId: number) {
  const triggerToken = triggerTokens[projectId.toString()];
  if (!triggerToken) {
    console.error(`No trigger token found for project ${projectId}`);
    return;
  }

  try {
    const response = await axios.post(
      `https://gitlab.com/api/v4/projects/${projectId}/trigger/pipeline`,
      { ref: "main" }, // Specify the branch or ref to trigger
      {
        params: { token: triggerToken },
      },
    );
    console.log(`Pipeline triggered for project ${projectId}:`, response.data);
  } catch (error) {
    console.error(
      `Failed to trigger pipeline for project ${projectId}:`,
      error,
    );
  }
}

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

#### Explanation

- **Express**: Sets up a web server to receive webhook POST requests.
- **node-gitlab-webhook**: Parses GitLab webhook payloads.
- **Axios**: Makes API requests to trigger pipelines.
- **Logic**: Checks for "@claude" in issue or merge request comments and triggers a pipeline if found.
- **Storage**: Uses a simple in-memory object (`triggerTokens`) for project ID to trigger token mapping. In production, use a database (e.g., PostgreSQL or Redis).

#### Configuration

Create a `.env` file:

```
PORT=3000
```

Adjust `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es6",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

---

### Step 2: Trigger Pipelines Using Trigger Tokens

#### How It Works

- GitLab provides **pipeline trigger tokens** to manually trigger pipelines via the API without full user authentication.
- Users generate a trigger token in their project settings:  
  **Settings > CI/CD > Pipeline triggers** > Add Trigger > Copy the token.
- The app uses this token to trigger pipelines for the specific project.

#### API Call

The app makes a POST request to:

```
POST https://gitlab.com/api/v4/projects/<project-id>/trigger/pipeline?token=<trigger-token>&ref=main
```

#### Setup

- Users provide the app with their **project ID** and **trigger token** (e.g., via a registration form or config file).
- Store this mapping securely in your app (e.g., in `triggerTokens` or a database).

#### Webhook Payload

When a comment event occurs, the webhook payload includes:

- `project.id`: The project ID.
- `object_attributes.description`: The comment body.

The app extracts these to check for "@claude" and trigger the pipeline.

---

### Step 3: Containerize with Docker

#### Dockerfile

Create `Dockerfile`:

```dockerfile
# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "dist/index.js"]
```

#### Build and Run

```bash
# Build the Docker image
docker build -t gitlab-claude-app .

# Run the container
docker run -p 3000:3000 --env-file .env gitlab-claude-app
```

#### Deployment Notes

- Ensure the app’s endpoint (e.g., `http://your-server:3000/webhook`) is publicly accessible for GitLab to send webhooks.
- Use a reverse proxy (e.g., Nginx) and HTTPS in production.

---

### Step 4: Configure GitLab Webhooks

#### Manual Setup

In each GitLab project:

1. Go to **Settings > Webhooks**.
2. Set the **URL** to your app’s endpoint (e.g., `http://your-server:3000/webhook`).
3. Enable triggers for **Issues events** and **Merge request events**.
4. Optionally, add a **secret token** for security (update the app to verify it).
5. Save the webhook.

#### Payload Handling

The app listens for events like:

- **Issue comments**: Triggered when someone comments on an issue.
- **Merge request comments**: Triggered when someone comments on a merge request.

---

## Is This a GitLab OAuth App?

### Answer

- **Not necessarily**: For the basic functionality (listening to webhooks and triggering pipelines with trigger tokens), you don’t need GitLab OAuth. Trigger tokens are sufficient for pipeline triggering, and webhooks are set up manually by project owners pointing to your app’s endpoint.
- **Optional OAuth**: If you want to:
  - Automate webhook setup for users.
  - Access additional GitLab features (e.g., reading project data or managing settings) on behalf of users.
    Then, you can register it as an OAuth app.

### Can It Be Registered on the GitLab Dashboard?

- **Yes, if using OAuth**: You can register an OAuth app via **User Settings > Applications** (or Admin Area for self-hosted instances):
  - Provide an app name, redirect URI, and scopes (e.g., `api`).
  - Get a client ID and secret to implement the OAuth flow.
- **Not required for this case**: Since manual webhook setup and trigger tokens suffice, registration isn’t necessary unless you enhance the app with OAuth features.

---

## Final Summary

### How to Build It

1. **Node.js + TypeScript**:
   - Use Express and `node-gitlab-webhook` to handle webhooks.
   - Parse payloads for "@claude" mentions and trigger pipelines.
2. **Trigger Pipelines**:
   - Use project-specific trigger tokens provided by users.
   - Store project ID to token mappings securely.
3. **Docker**:
   - Containerize the app with a Dockerfile for deployment.
4. **Webhook Setup**:
   - Users manually configure webhooks in GitLab to point to your app.

### OAuth and Dashboard

- **OAuth**: Optional, only needed for advanced integrations.
- **Dashboard Registration**: Possible but not required for the basic use case.

This setup achieves the single responsibility of reacting to "@claude" mentions and triggering pipelines, similar to a Claude GitHub app, adapted for GitLab.

---

### Additional Resources

- [GitLab Webhook Documentation](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [GitLab Pipeline Triggers](https://docs.gitlab.com/ee/ci/triggers/)
- [node-gitlab-webhook on npm](https://www.npmjs.com/package/node-gitlab-webhook)
