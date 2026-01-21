import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { detectPlatform, getToken } from "../../src/providers/provider-factory";

describe("detectPlatform", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("detects GitLab from GITLAB_CI variable", () => {
    process.env.GITLAB_CI = "true";
    expect(detectPlatform()).toBe("gitlab");
  });

  test("detects GitLab from CI_PROJECT_ID variable", () => {
    process.env.CI_PROJECT_ID = "123";
    expect(detectPlatform()).toBe("gitlab");
  });

  test("detects GitHub from GITHUB_ACTIONS variable", () => {
    process.env.GITHUB_ACTIONS = "true";
    expect(detectPlatform()).toBe("github");
  });

  test("respects explicit CI_PLATFORM setting for gitlab", () => {
    process.env.CI_PLATFORM = "gitlab";
    process.env.GITHUB_ACTIONS = "true"; // Should be ignored
    expect(detectPlatform()).toBe("gitlab");
  });

  test("respects explicit CI_PLATFORM setting for github", () => {
    process.env.CI_PLATFORM = "github";
    process.env.GITLAB_CI = "true"; // Should be ignored
    expect(detectPlatform()).toBe("github");
  });

  test("defaults to GitHub when no CI environment detected", () => {
    // Clear all CI environment variables
    delete process.env.GITLAB_CI;
    delete process.env.CI_PROJECT_ID;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.CI_PLATFORM;

    const originalLog = console.log;
    let logMessage = "";
    console.log = (msg: string) => {
      logMessage = msg;
    };

    expect(detectPlatform()).toBe("github");
    expect(logMessage).toBe(
      "Could not detect CI platform, defaulting to GitHub",
    );

    console.log = originalLog;
  });

  test("ignores invalid CI_PLATFORM values", () => {
    process.env.CI_PLATFORM = "bitbucket"; // Not supported
    process.env.GITLAB_CI = "true";
    expect(detectPlatform()).toBe("gitlab");
  });
});

describe("getToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("GitLab token retrieval", () => {
    test("gets token from GITLAB_TOKEN environment variable", () => {
      process.env.GITLAB_CI = "true";
      process.env.GITLAB_TOKEN = "env-gitlab-token";

      expect(getToken()).toBe("env-gitlab-token");
    });

    test("throws error when no GitLab token found", () => {
      process.env.GITLAB_CI = "true";
      delete process.env.GITLAB_TOKEN;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.INPUT_GITLAB_TOKEN;

      expect(() => getToken()).toThrow(
        "GitLab authentication required (CLAUDE_CODE_GL_ACCESS_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, GITLAB_TOKEN, or gitlab_token input)",
      );
    });
  });

  describe("GitHub token retrieval", () => {
    test("gets token from GITHUB_TOKEN environment variable", () => {
      process.env.GITHUB_ACTIONS = "true";
      process.env.GITHUB_TOKEN = "env-github-token";

      expect(getToken()).toBe("env-github-token");
    });

    test("throws error when no GitHub token found", () => {
      process.env.GITHUB_ACTIONS = "true";
      delete process.env.GITHUB_TOKEN;
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.INPUT_CLAUDE_CODE_OAUTH_TOKEN;
      delete process.env.INPUT_GITHUB_TOKEN;
      delete process.env.INPUT_ANTHROPIC_API_KEY;

      expect(() => getToken()).toThrow(
        "GitHub authentication required (claude_code_oauth_token or github_token)",
      );
    });
  });
});
