#!/usr/bin/env bun

import * as core from "@actions/core";
import * as fs from "fs/promises";
import { Gitlab } from "@gitbeaker/rest";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import type { GitLabNote } from "../types/gitbeaker";

/**
 * Parses the execution output file from the Claude Code SDK.
 * Note: This could be refactored into a shared utility with the GitHub version.
 */
async function getExecutionDetails(outputFile?: string): Promise<{
  cost_usd?: number;
  duration_ms?: number;
} | null> {
  if (!outputFile) {
    console.log("No output file provided, skipping execution details");
    return null;
  }
  
  try {
    const fs = await import("fs");
    const path = await import("path");
    
    // Try multiple possible file locations
    const tempDir = process.env.CI_BUILDS_DIR || process.env.RUNNER_TEMP || "/tmp";
    const possibleFiles = [
      outputFile,
      path.join(tempDir, "claude-execution-output.json"),
      path.join(tempDir, "output.txt"),
    ];

    let fileContent = "";
    let foundFile = "";

    // Try to read from any of the possible locations
    for (const filePath of possibleFiles) {
      try {
        if (fs.existsSync(filePath)) {
          fileContent = await fs.promises.readFile(filePath, "utf8");
          foundFile = filePath;
          console.log(`Reading execution details from: ${filePath}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!fileContent) {
      console.warn(`Output file not found in any location`);
      console.warn("This is not critical - execution details will be skipped");
      return null;
    }

    // Try to parse as JSON array first (if jq processed it)
    let outputData: SDKMessage[] = [];
    try {
      outputData = JSON.parse(fileContent) as SDKMessage[];
    } catch {
      // If not JSON array, try parsing as JSONL (one JSON object per line)
      const lines = fileContent.trim().split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as SDKMessage;
          outputData.push(obj);
        } catch {
          // Skip invalid lines
        }
      }
    }

    const result = outputData.find(
      (msg): msg is Extract<SDKMessage, { type: "result" }> =>
        msg.type === "result",
    );

    if (result && "cost_usd" in result && "duration_ms" in result) {
      return {
        cost_usd: result.cost_usd as number,
        duration_ms: result.duration_ms as number,
      };
    }
  } catch (error) {
    // Don't fail the entire update if we can't read execution details
    core.warning(`Error reading or parsing output file: ${error}`);
    console.warn("Continuing without execution details...");
  }
  return null;
}

/**
 * Formats the final comment body for a GitLab merge request note.
 */
function formatGitLabCommentBody(
  initialBody: string,
  success: boolean,
  jobUrl: string,
  errorDetails?: string,
  executionDetails?: { cost_usd?: number; duration_ms?: number } | null,
): string {
  const statusMessage = success
    ? "✅ Claude's work is complete"
    : "❌ Claude's work failed";

  let finalBody = initialBody.replace(
    /🤖 Claude is working on this\.\.\./,
    statusMessage,
  );

  // Check off all items in the markdown task list
  finalBody = finalBody.replace(/- \[ \] /g, "- [x] ");

  // Ensure the job link is present
  if (!finalBody.includes(jobUrl)) {
    finalBody += `\n\n[View job details](${jobUrl})`;
  }

  if (errorDetails) {
    finalBody += `\n\n**Error:** \`${errorDetails}\``;
  }

  if (executionDetails) {
    const durationSec = (executionDetails.duration_ms ?? 0) / 1000;
    const cost = executionDetails.cost_usd?.toFixed(4) ?? "0.0000";
    finalBody += `\n\n---\n*Execution time: ${durationSec.toFixed(
      2,
    )}s | Estimated cost: $${cost}*`;
  }

  return finalBody;
}

async function run() {
  try {
    const commentId = parseInt(process.env.CLAUDE_COMMENT_ID!);
    if (isNaN(commentId)) {
      throw new Error("CLAUDE_COMMENT_ID env var is not a valid number.");
    }

    // Get GitLab context from environment
    const projectId = process.env.CI_PROJECT_ID;
    const mrIid = process.env.CI_MERGE_REQUEST_IID;
    const issueIid = process.env.CI_ISSUE_IID || process.env.CLAUDE_RESOURCE_ID;
    const gitlabHost = process.env.CI_SERVER_URL || "https://gitlab.com";
    const gitlabToken =
      process.env.CLAUDE_CODE_GL_ACCESS_TOKEN ||
      process.env.CLAUDE_CODE_OAUTH_TOKEN ||
      process.env.GITLAB_TOKEN;

    // Debug: Print environment variables
    console.log("GitLab context:");
    console.log(`  Project ID: ${projectId || "NOT SET"}`);
    console.log(`  MR IID: ${mrIid || "NOT SET"}`);
    console.log(`  Issue IID: ${issueIid || "NOT SET"}`);
    console.log(`  Comment ID: ${commentId}`);
    console.log(`  GitLab Host: ${gitlabHost}`);
    console.log(`  Token available: ${!!gitlabToken}`);

    if (!projectId) {
      throw new Error("CI_PROJECT_ID is required but not set");
    }
    
    if (!mrIid && !issueIid) {
      throw new Error(`Neither CI_MERGE_REQUEST_IID nor CI_ISSUE_IID is set. CLAUDE_RESOURCE_ID: ${process.env.CLAUDE_RESOURCE_ID}`);
    }
    
    if (!gitlabToken) {
      throw new Error("GitLab token is required but not set (check CLAUDE_CODE_GL_ACCESS_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, or GITLAB_TOKEN)");
    }

    // Initialize GitLab API
    const api = new Gitlab({
      host: gitlabHost,
      token: gitlabToken,
    });

    // Determine overall success/failure state
    const prepareSuccess = process.env.PREPARE_SUCCESS !== "false";
    const claudeSuccess = process.env.CLAUDE_SUCCESS !== "false";
    const actionSucceeded = prepareSuccess && claudeSuccess;
    const errorDetails = process.env.PREPARE_ERROR;

    // Get execution details from the Claude Code SDK output file
    const executionDetails = await getExecutionDetails(process.env.OUTPUT_FILE);

    // Fetch the original comment
    try {
      let notes: GitLabNote[];
      let resourceType: string;
      let resourceIid: number;

      if (mrIid) {
        // Merge request context
        console.log(`Fetching notes for MR ${mrIid} in project ${projectId}...`);
        notes = (await api.MergeRequestNotes.all(
          projectId,
          parseInt(mrIid),
        )) as unknown as GitLabNote[];
        resourceType = "merge request";
        resourceIid = parseInt(mrIid);
      } else if (issueIid) {
        // Issue context
        console.log(`Fetching notes for issue ${issueIid} in project ${projectId}...`);
        notes = (await api.IssueNotes.all(
          projectId,
          parseInt(issueIid),
        )) as unknown as GitLabNote[];
        resourceType = "issue";
        resourceIid = parseInt(issueIid);
      } else {
        throw new Error("No merge request or issue context found");
      }

      console.log(`Found ${notes.length} notes, looking for comment ID ${commentId}...`);

      const originalComment = notes.find((note) => note.id === commentId);
      if (!originalComment) {
        // List available comment IDs for debugging
        const availableIds = notes.map(n => n.id).slice(0, 10);
        console.error(`Available comment IDs (first 10): ${availableIds.join(", ")}`);
        throw new Error(`Could not find GitLab note ID ${commentId} in ${resourceType} ${resourceIid}. Available IDs: ${availableIds.join(", ")}`);
      }

      console.log(`Found original comment: ${originalComment.id}`);

      // Get job URL
      const pipelineId = process.env.CI_PIPELINE_ID;
      const jobUrl = pipelineId
        ? `${gitlabHost}/${projectId}/-/pipelines/${pipelineId}`
        : `${gitlabHost}/${projectId}/-/pipelines`;

      const updatedBody = formatGitLabCommentBody(
        originalComment.body,
        actionSucceeded,
        jobUrl,
        errorDetails,
        executionDetails,
      );

      // Update the comment
      console.log(`Updating ${resourceType} note ${commentId}...`);
      if (mrIid) {
        await api.MergeRequestNotes.edit(projectId, resourceIid, commentId, {
          body: updatedBody,
        });
      } else {
        await api.IssueNotes.edit(projectId, resourceIid, commentId, {
          body: updatedBody,
        });
      }

      console.log(`✅ Updated GitLab ${resourceType} note ${commentId}.`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error details: ${errorMsg}`);
      throw new Error(`Failed to fetch or update comment: ${errorMsg}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Use warning instead of setFailed to not fail the job
    core.warning(`Failed to update GitLab comment: ${errorMessage}`);
    console.error("Comment update failed, but this is not critical");
    // Don't exit with error code - comment update failure shouldn't fail the job
    process.exit(0);
  }
}

if (import.meta.main) {
  run();
}
