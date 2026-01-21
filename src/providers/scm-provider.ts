/**
 * SCM Provider Interface
 *
 * Abstracts source control management operations to support multiple platforms
 * (GitHub, GitLab, etc.) with a unified interface.
 */

export interface RepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export interface PullRequestInfo {
  number: number;
  headSha: string;
  baseSha: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  title: string;
  body: string;
  isDraft: boolean;
  state: "open" | "closed" | "merged";
}

export interface CommentInfo {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

export interface SCMContext {
  platform: "github" | "gitlab";
  isPR: boolean;
  entityNumber: number; // PR/Issue number or MR IID
  actor: string;
  runId?: string;
  triggerEvent: string;
}

export interface SCMProvider {
  /**
   * Get the platform name
   */
  getPlatform(): "github" | "gitlab";

  /**
   * Get repository information
   */
  getRepoInfo(): Promise<RepoInfo>;

  /**
   * Get the current context (PR/MR, issue, etc.)
   */
  getContext(): SCMContext;

  /**
   * Check if a user has write permissions
   */
  hasWritePermission(username: string): Promise<boolean>;

  /**
   * Check if the actor is a human (not a bot)
   */
  isHumanActor(username: string): Promise<boolean>;

  /**
   * Get pull/merge request information
   */
  getPullRequestInfo(): Promise<PullRequestInfo>;

  /**
   * Get all comments on a pull/merge request or issue
   */
  getComments(): Promise<CommentInfo[]>;

  /**
   * Create a comment on the pull/merge request or issue
   */
  createComment(body: string): Promise<number>;

  /**
   * Update an existing comment
   */
  updateComment(commentId: number, body: string): Promise<void>;

  /**
   * Get the diff for the pull/merge request
   */
  getDiff(): Promise<string>;

  /**
   * Get file content at a specific ref
   */
  getFileContent(path: string, ref: string): Promise<string>;

  /**
   * Get multiple files content (optimized for batch fetching)
   */
  getFilesContent(
    paths: string[],
    ref: string,
  ): Promise<Record<string, string>>;

  /**
   * Get list of changed files in the pull/merge request
   */
  getChangedFiles(): Promise<FileChange[]>;

  /**
   * Create a new branch
   */
  createBranch(name: string, baseSha: string): Promise<void>;

  /**
   * Push changes to a branch
   */
  pushChanges(
    branch: string,
    message: string,
    files: Record<string, string>,
  ): Promise<string>;

  /**
   * Get branch information
   */
  getBranch(name: string): Promise<BranchInfo | null>;

  /**
   * Setup git authentication for operations
   */
  setupGitAuth(token: string): Promise<void>;

  /**
   * Apply suggestions/patches to the code
   * This is platform-specific (GitHub reviews vs GitLab suggestions)
   */
  applySuggestions(
    suggestions: Array<{
      file: string;
      line: number;
      suggestion: string;
      description?: string;
    }>,
  ): Promise<void>;

  /**
   * Get platform-specific job/pipeline URL
   */
  getJobUrl(): string;

  /**
   * Check if the current event contains the trigger phrase
   */
  checkTrigger(triggerPhrase: string, directPrompt?: string): Promise<boolean>;

  /**
   * Fetch comprehensive data about the current context
   * (PR/MR details, files, discussions, etc.)
   */
  fetchContextData(): Promise<any>;
}

/**
 * Provider options shared across platforms
 */
export interface ProviderOptions {
  token: string;
  triggerPhrase?: string;
  directPrompt?: string;
}

/**
 * GitHub-specific provider options
 */
export interface GitHubProviderOptions extends ProviderOptions {
  runId: string;
  actor: string;
  eventName: string;
  repository: {
    owner: string;
    repo: string;
  };
}

/**
 * GitLab-specific provider options
 */
export interface GitLabProviderOptions extends ProviderOptions {
  projectId: string;
  mrIid?: string;
  issueIid?: string;
  host: string;
  pipelineUrl?: string;
}
