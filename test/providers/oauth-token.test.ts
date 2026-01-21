import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getToken } from "../../src/providers/provider-factory";

describe("OAuth Token Support", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all token-related environment variables
    delete process.env.CLAUDE_CODE_GL_ACCESS_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.INPUT_GITLAB_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("GitHub Platform", () => {
    beforeEach(() => {
      process.env.GITHUB_ACTIONS = "true";
    });

    test("prefers OAuth token over traditional GitHub token", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-123";
      process.env.GITHUB_TOKEN = "github-token-456";

      const token = getToken();
      expect(token).toBe("oauth-token-123");
    });

    test("uses OAuth token from input variable", () => {
      process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN = "input-oauth-token";
      process.env.GITHUB_TOKEN = "github-token";

      const token = getToken();
      expect(token).toBe("input-oauth-token");
    });

    test("falls back to github_token input when OAuth token not available", () => {
      process.env.INPUT_GITHUB_TOKEN = "input-github-token";
      process.env.GITHUB_TOKEN = "env-github-token";

      const token = getToken();
      expect(token).toBe("input-github-token");
    });

    test("falls back to GITHUB_TOKEN env var when no inputs available", () => {
      process.env.GITHUB_TOKEN = "env-github-token";

      const token = getToken();
      expect(token).toBe("env-github-token");
    });

    test("throws error when no tokens available", () => {
      // All tokens already cleared in beforeEach
      expect(() => getToken()).toThrow("GitHub authentication required");
    });
  });

  describe("GitLab Platform", () => {
    beforeEach(() => {
      process.env.GITLAB_CI = "true";
      process.env.CI_PROJECT_ID = "123";
    });

    test("prefers GL access token over all other tokens", () => {
      process.env.CLAUDE_CODE_GL_ACCESS_TOKEN = "gl-access-token-123";
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-456";
      process.env.GITLAB_TOKEN = "gitlab-token-789";

      const token = getToken();
      expect(token).toBe("gl-access-token-123");
    });

    test("prefers OAuth token over traditional GitLab token", () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-123";
      process.env.GITLAB_TOKEN = "gitlab-token-456";

      const token = getToken();
      expect(token).toBe("oauth-token-123");
    });

    test("uses OAuth token from input variable", () => {
      process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN = "input-oauth-token";
      process.env.GITLAB_TOKEN = "gitlab-token";

      const token = getToken();
      expect(token).toBe("input-oauth-token");
    });

    test("falls back to gitlab_token input when OAuth token not available", () => {
      process.env.INPUT_GITLAB_TOKEN = "input-gitlab-token";
      process.env.GITLAB_TOKEN = "env-gitlab-token";

      const token = getToken();
      expect(token).toBe("env-gitlab-token");
    });

    test("falls back to GITLAB_TOKEN env var when no inputs available", () => {
      process.env.GITLAB_TOKEN = "env-gitlab-token";

      const token = getToken();
      expect(token).toBe("env-gitlab-token");
    });

    test("throws error with helpful message when no tokens available", () => {
      // All tokens already cleared in beforeEach
      expect(() => getToken()).toThrow(
        "GitLab authentication required (CLAUDE_CODE_GL_ACCESS_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, GITLAB_TOKEN, or gitlab_token input)",
      );
    });
  });

  describe("OAuth Token Logging", () => {
    test("logs when using OAuth token for GitHub", () => {
      process.env.GITHUB_ACTIONS = "true";
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-123";

      const originalLog = console.log;
      let logMessage = "";
      console.log = (msg: string) => {
        logMessage = msg;
      };

      getToken();

      expect(logMessage).toBe(
        "Using Claude Code OAuth token for GitHub authentication",
      );
      console.log = originalLog;
    });

    test("logs when using GL access token for GitLab", () => {
      process.env.GITLAB_CI = "true";
      process.env.CI_PROJECT_ID = "123";
      process.env.CLAUDE_CODE_GL_ACCESS_TOKEN = "gl-access-token-123";

      const originalLog = console.log;
      let logMessage = "";
      console.log = (msg: string) => {
        logMessage = msg;
      };

      getToken();

      expect(logMessage).toContain(
        "Using CLAUDE_CODE_GL_ACCESS_TOKEN for GitLab authentication",
      );
      console.log = originalLog;
    });

    test("logs when using OAuth token for GitLab", () => {
      process.env.GITLAB_CI = "true";
      process.env.CI_PROJECT_ID = "123";
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-123";

      const originalLog = console.log;
      let logMessage = "";
      console.log = (msg: string) => {
        logMessage = msg;
      };

      getToken();

      expect(logMessage).toBe(
        "Using Claude Code OAuth token for GitLab authentication",
      );
      console.log = originalLog;
    });
  });
});
