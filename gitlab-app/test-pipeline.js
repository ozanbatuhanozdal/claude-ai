#!/usr/bin/env node

// Test script to verify pipeline triggering works

async function testPipelineTrigger() {
  const projectId = 116; // Your test project ID
  const ref = "main";
  const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
  const token = process.env.GITLAB_TOKEN;

  // Test variables
  const variables = [
    { key: "CLAUDE_TRIGGER", value: "true" },
    { key: "TEST_VAR", value: "test_value" },
  ];

  const requestBody = {
    ref,
    variables,
  };

  try {
    console.log("Testing pipeline trigger using fetch...");
    console.log("GitLab URL:", gitlabUrl);
    console.log("Project ID:", projectId);
    console.log("Branch:", ref);
    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(
      `${gitlabUrl}/api/v4/projects/${projectId}/pipeline`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error("\n❌ Failed to parse response:");
      console.error("Status:", response.status, response.statusText);
      console.error("Response text:", responseText);
      return;
    }

    if (!response.ok) {
      console.error("\n❌ Pipeline creation failed:");
      console.error("Status:", response.status, response.statusText);
      console.error("Response body:", JSON.stringify(responseData, null, 2));
      return;
    }

    console.log("\n✅ Pipeline created successfully!");
    console.log("Pipeline ID:", responseData.id);
    console.log("Pipeline URL:", responseData.web_url);
    console.log("Status:", responseData.status);
    console.log("Full response:", JSON.stringify(responseData, null, 2));
  } catch (error) {
    console.error("\n❌ Request failed:");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
  }
}

// Run test if called directly
if (require.main === module) {
  if (!process.env.GITLAB_TOKEN) {
    console.error("Error: GITLAB_TOKEN environment variable is required");
    process.exit(1);
  }

  testPipelineTrigger();
}
