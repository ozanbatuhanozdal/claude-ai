import { describe, test, expect } from "bun:test";
import { checkGitLabTriggerAction } from "../../src/gitlab/validation/trigger";

describe("checkGitLabTriggerAction", () => {
  describe("Direct prompt mode", () => {
    test("returns true when directPrompt is provided", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {} as any,
        triggerPhrase: "@claude",
        directPrompt: "Fix the bug in auth module",
      });

      expect(result).toBe(true);
    });

    test("returns true regardless of payload when directPrompt exists", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "random comment",
          },
        } as any,
        triggerPhrase: "@claude",
        directPrompt: "Do something",
      });

      expect(result).toBe(true);
    });
  });

  describe("Note webhook triggers", () => {
    test("triggers on note containing trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "@claude please help fix this issue",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("triggers on note with trigger phrase at start", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "@claude help",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("triggers on note with trigger phrase in middle", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "Hey @claude, can you review this?",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("does not trigger without trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "This is just a regular comment",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("is case insensitive for trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "@Claude please help",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("handles multiline notes", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: `Here's my request:
            
@claude can you add error handling to this function?

Thanks!`,
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("handles empty note", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("handles missing note field", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("does not trigger on non-MR notes", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "@claude help",
            noteable_type: "Issue",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });
  });

  describe("Issue webhook triggers", () => {
    test("triggers on issue description containing trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "issue",
          object_attributes: {
            description: "@claude please implement user authentication",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("triggers on issue title containing trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "issue",
          object_attributes: {
            title: "@claude: Add authentication",
            description: "We need user auth",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("does not trigger on issue without trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "issue",
          object_attributes: {
            description: "We need to implement user authentication",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("handles empty issue description", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "issue",
          object_attributes: {
            description: "",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("handles null issue description", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "issue",
          object_attributes: {
            description: null,
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });
  });

  describe("Merge request webhook triggers", () => {
    test("triggers on MR description containing trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "merge_request",
          object_attributes: {
            description:
              "Fixes #123\n\n@claude please review for security issues",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("triggers on MR title containing trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "merge_request",
          object_attributes: {
            title: "@claude Review: Security updates",
            description: "Various security improvements",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("does not trigger on MR without trigger phrase", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "merge_request",
          object_attributes: {
            description: "Fixes #123\n\nPlease review",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("handles merge_request field instead of object_attributes", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "merge_request",
          merge_request: {
            description: "@claude review this",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });
  });

  describe("Custom trigger phrases", () => {
    test("works with custom single-word trigger", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "/ai-assist help me",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "/ai-assist",
      });

      expect(result).toBe(true);
    });

    test("works with custom multi-word trigger", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "Hey bot please help with this",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "Hey bot",
      });

      expect(result).toBe(true);
    });

    test("works with special characters in trigger", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "{{AI}} analyze this code",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "{{AI}}",
      });

      expect(result).toBe(true);
    });
  });

  describe("Edge cases", () => {
    test("returns false for unsupported webhook types", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "pipeline",
          object_attributes: {},
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("returns false when payload is null", async () => {
      const result = await checkGitLabTriggerAction({
        payload: null as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("returns false when payload is undefined", async () => {
      const result = await checkGitLabTriggerAction({
        payload: undefined as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("returns false when object_kind is missing", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_attributes: {
            note: "@claude help",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("returns false when object_attributes is missing", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(false);
    });

    test("uses default trigger phrase when not provided", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "@claude help me",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "@claude",
      });

      expect(result).toBe(true);
    });

    test("handles trigger phrase with regex special characters", async () => {
      const result = await checkGitLabTriggerAction({
        payload: {
          object_kind: "note",
          object_attributes: {
            note: "$bot$ please help",
            noteable_type: "MergeRequest",
          },
        } as any,
        triggerPhrase: "$bot$",
      });

      expect(result).toBe(true);
    });
  });
});
