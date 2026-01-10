/**
 * Validation script for orchestrator modules
 * Run with: npx ts-node --compiler-options '{"module":"CommonJS"}' src/lib/orchestrator/validate.ts
 */

import { isOpenAIConfigured, getEnvironmentInfo } from "../config/environment";

console.log("🔍 Validating Orchestrator Setup...\n");

// Check environment
console.log("Environment Info:");
console.log(getEnvironmentInfo());
console.log();

// Check OpenAI configuration
if (isOpenAIConfigured()) {
  console.log("✅ OpenAI API key is configured");
} else {
  console.log("⚠️  OpenAI API key is NOT configured");
  console.log("   Add OPENAI_API_KEY to your .env.local file");
}

console.log("\n📦 Module Import Tests:");

// Test imports (compile-time check)
try {
  const orchestrator = require("./runSnapshot");
  console.log("✅ Orchestrator module imports successfully");
  console.log(`   - runSnapshotOrchestrator: ${typeof orchestrator.runSnapshotOrchestrator}`);
} catch (error) {
  console.error("❌ Failed to import orchestrator:", error);
}

try {
  const openaiClient = require("../ai/openaiClient");
  console.log("✅ OpenAI client module imports successfully");
  console.log(`   - generateSnapshotResult: ${typeof openaiClient.generateSnapshotResult}`);
} catch (error) {
  console.error("❌ Failed to import OpenAI client:", error);
}

console.log("\n✅ Validation complete!");
console.log("\nNext steps:");
console.log("1. Ensure OPENAI_API_KEY is in .env.local");
console.log("2. Create a source with bucketed data");
console.log("3. Call runSnapshotOrchestrator() to generate a snapshot");
