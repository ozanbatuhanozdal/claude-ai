import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  parseGitLabContext,
  parseGitLabWebhookPayload,
} from "../../src/gitlab/context";

describe("parseGitLabContext", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("parses context from explicit parameters", () => {
    const context = parseGitLabContext({
      projectId: "123",
      mrIid: "45",
      host: "https://gitlab.example.com",
      pipelineUrl: "https://gitlab.example.com/project/-/pipelines/789",
    });

    expect(context).toEqual({
      projectId: "123",
      mrIid: "45",
      host: "https://gitlab.example.com",
      pipelineUrl: "https://gitlab.example.com/project/-/pipelines/789",
      userName: "",
      userEmail: "",
      commitSha: "",
      commitBranch: "",
      triggerSource: undefined,
    });
  });

  test("parses context from environment variables", () => {
    process.env.CI_PROJECT_ID = "456";
    process.env.CI_MERGE_REQUEST_IID = "78";
    process.env.CI_SERVER_URL = "https://gitlab.company.com";
    process.env.CI_PIPELINE_URL =
      "https://gitlab.company.com/project/-/pipelines/999";
    process.env.GITLAB_USER_NAME = "Test User";
    process.env.GITLAB_USER_EMAIL = "test@example.com";
    process.env.CI_COMMIT_SHA = "abc123def456";
    process.env.CI_COMMIT_REF_NAME = "feature-branch";
    process.env.CI_PIPELINE_SOURCE = "push";

    const context = parseGitLabContext();

    expect(context).toEqual({
      projectId: "456",
      mrIid: "78",
      host: "https://gitlab.company.com",
      pipelineUrl: "https://gitlab.company.com/project/-/pipelines/999",
      userName: "Test User",
      userEmail: "test@example.com",
      commitSha: "abc123def456",
      commitBranch: "feature-branch",
      triggerSource: "push",
    });
  });

  test("defaults to gitlab.com when no host specified", () => {
    const context = parseGitLabContext({
      projectId: "123",
    });

    expect(context.host).toBe("https://gitlab.com");
  });

  test("handles missing optional fields", () => {
    const context = parseGitLabContext({
      projectId: "123",
    });

    expect(context).toEqual({
      projectId: "123",
      mrIid: undefined,
      host: "https://gitlab.com",
      pipelineUrl: undefined,
      userName: "",
      userEmail: "",
      commitSha: "",
      commitBranch: "",
      triggerSource: undefined,
    });
  });

  test("prioritizes explicit parameters over environment variables", () => {
    process.env.CI_PROJECT_ID = "env-id";
    process.env.CI_MERGE_REQUEST_IID = "env-mr";

    const context = parseGitLabContext({
      projectId: "explicit-id",
      mrIid: "explicit-mr",
    });

    expect(context.projectId).toBe("explicit-id");
    expect(context.mrIid).toBe("explicit-mr");
  });
});

describe("parseGitLabWebhookPayload", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("parses merge request webhook payload", () => {
    const payload = {
      object_kind: "merge_request" as const,
      user: {
        username: "testuser",
        name: "Test User",
      },
      project: {
        id: 123,
        path_with_namespace: "group/project",
      },
      object_attributes: {
        iid: 45,
        title: "Test MR",
        description: "Test description",
        state: "opened",
        source_branch: "feature",
        target_branch: "main",
      },
    };

    process.env.GITLAB_WEBHOOK_PAYLOAD = JSON.stringify(payload);

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toEqual(payload);
  });

  test("parses note webhook payload", () => {
    const payload = {
      object_kind: "note" as const,
      user: {
        username: "commenter",
        name: "Commenter User",
      },
      project: {
        id: 456,
        path_with_namespace: "org/repo",
      },
      object_attributes: {
        note: "@claude help me fix this",
        noteable_type: "MergeRequest",
        noteable_id: 78,
      },
      merge_request: {
        iid: 78,
        title: "Fix bug",
        description: "Bug fix description",
        state: "opened",
        source_branch: "fix-branch",
        target_branch: "main",
      },
    };

    process.env.GITLAB_WEBHOOK_PAYLOAD = JSON.stringify(payload);

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toEqual(payload);
  });

  test("parses issue webhook payload", () => {
    const payload = {
      object_kind: "issue" as const,
      user: {
        username: "reporter",
        name: "Reporter User",
      },
      project: {
        id: 789,
        path_with_namespace: "team/app",
      },
      object_attributes: {
        iid: 100,
        title: "Bug report",
        description: "Something is broken",
        state: "opened",
      },
    };

    process.env.GITLAB_WEBHOOK_PAYLOAD = JSON.stringify(payload);

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toEqual(payload);
  });

  test("returns null when no payload exists", () => {
    delete process.env.GITLAB_WEBHOOK_PAYLOAD;

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    process.env.GITLAB_WEBHOOK_PAYLOAD = "invalid json";

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toBeNull();
  });

  test("handles empty payload", () => {
    process.env.GITLAB_WEBHOOK_PAYLOAD = "";

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toBeNull();
  });

  test("preserves all webhook fields", () => {
    const complexPayload = {
      object_kind: "merge_request" as const,
      user: {
        id: 1,
        username: "testuser",
        name: "Test User",
        email: "test@example.com",
      },
      project: {
        id: 123,
        name: "Project",
        description: "Project description",
        path_with_namespace: "group/project",
        default_branch: "main",
      },
      object_attributes: {
        iid: 45,
        title: "Test MR",
        description: "Test description",
        state: "opened",
        source_branch: "feature",
        target_branch: "main",
        author_id: 1,
        assignee_id: 2,
        labels: ["bug", "enhancement"],
      },
      changes: {
        title: {
          previous: "Old Title",
          current: "Test MR",
        },
      },
      repository: {
        name: "project",
        url: "git@gitlab.com:group/project.git",
      },
    };

    process.env.GITLAB_WEBHOOK_PAYLOAD = JSON.stringify(complexPayload);

    const parsed = parseGitLabWebhookPayload();

    expect(parsed).toEqual(complexPayload);
  });
});
