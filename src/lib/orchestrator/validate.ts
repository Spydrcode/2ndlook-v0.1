/**
 * Validation script for orchestrator modules
 * Run with: npx ts-node src/lib/orchestrator/validate.ts
 */

import { getEnvironmentInfo, isOpenAIConfigured } from "../config/environment";

async function runValidation() {
  console.log("Validating Orchestrator Setup...\n");

  // Check environment
  console.log("Environment Info:");
  console.log(getEnvironmentInfo());
  console.log();

  // Check OpenAI configuration
  if (isOpenAIConfigured()) {
    console.log("OK: OpenAI API key is configured");
  } else {
    console.log("WARN: OpenAI API key is NOT configured");
    console.log("  Add OPENAI_API_KEY to your .env.local file");
  }

  console.log("\nModule Import Tests:");

  // Test imports (compile-time check)
  try {
    const orchestrator = await import("./runSnapshot");
    console.log("OK: Orchestrator module imports successfully");
    console.log(`  - runSnapshotOrchestrator: ${typeof orchestrator.runSnapshotOrchestrator}`);
  } catch (error) {
    console.error("FAIL: Failed to import orchestrator:", error);
  }

  try {
    const openaiClient = await import("../ai/openaiClient");
    console.log("OK: OpenAI client module imports successfully");
    console.log(`  - generateSnapshotResult: ${typeof openaiClient.generateSnapshotResult}`);
  } catch (error) {
    console.error("FAIL: Failed to import OpenAI client:", error);
  }

  console.log("\nValidation complete!");
  console.log("\nNext steps:");
  console.log("1. Ensure OPENAI_API_KEY is in .env.local");
  console.log("2. Create a source with bucketed data");
  console.log("3. Call runSnapshotOrchestrator() to generate a snapshot");
}

void runValidation();
