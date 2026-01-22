/**
 * Provider Factory
 *
 * Creates the appropriate SCM provider based on the environment
 */

import { GitHubProvider } from "./github-provider";
import { GitLabProvider } from "./gitlab-provider";
import type {
  SCMProvider,
  GitHubProviderOptions,
  GitLabProviderOptions,
} from "./scm-provider";
import * as core from "@actions/core";

export type ProviderType = "github" | "gitlab";

export interface ProviderFactoryOptions {
  platform?: ProviderType;
  token: string;
  triggerPhrase?: string;
  directPrompt?: string;
}

/**
 * Detects the platform based on environment variables
 */
export function detectPlatform(): ProviderType {
  // Check for explicit platform setting
  const explicitPlatform = process.env.CI_PLATFORM as ProviderType;
  if (explicitPlatform === "gitlab" || explicitPlatform === "github") {
    return explicitPlatform;
  }

  // Auto-detect based on CI environment variables
  if (process.env.GITLAB_CI === "true" || process.env.CI_PROJECT_ID) {
    return "gitlab";
  }

  if (process.env.GITHUB_ACTIONS === "true") {
    return "github";
  }

  // Default to GitHub for backward compatibility
  console.log("Could not detect CI platform, defaulting to GitHub");
  return "github";
}

/**
 * Creates an SCM provider instance based on the detected or specified platform
 */
export function createProvider(options: ProviderFactoryOptions): SCMProvider {
  const platform = options.platform || detectPlatform();

  console.log(`Creating ${platform} provider`);

  switch (platform) {
    case "gitlab": {
      // Get GitLab-specific configuration
      const projectId = process.env.CI_PROJECT_ID;
      
      // Map CLAUDE_RESOURCE_ID based on CLAUDE_RESOURCE_TYPE
      // Webhook server sets CLAUDE_RESOURCE_TYPE and CLAUDE_RESOURCE_ID
      const resourceType = process.env.CLAUDE_RESOURCE_TYPE;
      const claudeResourceId = process.env.CLAUDE_RESOURCE_ID;
      
      // For webhook-triggered pipelines, use CLAUDE_RESOURCE_ID based on type
      // For native MR pipelines, use CI_MERGE_REQUEST_IID
      let mrIid: string | undefined;
      let issueIid: string | undefined;
      
      if (resourceType === "merge_request" && claudeResourceId) {
        // Webhook-triggered MR pipeline
        mrIid = claudeResourceId;
        console.log(`Mapping CLAUDE_RESOURCE_ID (${claudeResourceId}) to mrIid for merge_request`);
      } else if (resourceType === "issue" && claudeResourceId) {
        // Webhook-triggered issue pipeline
        issueIid = claudeResourceId;
        console.log(`Mapping CLAUDE_RESOURCE_ID (${claudeResourceId}) to issueIid for issue`);
      } else {
        // Fallback to GitLab CI variables (for native MR pipelines)
        mrIid = process.env.CI_MERGE_REQUEST_IID;
        if (claudeResourceId) {
          issueIid = claudeResourceId; // Keep for backward compatibility
        }
      }
      
      const host = process.env.CI_SERVER_URL || "https://gitlab.com";
      const pipelineUrl = process.env.CI_PIPELINE_URL;

      if (!projectId) {
        throw new Error("GitLab project ID is required (CI_PROJECT_ID)");
      }

      console.log(`GitLab Provider Configuration:`);
      console.log(`  Resource Type: ${resourceType || 'not set'}`);
      console.log(`  CLAUDE_RESOURCE_ID: ${claudeResourceId || 'not set'}`);
      console.log(`  mrIid: ${mrIid || 'undefined'}`);
      console.log(`  issueIid: ${issueIid || 'undefined'}`);

      const gitlabOptions: GitLabProviderOptions = {
        token: options.token,
        projectId,
        mrIid,
        issueIid,
        host,
        pipelineUrl,
        triggerPhrase: options.triggerPhrase,
        directPrompt: options.directPrompt,
      };

      return new GitLabProvider(gitlabOptions);
    }

    case "github": {
      // Get GitHub-specific configuration
      const runId = process.env.GITHUB_RUN_ID || "";
      const actor = process.env.GITHUB_ACTOR || "";
      const eventName = process.env.GITHUB_EVENT_NAME || "";
      const repository = process.env.GITHUB_REPOSITORY || "";
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        throw new Error("GitHub repository must be in format owner/repo");
      }

      const githubOptions: GitHubProviderOptions = {
        token: options.token,
        runId,
        actor,
        eventName,
        repository: { owner, repo },
        triggerPhrase: options.triggerPhrase,
        directPrompt: options.directPrompt,
      };

      return new GitHubProvider(githubOptions);
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}


/**
 * Gets the appropriate token based on the platform
 */
export function getToken(): string {
  const platform = detectPlatform();

  if (platform === "gitlab") {
    // Check for GitLab access token first (highest priority)
    const glAccessToken = process.env.CLAUDE_CODE_GL_ACCESS_TOKEN;
    if (glAccessToken) {
      // Check if the token is a literal environment variable string (not expanded)
      if (glAccessToken.startsWith("$")) {
        console.error(
          `ERROR: CLAUDE_CODE_GL_ACCESS_TOKEN appears to be unexpanded: "${glAccessToken}"`,
        );
        console.error(
          `This usually means the variable is not defined in GitLab CI/CD settings.`,
        );
        console.error(
          `Please add CLAUDE_CODE_GL_ACCESS_TOKEN to your GitLab project's CI/CD variables.`,
        );
        // Don't use this invalid token
      } else {
        console.log(
          `Using CLAUDE_CODE_GL_ACCESS_TOKEN for GitLab authentication (length: ${glAccessToken.length})`,
        );
        return glAccessToken;
      }
    }

    // Check for OAuth token (new method)
    const oauthToken =
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      core.getInput("claude_code_oauth_token");
    if (oauthToken) {
      console.log("Using Claude Code OAuth token for GitLab authentication");
      return oauthToken;
    }

    // Fall back to traditional GitLab token
    const token = process.env.GITLAB_TOKEN || core.getInput("gitlab_token");
    if (!token) {
      throw new Error(
        "GitLab authentication required (CLAUDE_CODE_GL_ACCESS_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, GITLAB_TOKEN, or gitlab_token input)",
      );
    }
    return token;
  }

  // For GitHub, check OAuth token first
  const oauthToken =
    process.env.CLAUDE_CODE_OAUTH_TOKEN ||
    core.getInput("claude_code_oauth_token");
  if (oauthToken) {
    console.log("Using Claude Code OAuth token for GitHub authentication");
    return oauthToken;
  }

  // Fall back to traditional GitHub token sources
  const githubToken =
    core.getInput("github_token") ||
    process.env.GITHUB_TOKEN ||
    core.getInput("anthropic_api_key"); // Backward compatibility

  if (!githubToken) {
    throw new Error(
      "GitHub authentication required (claude_code_oauth_token or github_token)",
    );
  }

  return githubToken;
}

/**
 * Export all providers for direct access if needed
 */
export { GitHubProvider, GitLabProvider };
export type { SCMProvider } from "./scm-provider";
