/**
 * GitHub Provider Implementation
 *
 * Wraps existing GitHub functionality to implement the SCM Provider interface
 */

// import * as github from "@actions/github";
// import { Octokit } from "@octokit/rest";
// import type { GraphQlQueryResponseData } from "@octokit/graphql";
import type {
  SCMProvider,
  SCMContext,
  RepoInfo,
  PullRequestInfo,
  CommentInfo,
  FileChange,
  BranchInfo,
  GitHubProviderOptions,
} from "./scm-provider";
import { createOctokit, type Octokits } from "../github/api/client";
import { checkTriggerAction } from "../github/validation/trigger";
import { checkHumanActor } from "../github/validation/actor";
import { checkWritePermissions } from "../github/validation/permissions";
import { createInitialComment } from "../github/operations/comments/create-initial";
// import { updateTrackingComment } from "../github/operations/comments/update-claude-comment";
// import { setupBranch } from "../github/operations/branch";
import { configureGitAuth } from "../github/operations/git-config";
import { fetchGitHubData } from "../github/data/fetcher";
import {
  parseGitHubContext,
  type ParsedGitHubContext,
} from "../github/context";
import { $ } from "bun";

export class GitHubProvider implements SCMProvider {
  private octokit: Octokits;
  private context: ParsedGitHubContext;

  constructor(options: GitHubProviderOptions) {
    this.octokit = createOctokit(options.token);
    this.context = parseGitHubContext();
  }

  getPlatform(): "github" {
    return "github";
  }

  async getRepoInfo(): Promise<RepoInfo> {
    const { data: repo } = await this.octokit.rest.repos.get({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
    });

    return {
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      defaultBranch: repo.default_branch,
    };
  }

  getContext(): SCMContext {
    return {
      platform: "github",
      isPR: this.context.isPR,
      entityNumber: this.context.entityNumber,
      actor: this.context.actor,
      runId: this.context.runId,
      triggerEvent: this.context.eventName,
    };
  }

  async hasWritePermission(_username: string): Promise<boolean> {
    return checkWritePermissions(this.octokit.rest, this.context);
  }

  async isHumanActor(_username: string): Promise<boolean> {
    await checkHumanActor(this.octokit.rest, this.context);
    return true; // checkHumanActor throws if not human
  }

  async getPullRequestInfo(): Promise<PullRequestInfo> {
    if (!this.context.isPR) {
      throw new Error("Not in a pull request context");
    }

    const { data: pr } = await this.octokit.rest.pulls.get({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      pull_number: this.context.entityNumber,
    });

    return {
      number: pr.number,
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      author: pr.user?.login || "",
      title: pr.title,
      body: pr.body || "",
      isDraft: pr.draft || false,
      state: pr.state as "open" | "closed",
    };
  }

  async getComments(): Promise<CommentInfo[]> {
    const comments = this.context.isPR
      ? await this.octokit.rest.issues.listComments({
          owner: this.context.repository.owner,
          repo: this.context.repository.repo,
          issue_number: this.context.entityNumber,
        })
      : await this.octokit.rest.issues.listComments({
          owner: this.context.repository.owner,
          repo: this.context.repository.repo,
          issue_number: this.context.entityNumber,
        });

    return comments.data.map((comment) => ({
      id: comment.id,
      author: comment.user?.login || "",
      body: comment.body || "",
      createdAt: comment.created_at,
    }));
  }

  async createComment(body: string): Promise<number> {
    const comment = await this.octokit.rest.issues.createComment({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      issue_number: this.context.entityNumber,
      body,
    });

    return comment.data.id;
  }

  async updateComment(commentId: number, body: string): Promise<void> {
    await this.octokit.rest.issues.updateComment({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      comment_id: commentId,
      body,
    });
  }

  async getDiff(): Promise<string> {
    if (!this.context.isPR) {
      throw new Error("Not in a pull request context");
    }

    // Get PR info to access the SHAs
    const prInfo = await this.getPullRequestInfo();
    const { stdout } =
      await $`git diff ${prInfo.baseSha} ${prInfo.headSha}`.quiet();
    return stdout.toString();
  }

  async getFileContent(path: string, ref: string): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.context.repository.owner,
        repo: this.context.repository.repo,
        path,
        ref,
      });

      if ("content" in data && data.type === "file") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      throw new Error(`Path ${path} is not a file`);
    } catch (error) {
      if ((error as any).status === 404) {
        throw new Error(`File not found: ${path}`);
      }
      throw error;
    }
  }

  async getFilesContent(
    paths: string[],
    ref: string,
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    // Batch fetch using Promise.all for efficiency
    await Promise.all(
      paths.map(async (path) => {
        try {
          results[path] = await this.getFileContent(path, ref);
        } catch (error) {
          // Log error but continue with other files
          console.error(`Failed to fetch ${path}:`, error);
        }
      }),
    );

    return results;
  }

  async getChangedFiles(): Promise<FileChange[]> {
    if (!this.context.isPR) {
      throw new Error("Not in a pull request context");
    }

    const { data: files } = await this.octokit.rest.pulls.listFiles({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      pull_number: this.context.entityNumber,
    });

    return files.map((file) => ({
      path: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }));
  }

  async createBranch(name: string, baseSha: string): Promise<void> {
    await this.octokit.rest.git.createRef({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      ref: `refs/heads/${name}`,
      sha: baseSha,
    });
  }

  async pushChanges(
    branch: string,
    message: string,
    files: Record<string, string>,
  ): Promise<string> {
    // Use git commands for pushing changes
    for (const [path, content] of Object.entries(files)) {
      await $`echo ${content} > ${path}`.quiet();
      await $`git add ${path}`.quiet();
    }

    await $`git commit -m ${message}`.quiet();
    await $`git push origin ${branch}`.quiet();

    const { stdout } = await $`git rev-parse HEAD`.quiet();
    return stdout.toString().trim();
  }

  async getBranch(name: string): Promise<BranchInfo | null> {
    try {
      const { data } = await this.octokit.rest.repos.getBranch({
        owner: this.context.repository.owner,
        repo: this.context.repository.repo,
        branch: name,
      });

      return {
        name: data.name,
        sha: data.commit.sha,
        protected: data.protected,
      };
    } catch (error) {
      if ((error as any).status === 404) {
        return null;
      }
      throw error;
    }
  }

  async setupGitAuth(token: string): Promise<void> {
    // Use existing git auth configuration
    const commentData = await createInitialComment(
      this.octokit.rest,
      this.context,
    );
    await configureGitAuth(token, this.context, commentData.user);
  }

  async applySuggestions(
    suggestions: Array<{
      file: string;
      line: number;
      suggestion: string;
      description?: string;
    }>,
  ): Promise<void> {
    // GitHub uses review comments with suggestions
    if (!this.context.isPR) {
      throw new Error("Suggestions can only be applied to pull requests");
    }

    // Create a review with suggestions
    await this.octokit.rest.pulls.createReview({
      owner: this.context.repository.owner,
      repo: this.context.repository.repo,
      pull_number: this.context.entityNumber,
      event: "COMMENT",
      comments: suggestions.map((s) => ({
        path: s.file,
        line: s.line,
        body: `${s.description || "Suggestion"}\n\`\`\`suggestion\n${s.suggestion}\n\`\`\``,
      })),
    });
  }

  getJobUrl(): string {
    return `https://github.com/${this.context.repository.owner}/${this.context.repository.repo}/actions/runs/${this.context.runId}`;
  }

  async checkTrigger(
    _triggerPhrase: string,
    _directPrompt?: string,
  ): Promise<boolean> {
    return checkTriggerAction(this.context);
  }

  async fetchContextData(): Promise<any> {
    return fetchGitHubData({
      octokits: this.octokit,
      repository: `${this.context.repository.owner}/${this.context.repository.repo}`,
      prNumber: this.context.entityNumber.toString(),
      isPR: this.context.isPR,
      triggerUsername: this.context.actor,
    });
  }
}
