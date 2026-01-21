/**
 * Centralized utility for handling temporary directories across GitHub Actions and GitLab CI
 *
 * GitHub Actions provides RUNNER_TEMP environment variable
 * GitLab CI provides CI_BUILDS_DIR as the closest equivalent
 *
 * Reference:
 * - GitHub: RUNNER_TEMP is a temporary directory on the runner
 * - GitLab: CI_BUILDS_DIR is the main workspace for job execution
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Get the appropriate temporary directory based on the CI platform
 * @returns The temporary directory path
 */
export function getTempDirectory(): string {
  // GitHub Actions
  if (process.env.RUNNER_TEMP) {
    return process.env.RUNNER_TEMP;
  }

  // GitLab CI - use CI_BUILDS_DIR if available
  if (process.env.CI_BUILDS_DIR) {
    // Create a temp subdirectory within CI_BUILDS_DIR to isolate temporary files
    const gitlabTemp = join(process.env.CI_BUILDS_DIR, ".claude-temp");
    if (!existsSync(gitlabTemp)) {
      mkdirSync(gitlabTemp, { recursive: true });
    }
    return gitlabTemp;
  }

  // Fallback to system temp directory
  // This works for both local development and CI environments
  return "/tmp";
}

/**
 * Get a subdirectory within the temporary directory
 * Creates the directory if it doesn't exist
 * @param subdir The subdirectory name
 * @returns The full path to the subdirectory
 */
export function getTempSubdirectory(subdir: string): string {
  const tempDir = getTempDirectory();
  const fullPath = join(tempDir, subdir);

  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }

  return fullPath;
}

/**
 * Get the path for Claude prompts directory
 * @returns The path to the claude-prompts directory
 */
export function getClaudePromptsDirectory(): string {
  return getTempSubdirectory("claude-prompts");
}

/**
 * Get the path for Claude execution output
 * @returns The path to the execution output file
 */
export function getClaudeExecutionOutputPath(): string {
  return join(getTempDirectory(), "claude-execution-output.json");
}

/**
 * Get the path for Claude prompt pipe (used in base-action)
 * @returns The path to the prompt pipe
 */
export function getClaudePromptPipePath(): string {
  return join(getTempDirectory(), "claude_prompt_pipe");
}

/**
 * Get the path for GitHub CI logs directory (used in MCP server)
 * @returns The path to the logs directory
 */
export function getGitHubCILogsDirectory(): string {
  return getTempSubdirectory("github-ci-logs");
}

/**
 * Detect the current CI platform
 * @returns 'github' | 'gitlab' | 'unknown'
 */
export function detectCIPlatform(): "github" | "gitlab" | "unknown" {
  if (process.env.GITHUB_ACTIONS === "true") {
    return "github";
  }

  if (process.env.GITLAB_CI === "true") {
    return "gitlab";
  }

  return "unknown";
}

/**
 * Get platform-specific environment info for debugging
 * @returns Object with platform info
 */
export function getPlatformTempInfo(): {
  platform: string;
  tempDir: string;
  source: string;
} {
  const platform = detectCIPlatform();
  const tempDir = getTempDirectory();

  let source = "fallback";
  if (process.env.RUNNER_TEMP) {
    source = "RUNNER_TEMP";
  } else if (process.env.CI_BUILDS_DIR) {
    source = "CI_BUILDS_DIR";
  }

  return {
    platform,
    tempDir,
    source,
  };
}
