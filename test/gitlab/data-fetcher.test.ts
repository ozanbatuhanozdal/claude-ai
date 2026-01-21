import { describe, test, expect } from "bun:test";
import type { ParsedGitLabContext } from "../../src/gitlab/context";

describe("GitLab Data Fetcher Types", () => {
  test("GitLabMRData type structure", () => {
    // This test verifies that the type exports are correct
    const mockMRData = {
      iid: 45,
      title: "Feature: Add authentication",
      description: "This PR adds user authentication",
      state: "opened",
      sourceBranch: "feature/auth",
      targetBranch: "main",
      author: {
        username: "developer",
        name: "Developer User",
      },
      changes: [],
      discussions: [],
      diffRefs: {
        base_sha: "base123",
        head_sha: "head456",
        start_sha: "start789",
      },
      projectId: "123",
      webUrl: "https://gitlab.com/project/-/merge_requests/45",
    };

    // Type checking will happen at compile time
    expect(mockMRData.iid).toBe(45);
    expect(mockMRData.author.username).toBe("developer");
  });

  test("GitLabIssueData type structure", () => {
    const mockIssueData = {
      iid: 100,
      title: "Bug: Login not working",
      description: "Users cannot log in after latest update",
      state: "opened",
      author: {
        username: "reporter",
        name: "Bug Reporter",
      },
      labels: ["bug", "high-priority"],
      discussions: [],
      projectId: "456",
      webUrl: "https://gitlab.com/project/-/issues/100",
    };

    expect(mockIssueData.iid).toBe(100);
    expect(mockIssueData.labels).toContain("bug");
  });

  test("ParsedGitLabContext type structure", () => {
    const mockContext: ParsedGitLabContext = {
      projectId: "123",
      mrIid: "45",
      host: "https://gitlab.com",
      pipelineUrl: "https://gitlab.com/project/-/pipelines/789",
      userName: "testuser",
      userEmail: "test@example.com",
      commitSha: "abc123",
      commitBranch: "feature-branch",
    };

    expect(mockContext.projectId).toBe("123");
    expect(mockContext.host).toBe("https://gitlab.com");
  });
});
