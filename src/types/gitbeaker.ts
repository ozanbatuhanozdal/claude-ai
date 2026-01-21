/**
 * Type definitions for GitBeaker API responses
 * These match the actual response structures from GitLab API
 */

// User-related types
export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
  state: string;
  avatar_url?: string;
  web_url: string;
  user_type?: string;
  bot?: boolean;
}

// Merge Request types
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
  closed_at?: string;
  target_branch: string;
  source_branch: string;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  author: GitLabUser;
  assignee?: GitLabUser;
  assignees?: GitLabUser[];
  reviewers?: GitLabUser[];
  source_project_id: number;
  target_project_id: number;
  labels: string[];
  draft: boolean;
  work_in_progress?: boolean;
  milestone?: any;
  merge_when_pipeline_succeeds: boolean;
  merge_status: string;
  sha: string;
  merge_commit_sha?: string;
  squash_commit_sha?: string;
  discussion_locked?: boolean;
  should_remove_source_branch?: boolean;
  force_remove_source_branch?: boolean;
  reference: string;
  references: {
    short: string;
    relative: string;
    full: string;
  };
  web_url: string;
  time_stats: any;
  squash: boolean;
  task_completion_status: any;
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  approvals_before_merge?: number;
  diff_refs?: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
}

// Merge Request Changes (from /changes endpoint)
export interface GitLabMergeRequestChanges extends GitLabMergeRequest {
  changes: GitLabFileChange[];
}

export interface GitLabFileChange {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

// Note/Comment types
export interface GitLabNote {
  id: number;
  type?: string;
  body: string;
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  system: boolean;
  noteable_id: number;
  noteable_type: string;
  position?: any;
  resolvable: boolean;
  resolved: boolean;
  resolved_by?: GitLabUser;
  resolved_at?: string;
  noteable_iid: number;
}

// Discussion types
export interface GitLabDiscussion {
  id: string;
  individual_note: boolean;
  notes: GitLabNote[];
  resolved: boolean;
}

// Project Member types
export interface GitLabMember {
  id: number;
  username: string;
  name: string;
  state: string;
  avatar_url?: string;
  web_url: string;
  access_level: number;
  created_at: string;
  expires_at?: string;
}

// Branch types
export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  can_push: boolean;
  web_url: string;
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    parent_ids: string[];
    title: string;
    message: string;
    author_name: string;
    author_email: string;
    authored_date: string;
    committer_name: string;
    committer_email: string;
    committed_date: string;
    web_url: string;
  };
}

// Commit types
export interface GitLabCommit {
  id: string;
  short_id: string;
  created_at: string;
  parent_ids: string[];
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  web_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

// Project types
export interface GitLabProject {
  id: number;
  description?: string;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  created_at: string;
  default_branch: string;
  tag_list?: string[];
  topics?: string[];
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  web_url: string;
  readme_url?: string;
  avatar_url?: string;
  forks_count: number;
  star_count: number;
  last_activity_at: string;
  namespace: {
    id: number;
    name: string;
    path: string;
    kind: string;
    full_path: string;
    parent_id?: number;
    avatar_url?: string;
    web_url: string;
  };
}

// Repository File types
export interface GitLabRepositoryFile {
  file_name: string;
  file_path: string;
  size: number;
  encoding: string;
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
}

// Issue types
export interface GitLabIssue {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description?: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  closed_by?: GitLabUser;
  labels: string[];
  milestone?: any;
  assignees: GitLabUser[];
  author: GitLabUser;
  type: string;
  assignee?: GitLabUser;
  user_notes_count: number;
  merge_requests_count: number;
  upvotes: number;
  downvotes: number;
  due_date?: string;
  confidential: boolean;
  discussion_locked?: boolean;
  issue_type: string;
  web_url: string;
  time_stats: any;
  task_completion_status?: any;
  weight?: number;
  blocking_issues_count?: number;
  has_tasks?: boolean;
  _links: any;
  references: {
    short: string;
    relative: string;
    full: string;
  };
  severity?: string;
  moved_to_id?: number;
  service_desk_reply_to?: string;
}
