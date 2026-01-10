/**
 * Connector registry sanity checks.
 * Validates that all connectors are properly registered and conform to the contract.
 * Run this with: npx ts-node src/lib/connectors/sanity-check.ts
 */

import {
  listConnectors,
  listConnectorsByCategory,
  getConnector,
  isConnectorImplemented,
  NotImplementedError,
} from "./index";

async function runSanityChecks() {
  console.log("🔍 Running connector registry sanity checks...\n");

  // Check 1: Registry is not empty
  const allConnectors = listConnectors();
  console.log(`✅ Total connectors registered: ${allConnectors.length}`);
  if (allConnectors.length === 0) {
    throw new Error("Registry is empty!");
  }

  // Check 2: All connectors have required properties
  console.log("\n📋 Validating connector properties:");
  for (const connector of allConnectors) {
    if (!connector.category) {
      throw new Error(`Connector ${connector.tool} missing category`);
    }
    if (!connector.tool) {
      throw new Error(`Connector missing tool identifier`);
    }
    if (typeof connector.isImplemented !== "boolean") {
      throw new Error(`Connector ${connector.tool} missing isImplemented flag`);
    }
    if (typeof connector.getDisplayName !== "function") {
      throw new Error(`Connector ${connector.tool} missing getDisplayName method`);
    }
    console.log(
      `  ✓ ${connector.getDisplayName()} (${connector.category}:${connector.tool}) - ${
        connector.isImplemented ? "implemented" : "stub"
      }`
    );
  }

  // Check 3: Category filtering works
  console.log("\n📁 Testing category filtering:");
  const estimateConnectors = listConnectorsByCategory("estimates");
  console.log(`  ✅ Estimate connectors: ${estimateConnectors.length}`);
  if (estimateConnectors.length === 0) {
    throw new Error("No estimate connectors found!");
  }

  // Check 4: getConnector retrieves correct instances
  console.log("\n🔎 Testing connector retrieval:");
  const fileConnector = getConnector("estimates", "file");
  if (!fileConnector) {
    throw new Error("Could not retrieve file connector!");
  }
  console.log(`  ✅ Retrieved: ${fileConnector.getDisplayName()}`);

  // Check 5: Implementation status checks
  console.log("\n✨ Testing implementation status:");
  const fileImplemented = isConnectorImplemented("estimates", "file");
  const servicetitanImplemented = isConnectorImplemented("estimates", "servicetitan");
  console.log(`  ✅ File connector implemented: ${fileImplemented}`);
  console.log(`  ✅ ServiceTitan connector implemented: ${servicetitanImplemented}`);

  if (!fileImplemented) {
    throw new Error("File connector should be marked as implemented!");
  }
  if (servicetitanImplemented) {
    throw new Error("ServiceTitan connector should be marked as stub!");
  }

  // Check 6: NotImplementedError works
  console.log("\n🚫 Testing NotImplementedError:");
  try {
    const stub = getConnector("estimates", "servicetitan");
    if (stub.fetchEstimates) {
      await stub.fetchEstimates();
    }
    throw new Error("Should have thrown NotImplementedError!");
  } catch (error) {
    if (error instanceof NotImplementedError) {
      console.log(`  ✅ NotImplementedError thrown correctly: ${error.message}`);
    } else {
      throw error;
    }
  }

  // Check 7: File connector has normalization method
  console.log("\n📄 Testing file connector methods:");
  if (!fileConnector.normalizeEstimatesFromFile) {
    throw new Error("File connector missing normalizeEstimatesFromFile method!");
  }
  console.log("  ✅ File connector has normalizeEstimatesFromFile method");

  console.log("\n✅ All sanity checks passed!");
  console.log("\n📊 Summary:");
  console.log(`  Total connectors: ${allConnectors.length}`);
  console.log(
    `  Implemented: ${allConnectors.filter((c) => c.isImplemented).length}`
  );
  console.log(
    `  Stubs: ${allConnectors.filter((c) => !c.isImplemented).length}`
  );
}

// Run checks
runSanityChecks().catch((error: Error) => {
  console.error("\n❌ Sanity check failed:", error);
  process.exit(1);
});
