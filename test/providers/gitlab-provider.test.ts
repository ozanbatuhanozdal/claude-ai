import { describe, test, expect, beforeEach, mock } from "bun:test";
import { GitLabProvider } from "../../src/providers/gitlab-provider";
import type { GitLabProviderOptions } from "../../src/providers/scm-provider";

describe("GitLabProvider", () => {
  let provider: GitLabProvider;
  const options: GitLabProviderOptions = {
    token: "test-token",
    projectId: "123",
    mrIid: "45",
    host: "https://gitlab.com",
    pipelineUrl: "https://gitlab.com/project/-/pipelines/789",
    triggerPhrase: "@claude",
  };

  beforeEach(() => {
    // Mock the Gitlab API methods on the provider instance
    provider = new GitLabProvider(options);
  });

  describe("Platform identification", () => {
    test("getPlatform returns gitlab", () => {
      expect(provider.getPlatform()).toBe("gitlab");
    });
  });

  describe("Context management", () => {
    test("getContext returns SCM context for merge request", () => {
      const context = provider.getContext();

      expect(context).toMatchObject({
        platform: "gitlab",
        isPR: true,
        entityNumber: 45,
        runId: "789",
      });
    });

    test("getContext returns SCM context without merge request", () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });
      const context = providerNoMR.getContext();

      expect(context).toMatchObject({
        platform: "gitlab",
        isPR: false,
        entityNumber: 0,
      });
    });
  });

  describe("Self-hosted GitLab support", () => {
    test("works with custom GitLab host", () => {
      const selfHostedProvider = new GitLabProvider({
        ...options,
        host: "https://gitlab.company.com",
      });

      const context = (selfHostedProvider as any).context;
      expect(context.host).toBe("https://gitlab.company.com");
    });
  });

  describe("Feature parity with GitHub", () => {
    test("getJobUrl returns pipeline URL", () => {
      const url = provider.getJobUrl();
      expect(url).toBe("https://gitlab.com/project/-/pipelines/789");
    });

    test("getJobUrl returns default URL when pipeline URL not available", () => {
      const providerNoPipeline = new GitLabProvider({
        ...options,
        pipelineUrl: undefined,
      });
      const url = providerNoPipeline.getJobUrl();
      expect(url).toBe("https://gitlab.com/123/-/pipelines");
    });
  });

  describe("Error handling", () => {
    test("getPullRequestInfo throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(providerNoMR.getPullRequestInfo()).rejects.toThrow(
        "Not in a merge request context",
      );
    });

    test("createComment throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(providerNoMR.createComment("test")).rejects.toThrow(
        "Cannot create comment without merge request or issue context",
      );
    });

    test("updateComment throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(providerNoMR.updateComment(1, "test")).rejects.toThrow(
        "Cannot update comment without merge request or issue context",
      );
    });

    test("getDiff throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(providerNoMR.getDiff()).rejects.toThrow(
        "Not in a merge request context",
      );
    });

    test("getChangedFiles throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(providerNoMR.getChangedFiles()).rejects.toThrow(
        "Not in a merge request context",
      );
    });

    test("applySuggestions throws without MR context", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      await expect(
        providerNoMR.applySuggestions([
          {
            file: "test.ts",
            line: 10,
            suggestion: "improved code",
          },
        ]),
      ).rejects.toThrow("Suggestions can only be applied to merge requests");
    });
  });

  describe("File operations", () => {
    test("getFilesContent handles errors gracefully", async () => {
      // Mock the API to throw an error
      const mockApi = {
        RepositoryFiles: {
          show: mock(() => Promise.reject(new Error("File not found"))),
        },
      };
      (provider as any).api = mockApi;

      const consoleErrorSpy = mock(() => {});
      const originalConsoleError = console.error;
      console.error = consoleErrorSpy;

      const results = await provider.getFilesContent(
        ["file1.txt", "file2.txt"],
        "main",
      );

      expect(results).toEqual({});
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);

      console.error = originalConsoleError;
    });
  });

  describe("Trigger validation", () => {
    test("checkTrigger returns true for direct prompt", async () => {
      const providerWithPrompt = new GitLabProvider({
        ...options,
        directPrompt: "Fix the bug",
      });

      const result = await providerWithPrompt.checkTrigger(
        "@claude",
        "Fix the bug",
      );
      expect(result).toBe(true);
    });
  });

  describe("Context data fetching", () => {
    test("fetchContextData returns basic context when not in MR", async () => {
      const providerNoMR = new GitLabProvider({
        ...options,
        mrIid: undefined,
      });

      const contextData = await providerNoMR.fetchContextData();

      expect(contextData).toEqual({
        projectId: "123",
        host: "https://gitlab.com",
        userName: expect.any(String),
      });
    });
  });
});
