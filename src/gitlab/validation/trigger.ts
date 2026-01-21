/**
 * GitLab Trigger Validation
 *
 * Checks if GitLab events contain the trigger phrase
 */

import type { GitLabWebhookPayload } from "../context";

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface GitLabTriggerContext {
  payload: GitLabWebhookPayload;
  triggerPhrase: string;
  directPrompt?: string;
}

export function checkContainsTrigger(context: GitLabTriggerContext): boolean {
  const { payload, triggerPhrase, directPrompt } = context;

  // If direct prompt is provided, always trigger
  if (directPrompt) {
    console.log("Direct prompt provided, triggering action");
    return true;
  }

  // Handle null or undefined payload
  if (!payload || typeof payload !== "object") {
    console.log("Invalid or missing payload");
    return false;
  }

  // Create regex for trigger phrase detection
  const regex = new RegExp(
    `(^|\\s)${escapeRegExp(triggerPhrase)}([\\s.,!?;:]|$)`,
    "i",
  );

  // Check merge request description and title
  if (payload.object_kind === "merge_request") {
    const mr = payload.merge_request || payload.object_attributes;
    if (!mr) return false;

    const description = mr.description || "";
    const title = mr.title || "";

    if (regex.test(description)) {
      console.log(
        `Merge request description contains trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    if (regex.test(title)) {
      console.log(
        `Merge request title contains trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check note (comment) content
  if (payload.object_kind === "note") {
    const note = payload.object_attributes?.note || "";
    const noteableType = payload.object_attributes?.noteable_type;

    // Only trigger on MR notes
    if (noteableType === "MergeRequest" && regex.test(note)) {
      console.log(
        `Merge request comment contains trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }
  }

  // Check issue description and title
  if (payload.object_kind === "issue") {
    const issue = payload.object_attributes;
    if (!issue) return false;

    const description = issue.description || "";
    const title = issue.title || "";

    if (regex.test(description)) {
      console.log(
        `Issue description contains trigger phrase '${triggerPhrase}'`,
      );
      return true;
    }

    if (regex.test(title)) {
      console.log(`Issue title contains trigger phrase '${triggerPhrase}'`);
      return true;
    }
  }

  console.log(`No trigger phrase '${triggerPhrase}' found in GitLab event`);
  return false;
}

export async function checkGitLabTriggerAction(
  context: GitLabTriggerContext,
): Promise<boolean> {
  return checkContainsTrigger(context);
}
