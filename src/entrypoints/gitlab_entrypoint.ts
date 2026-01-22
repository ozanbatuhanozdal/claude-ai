#!/usr/bin/env bun

/**
 * Unified GitLab entrypoint that combines prepare, execute, and update phases
 * This replaces the multi-step shell commands in GitLab CI with a single TypeScript file
 */

import { $ } from "bun";
import * as path from "path";
import {
  getClaudePromptsDirectory,
  getClaudeExecutionOutputPath,
} from "../utils/temp-directory";

interface PhaseResult {
  success: boolean;
  error?: string;
  commentId?: number;
  outputFile?: string;
}

async function runPreparePhase(): Promise<PhaseResult> {
  try {
    console.log("=========================================");
    console.log("Phase 1: Preparing Claude Code action...");
    console.log("=========================================");

    // Run prepare.ts and capture output
    const prepareResult =
      await $`bun run ${path.join(__dirname, "prepare.ts")}`.quiet();

    // Print the output for debugging
    console.log(prepareResult.stdout.toString());

    if (prepareResult.exitCode !== 0) {
      const errorOutput = prepareResult.stderr.toString();
      console.error("Prepare step failed:", errorOutput);
      return {
        success: false,
        error: errorOutput || "Prepare step failed",
      };
    }

    // Check if trigger was found by examining output
    const output = prepareResult.stdout.toString();
    if (output.includes("No trigger found")) {
      console.log("No trigger found, exiting...");
      return {
        success: false,
        error: "No trigger found",
      };
    }

    // Extract comment ID from file written by prepare.ts
    let commentId: number | undefined;
    try {
      const fs = await import("fs");
      if (fs.existsSync("/tmp/claude-comment-id.txt")) {
        const commentIdStr = fs
          .readFileSync("/tmp/claude-comment-id.txt", "utf-8")
          .trim();
        if (commentIdStr) {
          commentId = parseInt(commentIdStr);
          console.log(`Extracted comment ID from file: ${commentId}`);
        }
      }
    } catch (error) {
      console.error("Error reading comment ID file:", error);
    }

    return {
      success: true,
      commentId,
    };
  } catch (error) {
    console.error("Error in prepare phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runExecutePhase(
  prepareResult: PhaseResult,
): Promise<PhaseResult> {
  try {
    console.log("=========================================");
    console.log("Phase 2: Setting up working branch...");
    console.log("=========================================");

    // CRITICAL: Checkout the correct branch before running Claude
    const claudeBranch = process.env.CLAUDE_BRANCH;
    const projectDir = process.env.CI_PROJECT_DIR;

    if (claudeBranch && projectDir) {
      console.log(`Working branch: ${claudeBranch}`);
      console.log(`Project directory: ${projectDir}`);

      // Change to project directory
      process.chdir(projectDir);

      // Fetch the branch if it exists remotely, otherwise create it locally
      try {
        console.log(`Fetching branch ${claudeBranch}...`);
        await $`git fetch origin ${claudeBranch}:${claudeBranch}`.quiet();
        console.log(`Checking out existing branch ${claudeBranch}...`);
        await $`git checkout ${claudeBranch}`.quiet();
      } catch (error) {
        // Branch doesn't exist remotely, create it locally
        console.log(`Branch ${claudeBranch} doesn't exist remotely, creating locally...`);
        try {
          await $`git checkout -b ${claudeBranch}`.quiet();
          console.log(`Created new branch: ${claudeBranch}`);
        } catch (createError) {
          console.error("Failed to create branch:", createError);
          throw new Error(`Failed to setup working branch: ${createError}`);
        }
      }

      // Verify we're on the correct branch
      const currentBranchResult = await $`git rev-parse --abbrev-ref HEAD`.quiet();
      const currentBranch = currentBranchResult.stdout.toString().trim();
      console.log(`✅ Currently on branch: ${currentBranch}`);

      if (currentBranch !== claudeBranch) {
        throw new Error(`Branch checkout failed: expected ${claudeBranch}, got ${currentBranch}`);
      }
    } else {
      console.warn("⚠️  CLAUDE_BRANCH not set - working in current branch");
    }

    console.log("=========================================");
    console.log("Phase 3: Installing Claude Code...");
    console.log("=========================================");

    // Install Claude Code globally
    const installResult =
      await $`bun install -g @anthropic-ai/claude-code@2.1.15`;
    console.log(installResult.stdout.toString());

    if (installResult.exitCode !== 0) {
      throw new Error(
        `Failed to install Claude Code: ${installResult.stderr.toString()}`,
      );
    }

    console.log("=========================================");
    console.log("Phase 4: Installing base-action dependencies...");
    console.log("=========================================");

    // Install base-action dependencies
    const baseActionPath = path.join(
      path.dirname(__dirname),
      "..",
      "base-action",
    );
    const depsResult = await $`cd ${baseActionPath} && bun install`;
    console.log(depsResult.stdout.toString());

    if (depsResult.exitCode !== 0) {
      throw new Error(
        `Failed to install base-action dependencies: ${depsResult.stderr.toString()}`,
      );
    }

    console.log("=========================================");
    console.log("Phase 5: Running Claude Code...");
    console.log("=========================================");

    // Check if prompt file exists and read its content
    const promptPath = `${getClaudePromptsDirectory()}/claude-prompt.txt`;
    let promptContent = "";
    try {
      const fs = await import("fs");
      promptContent = await fs.promises.readFile(promptPath, "utf-8");
      console.log(
        `Prompt file loaded, size: ${promptContent.length} characters`,
      );

      // Debug: Show first 500 chars of prompt
      if (promptContent.length > 0) {
        console.log("Prompt preview (first 500 chars):");
        console.log(promptContent.substring(0, 500));
        console.log("...");
      }
    } catch (error) {
      console.error("Failed to read prompt file:", error);
    }

    // Set up environment for base-action
    const env = {
      ...process.env,
      CLAUDE_CODE_ACTION: "1",
      INPUT_PROMPT_FILE: promptPath,
      INPUT_TIMEOUT_MINUTES: "30",
      INPUT_MCP_CONFIG: "",
      INPUT_SETTINGS: "",
      INPUT_SYSTEM_PROMPT: "",
      INPUT_APPEND_SYSTEM_PROMPT: "",
      INPUT_ALLOWED_TOOLS: process.env.ALLOWED_TOOLS || "",
      INPUT_DISALLOWED_TOOLS: process.env.DISALLOWED_TOOLS || "",
      INPUT_MAX_TURNS: process.env.MAX_TURNS || "",
      INPUT_CLAUDE_ENV: process.env.CLAUDE_ENV || "",
      INPUT_FALLBACK_MODEL: process.env.FALLBACK_MODEL || "",
      ANTHROPIC_MODEL: process.env.CLAUDE_MODEL || "sonnet",
      DETAILED_PERMISSION_MESSAGES: "1",
    };

    // Run the base-action
    const baseActionScript = path.join(baseActionPath, "src", "index.ts");
    const executeResult = await $`bun run ${baseActionScript}`.env(env).quiet();

    // Print output regardless of exit code
    console.log(executeResult.stdout.toString());
    if (executeResult.stderr.toString()) {
      console.error(executeResult.stderr.toString());
    }

    // Base-action writes to CI_BUILDS_DIR/claude-execution-output.json
    // (or RUNNER_TEMP/claude-execution-output.json for GitHub)
    // But if jq is not available, it only creates output.txt (JSONL format)
    // We need to use the same path that base-action uses
    const tempDir = process.env.CI_BUILDS_DIR || process.env.RUNNER_TEMP || "/tmp";
    const outputFile = path.join(tempDir, "claude-execution-output.json");
    const outputTxtFile = path.join(tempDir, "output.txt");
    
    // Check if either file exists (base-action creates output.txt, then tries to convert to JSON)
    const fs = await import("fs");
    const jsonExists = fs.existsSync(outputFile);
    const txtExists = fs.existsSync(outputTxtFile);
    
    if (!jsonExists && !txtExists) {
      console.warn(`Warning: Output files not found at ${outputFile} or ${outputTxtFile}`);
      console.warn("Base-action may not have created the execution output file");
    } else {
      if (jsonExists) {
        console.log(`Output file found at: ${outputFile}`);
      }
      if (txtExists) {
        console.log(`Output.txt file found at: ${outputTxtFile}`);
      }
    }
    
    // Use output.txt if JSON doesn't exist (jq might not be available)
    const actualOutputFile = jsonExists ? outputFile : (txtExists ? outputTxtFile : outputFile);

    return {
      success: executeResult.exitCode === 0,
      error:
        executeResult.exitCode !== 0 ? "Claude execution failed" : undefined,
      commentId: prepareResult.commentId,
      outputFile: actualOutputFile,
    };
  } catch (error) {
    console.error("Error in execute phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      commentId: prepareResult.commentId,
    };
  }
}

/**
 * Checks if there are any git changes in the project directory.
 * 
 * IMPORTANT: This function ensures we're checking the correct repository
 * and filters out temporary files that shouldn't be committed.
 * 
 * Why these changes were made:
 * 1. Previously, the code might run in /tmp/claude-code directory instead of the actual project
 * 2. This caused it to create MRs with random files from the wrong directory
 * 3. Now we explicitly change to CI_PROJECT_DIR and verify we're in the correct repo
 * 4. We also clean up temp files (output.txt, logs, etc.) that base-action creates
 *    so they don't get committed accidentally
 */
async function checkGitStatus(): Promise<boolean> {
  try {
    // CRITICAL: Ensure we're in the project directory, not /tmp/claude-code
    // Problem: Previously the code might be running in the wrong directory,
    // causing it to check git status of the wrong repository
    const projectDir = process.env.CI_PROJECT_DIR;
    if (!projectDir) {
      console.error("CI_PROJECT_DIR is not set!");
      return false;
    }

    // Change to project directory to ensure we're checking the right repo
    process.chdir(projectDir);
    console.log(`Checking git status in: ${projectDir}`);

    // Verify we're in the correct repository
    // This prevents accidentally committing to the wrong project
    const remoteResult = await $`git remote get-url origin`.quiet();
    const remoteUrl = remoteResult.stdout.toString().trim();
    const expectedProject = process.env.CI_PROJECT_PATH;
    
    if (expectedProject && !remoteUrl.includes(expectedProject)) {
      console.error(`Wrong repository! Expected ${expectedProject}, got ${remoteUrl}`);
      return false;
    }

    // Clean up temporary files that shouldn't be committed
    // Problem: base-action creates output.txt and other temp files in the project directory
    // These files were being committed accidentally, creating MRs with nonsense files
    // Solution: Delete these temp files before checking git status
    const tempPatterns = [
      "*.log",           // Log files
      "*.tmp",           // Temporary files
      "output.txt",      // Base-action's output file (JSONL format)
      ".claude-*",       // Claude-related temp files
      "/tmp/claude-*",   // Temp files in /tmp
      "node_modules/.cache", // Node cache
      ".DS_Store",       // macOS system file
    ];

    // Also clean up common temp directories
    const tempDirs = [
      "/tmp/claude-prompts",  // Prompt files
      "/tmp/claude-output",   // Output files
      ".claude",              // Claude temp directory
    ];

    // Delete temp files matching patterns
    for (const pattern of tempPatterns) {
      try {
        await $`find . -name "${pattern}" -type f -delete`.quiet();
      } catch {
        // Ignore errors if files don't exist
      }
    }

    // Delete temp directories
    for (const dir of tempDirs) {
      try {
        await $`rm -rf ${dir}`.quiet();
      } catch {
        // Ignore errors if directories don't exist
      }
    }

    // Check git status after cleanup
    const result = await $`git status --porcelain`.quiet();
    const changes = result.stdout.toString().trim();
    
    if (changes) {
      console.log("Git changes detected:");
      console.log(changes);
      
      // Filter out any remaining temp files that might have been missed
      // This is a safety check - we already deleted them above, but just in case
      const lines = changes.split("\n");
      const filteredLines = lines.filter(line => {
        const file = line.substring(3).trim(); // Skip git status prefix (e.g., "?? ")
        // Exclude temp files and directories
        return !file.includes("/tmp/") &&
               !file.includes(".claude") &&
               !file.endsWith(".log") &&
               !file.endsWith(".tmp") &&
               !file.includes("node_modules/.cache");
      });
      
      // If all changes are temp files, return false (no real changes)
      if (filteredLines.length === 0) {
        console.log("All changes are temporary files, ignoring...");
        return false;
      }
      
      // Real project files have changed
      return true;
    }
    
    // No changes detected
    return false;
  } catch (error) {
    console.error("Error checking git status:", error);
    return false;
  }
}

async function createMergeRequest(
  prepareResult: PhaseResult,
  _executeResult: PhaseResult,
): Promise<void> {
  try {
    console.log("=========================================");
    console.log("Creating GitLab Merge Request...");
    console.log("=========================================");

    // CRITICAL: Ensure we're in the project directory
    const projectDir = process.env.CI_PROJECT_DIR;
    if (!projectDir) {
      throw new Error("CI_PROJECT_DIR is not set!");
    }

    // Change to project directory
    process.chdir(projectDir);
    console.log(`Working in project directory: ${projectDir}`);

    // Verify we're in the correct repository
    const remoteResult = await $`git remote get-url origin`.quiet();
    const remoteUrl = remoteResult.stdout.toString().trim();
    const expectedProject = process.env.CI_PROJECT_PATH;
    
    if (expectedProject && !remoteUrl.includes(expectedProject)) {
      throw new Error(`Wrong repository! Expected ${expectedProject}, but working in ${remoteUrl}`);
    }

    console.log(`Verified repository: ${remoteUrl}`);

    // Clean up temporary files before committing
    console.log("Cleaning up temporary files...");
    const tempPatterns = [
      "*.log",
      "*.tmp",
      "output.txt",
      ".claude-*",
      ".DS_Store",
    ];

    for (const pattern of tempPatterns) {
      try {
        await $`find . -name "${pattern}" -type f -not -path "*/node_modules/*" -delete`.quiet();
      } catch {
        // Ignore errors
      }
    }

    // Get current branch
    const currentBranchResult = await $`git rev-parse --abbrev-ref HEAD`.quiet();
    const currentBranch = currentBranchResult.stdout.toString().trim();
    console.log(`Current branch: ${currentBranch}`);

    // Get branch name based on context
    const timestamp = Date.now();
    const branchName =
      process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ||
      `claude-${process.env.CLAUDE_RESOURCE_TYPE}-${process.env.CLAUDE_RESOURCE_ID}-${timestamp}`;

    // Configure git
    await $`git config user.name "Claude[bot]"`.quiet();
    await $`git config user.email "claude-bot@noreply.gitlab.com"`.quiet();

    // Only create new branch if we're not already on it
    if (currentBranch !== branchName) {
      // Create and checkout new branch
      await $`git checkout -b ${branchName}`.quiet();
      console.log(`Created branch: ${branchName}`);
    } else {
      console.log(`Already on branch: ${branchName}`);
    }

    // Show what files are changed before adding
    console.log("Checking git status before adding files...");
    const statusBeforeResult = await $`git status --porcelain`.quiet();
    const statusBefore = statusBeforeResult.stdout.toString().trim();
    
    if (!statusBefore) {
      console.log("No changes to commit!");
      return;
    }

    console.log("Files changed:");
    console.log(statusBefore);

    // Add changes, but exclude temp files explicitly
    await $`git add -A`.quiet();
    
    // Remove any temp files that might have been added
    try {
      await $`git reset HEAD -- "*.log" "*.tmp" "output.txt" ".claude-*" "/tmp/*"`.quiet();
      await $`git checkout -- "*.log" "*.tmp" "output.txt" ".claude-*" "/tmp/*"`.quiet();
    } catch {
      // Ignore if no such files
    }

    // Show what files will be committed
    console.log("Files to be committed:");
    const statusResult = await $`git status --short`.quiet();
    const statusOutput = statusResult.stdout.toString().trim();
    
    if (!statusOutput) {
      console.log("No valid changes to commit after filtering temp files!");
      return;
    }
    
    console.log(statusOutput);

    // Verify we have actual project files, not just temp files
    const lines = statusOutput.split("\n");
    const validFiles = lines.filter(line => {
      const file = line.substring(3).trim();
      return !file.includes("/tmp/") &&
             !file.includes(".claude") &&
             !file.endsWith(".log") &&
             !file.endsWith(".tmp");
    });

    if (validFiles.length === 0) {
      console.log("No valid project files to commit, aborting MR creation");
      return;
    }

    // Commit with descriptive message
    const commitMessage = `fix: Apply Claude's suggestions for ${process.env.CLAUDE_RESOURCE_TYPE} #${process.env.CLAUDE_RESOURCE_ID}

This commit was automatically generated by Claude AI in response to a request.
See the original ${process.env.CLAUDE_RESOURCE_TYPE} for context.`;

    await $`git commit -m ${commitMessage}`.quiet();
    console.log("Committed changes");

    // Push with GitLab push options to create MR
    // Use CLAUDE_BASE_BRANCH (set by webhook) or fall back to CI_DEFAULT_BRANCH
    const targetBranch = process.env.CLAUDE_BASE_BRANCH || process.env.CI_DEFAULT_BRANCH || "main";
    console.log(`Target branch for MR: ${targetBranch}`);

    const mrTitle = `Apply Claude's suggestions for ${process.env.CLAUDE_RESOURCE_TYPE} #${process.env.CLAUDE_RESOURCE_ID}`;

    // GitLab push options cannot contain newlines, so we'll use a simpler description
    const resourceUrl = `${process.env.CI_SERVER_URL}/${process.env.CI_PROJECT_PATH}/-/${process.env.CLAUDE_RESOURCE_TYPE === "issue" ? "issues" : "merge_requests"}/${process.env.CLAUDE_RESOURCE_ID}`;
    const mrDescription = `Automated MR by Claude AI. See ${resourceUrl} for context. /cc @${process.env.GITLAB_USER_LOGIN || "claude"}`;

    // Set up git remote with proper authentication
    const gitToken =
      process.env.CLAUDE_CODE_GL_ACCESS_TOKEN || process.env.CI_JOB_TOKEN;
    const tokenType = process.env.CLAUDE_CODE_GL_ACCESS_TOKEN
      ? "oauth2"
      : "gitlab-ci-token";

    console.log(`Using ${tokenType} for git authentication`);

    const gitRemoteUrl = `https://${tokenType}:${gitToken}@${process.env.CI_SERVER_HOST}/${process.env.CI_PROJECT_PATH}.git`;
    await $`git remote set-url origin ${gitRemoteUrl}`.quiet();

    // Push with MR creation options
    const pushResult = await $`git push \
      -o merge_request.create \
      -o merge_request.target=${targetBranch} \
      -o merge_request.title="${mrTitle}" \
      -o merge_request.description="${mrDescription}" \
      -o merge_request.remove_source_branch \
      origin ${branchName}`.quiet();

    console.log(pushResult.stdout.toString());

    // Extract MR URL from push output
    const output = pushResult.stdout.toString();
    const mrUrlMatch = output.match(/https:\/\/[^\s]+\/merge_requests\/\d+/);
    if (mrUrlMatch) {
      console.log(`✅ Merge request created: ${mrUrlMatch[0]}`);

      // Post comment on original issue/MR about the new MR
      if (prepareResult.commentId) {
        const provider = await import("../providers/provider-factory");
        const scmProvider = provider.createProvider({
          platform: "gitlab",
          token: provider.getToken(),
        });

        await scmProvider.createComment(
          `🎯 I've created a merge request with the changes: ${mrUrlMatch[0]}\n\nPlease review and merge if the changes look good.`,
        );
      }
    }
  } catch (error) {
    console.error("Error creating merge request:", error);
    throw error;
  }
}

async function postClaudeResponse(
  _prepareResult: PhaseResult,
  executeResult: PhaseResult,
): Promise<void> {
  try {
    console.log("=========================================");
    console.log("Posting Claude's response to GitLab...");
    console.log("=========================================");

    // Read the output file - try multiple possible locations
    const fs = await import("fs");
    const tempDir = process.env.CI_BUILDS_DIR || process.env.RUNNER_TEMP || "/tmp";
    
    // Try multiple possible output file locations
    const possibleOutputFiles = [
      executeResult.outputFile, // From executeResult
      path.join(tempDir, "claude-execution-output.json"), // Base-action's JSON file
      path.join(tempDir, "output.txt"), // Base-action's raw JSONL file
      getClaudeExecutionOutputPath(), // Fallback
    ].filter(Boolean) as string[];

    let outputContent = "";
    let outputPath = "";

    // Try to read from any of the possible locations
    for (const filePath of possibleOutputFiles) {
      try {
        if (fs.existsSync(filePath)) {
          console.log(`Reading output from: ${filePath}`);
          outputContent = await fs.promises.readFile(filePath, "utf-8");
          outputPath = filePath;
          break;
        }
      } catch (error) {
        console.log(`File not found or unreadable: ${filePath}`);
        continue;
      }
    }

    if (!outputContent) {
      console.error("Could not find output file in any of these locations:");
      possibleOutputFiles.forEach(f => console.error(`  - ${f}`));
      return;
    }

    // Parse the JSONL output (multiple JSON objects separated by newlines)
    const lines = outputContent.trim().split("\n");
    let claudeMessage = "";

    // Process each line as a separate JSON object
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const output = JSON.parse(line);

        // Look for the result in the final result object
        if (output.type === "result" && output.result) {
          claudeMessage = output.result;
          console.log("Found result message in output");
          break;
        }

        // Also check assistant messages
        if (output.type === "assistant" && output.message?.content) {
          let tempMessage = "";
          for (const content of output.message.content) {
            if (content.type === "text") {
              tempMessage += content.text + "\n";
            }
          }
          if (tempMessage) {
            claudeMessage = tempMessage.trim();
            console.log("Found assistant message in output");
          }
        }
      } catch (parseError) {
        // If it's not JSON, it might be plain text - use it as is
        if (!claudeMessage && line.trim().length > 50) {
          claudeMessage = line.trim();
          console.log("Using plain text output");
        }
        continue;
      }
    }

    if (!claudeMessage) {
      console.log("No message found in Claude's output");
      console.log("Output content preview:", outputContent.substring(0, 500));
      return;
    }

    // Post the response as a comment
    const provider = await import("../providers/provider-factory");
    const scmProvider = provider.createProvider({
      platform: "gitlab",
      token: provider.getToken(),
    });

    const formattedMessage = `## 🤖 Claude's Response

${claudeMessage}

---
*This response was generated by Claude AI. No code changes were made.*`;

    await scmProvider.createComment(formattedMessage);
    console.log("✅ Posted Claude's response to GitLab");
  } catch (error) {
    console.error("Error posting Claude's response:", error);
    // Don't throw - this is not critical
  }
}

async function runUpdatePhase(
  prepareResult: PhaseResult,
  executeResult: PhaseResult,
): Promise<PhaseResult> {
  try {
    // Check if there are any git changes
    const hasChanges = await checkGitStatus();

    if (hasChanges) {
      console.log("Git changes detected - creating merge request");
      await createMergeRequest(prepareResult, executeResult);
    } else {
      console.log("No git changes detected - posting Claude's response");
      await postClaudeResponse(prepareResult, executeResult);
    }

    // Also update the tracking comment if we have one
    if (!prepareResult.commentId) {
      console.log("No comment ID available, skipping comment update");
      return { success: true };
    }

    console.log("=========================================");
    console.log("Phase 6: Updating tracking comment...");
    console.log("=========================================");

    // Base-action writes to CI_BUILDS_DIR/claude-execution-output.json
    // But if jq is not available, it only creates output.txt (JSONL format)
    const tempDir = process.env.CI_BUILDS_DIR || process.env.RUNNER_TEMP || "/tmp";
    const baseActionOutputFile = path.join(tempDir, "claude-execution-output.json");
    const baseActionOutputTxt = path.join(tempDir, "output.txt");
    
    // Use the output file from executeResult if available, otherwise try both possible locations
    let outputFile = executeResult.outputFile;
    if (!outputFile) {
      const fs = await import("fs");
      // Prefer JSON file, but fall back to output.txt if JSON doesn't exist
      if (fs.existsSync(baseActionOutputFile)) {
        outputFile = baseActionOutputFile;
      } else if (fs.existsSync(baseActionOutputTxt)) {
        outputFile = baseActionOutputTxt;
        console.log("Using output.txt as execution file (JSON file not found, jq may not be available)");
      } else {
        outputFile = baseActionOutputFile; // Default, even if it doesn't exist
      }
    }

    // Set up environment for update script
    const env = {
      ...process.env,
      CLAUDE_COMMENT_ID: prepareResult.commentId.toString(),
      CLAUDE_SUCCESS: executeResult.success ? "true" : "false",
      PREPARE_SUCCESS: prepareResult.success ? "true" : "false",
      OUTPUT_FILE: outputFile,
    };

    // Ensure CI_PROJECT_ID is set
    if (!env.CI_PROJECT_ID && process.env.CI_PROJECT_ID) {
      env.CI_PROJECT_ID = process.env.CI_PROJECT_ID;
    }

    // If we're in issue context, ensure CI_ISSUE_IID is set
    if (
      process.env.CLAUDE_RESOURCE_TYPE === "issue" &&
      process.env.CLAUDE_RESOURCE_ID
    ) {
      env.CI_ISSUE_IID = process.env.CLAUDE_RESOURCE_ID;
      console.log(`Set CI_ISSUE_IID=${env.CI_ISSUE_IID} for issue context`);
    }

    // If we're in MR context, ensure CI_MERGE_REQUEST_IID is set
    if (
      process.env.CLAUDE_RESOURCE_TYPE === "merge_request" &&
      process.env.CLAUDE_RESOURCE_ID
    ) {
      env.CI_MERGE_REQUEST_IID = process.env.CLAUDE_RESOURCE_ID;
      console.log(`Set CI_MERGE_REQUEST_IID=${env.CI_MERGE_REQUEST_IID} for MR context`);
    }

    // Debug: Print environment variables
    console.log("Environment variables for update script:");
    console.log(`  CLAUDE_COMMENT_ID: ${env.CLAUDE_COMMENT_ID}`);
    console.log(`  CI_PROJECT_ID: ${env.CI_PROJECT_ID || "NOT SET"}`);
    console.log(`  CI_ISSUE_IID: ${env.CI_ISSUE_IID || "NOT SET"}`);
    console.log(`  CI_MERGE_REQUEST_IID: ${env.CI_MERGE_REQUEST_IID || "NOT SET"}`);
    console.log(`  OUTPUT_FILE: ${env.OUTPUT_FILE}`);
    console.log(`  CLAUDE_RESOURCE_TYPE: ${process.env.CLAUDE_RESOURCE_TYPE || "NOT SET"}`);
    console.log(`  CLAUDE_RESOURCE_ID: ${process.env.CLAUDE_RESOURCE_ID || "NOT SET"}`);

    // Run update script
    const updateScript = path.join(__dirname, "update-comment-gitlab.ts");
    const updateResult = await $`bun run ${updateScript}`.env(env).quiet();

    console.log(updateResult.stdout.toString());

    if (updateResult.exitCode !== 0) {
      const stderr = updateResult.stderr.toString();
      console.error("Failed to update comment:", stderr);
      
      // Don't fail the entire job - comment update is not critical
      console.warn("Warning: Comment update failed, but job will continue");
      return {
        success: false,
        error: "Failed to update comment (non-critical)",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in update phase:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  let exitCode = 0;
  let prepareResult: PhaseResult = { success: false };
  let executeResult: PhaseResult = { success: false };

  try {
    // Phase 1: Prepare
    prepareResult = await runPreparePhase();

    if (!prepareResult.success) {
      // Exit early if prepare failed (no trigger found is not an error)
      if (prepareResult.error === "No trigger found") {
        console.log("✅ No Claude trigger found in the request");
        process.exit(0);
      }
      throw new Error(`Prepare phase failed: ${prepareResult.error}`);
    }

    // Phase 2-5: Setup branch, install dependencies, and execute Claude
    executeResult = await runExecutePhase(prepareResult);

    if (!executeResult.success) {
      exitCode = 1;
      console.error(`Execute phase failed: ${executeResult.error}`);
    }

    // Phase 6: Update (always run after execution completes)
    // This should run whether execute succeeded or failed
    const updateResult = await runUpdatePhase(prepareResult, executeResult);
    if (!updateResult.success) {
      console.error("Warning: Failed to update comment");
      // Don't fail the entire job just because update failed
    }
  } catch (error) {
    exitCode = 1;
    console.error("Fatal error:", error);

    // Even on fatal error, try to update if we have a comment
    if (prepareResult.commentId) {
      try {
        const updateResult = await runUpdatePhase(prepareResult, executeResult);
        if (!updateResult.success) {
          console.error("Warning: Failed to update comment after fatal error");
        }
      } catch (updateError) {
        console.error("Error during emergency update:", updateError);
      }
    }
  }

  // Exit with appropriate code
  process.exit(exitCode);
}

// Run the main function
if (import.meta.main) {
  main();
}
