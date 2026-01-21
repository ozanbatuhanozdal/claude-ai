/**
 * GitLab webhook payload parser
 */

export interface GitLabWebhookPayload {
  object_kind: string;
  project?: any;
  user?: any;
  object_attributes?: any;
  merge_request?: any;
  issue?: any;
}

/**
 * Parse GitLab webhook payload from environment
 */
export function parseGitLabWebhookPayload(): GitLabWebhookPayload | null {
  const payloadJson = process.env.GITLAB_WEBHOOK_PAYLOAD;
  if (!payloadJson) {
    return null;
  }

  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    console.error("Failed to parse GitLab webhook payload:", error);
    return null;
  }
}
