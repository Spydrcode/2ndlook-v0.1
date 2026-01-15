/**
 * Connector registry sanity checks.
 * Run with: npx ts-node src/lib/connectors/sanity-check.ts
 */

import {
  getConnector,
  isConnectorImplemented,
  listConnectors,
  listConnectorsByCategory,
  NotImplementedError,
} from "./index";

async function runSanityChecks() {
  console.log("Running connector registry sanity checks...\n");

  const allConnectors = listConnectors();
  console.log(`Total connectors registered: ${allConnectors.length}`);
  if (allConnectors.length === 0) {
    throw new Error("Registry is empty!");
  }

  console.log("\nValidating connector properties:");
  for (const connector of allConnectors) {
    if (!connector.category) throw new Error(`Connector ${connector.tool} missing category`);
    if (!connector.tool) throw new Error("Connector missing tool identifier");
    if (typeof connector.isImplemented !== "boolean")
      throw new Error(`Connector ${connector.tool} missing isImplemented flag`);
    if (typeof connector.getDisplayName !== "function")
      throw new Error(`Connector ${connector.tool} missing getDisplayName method`);
    console.log(
      `  ${connector.getDisplayName()} (${connector.category}:${connector.tool}) - ${connector.isImplemented ? "implemented" : "stub"}`,
    );
  }

  console.log("\nTesting category filtering:");
  const estimateConnectors = listConnectorsByCategory("estimates");
  console.log(`  Estimate connectors: ${estimateConnectors.length}`);
  if (estimateConnectors.length === 0) throw new Error("No estimate connectors found!");

  console.log("\nTesting connector retrieval:");
  const jobberConnector = getConnector("estimates", "jobber");
  console.log(`  Retrieved: ${jobberConnector.getDisplayName()}`);

  console.log("\nTesting implementation status:");
  const jobberImplemented = isConnectorImplemented("estimates", "jobber");
  console.log(`  Jobber connector implemented: ${jobberImplemented}`);

  console.log("\nTesting NotImplementedError:");
  try {
    const stub = getConnector("estimates", "housecall-pro");
    if (stub.fetchEstimates) {
      await stub.fetchEstimates();
    }
    throw new Error("Should have thrown NotImplementedError!");
  } catch (error) {
    if (error instanceof NotImplementedError) {
      console.log(`  NotImplementedError thrown correctly: ${error.message}`);
    } else {
      throw error;
    }
  }

  console.log("\nAll sanity checks passed!");
  console.log("\nSummary:");
  console.log(`  Total connectors: ${allConnectors.length}`);
  console.log(`  Implemented: ${allConnectors.filter((c) => c.isImplemented).length}`);
  console.log(`  Stubs: ${allConnectors.filter((c) => !c.isImplemented).length}`);
}

runSanityChecks().catch((error: Error) => {
  console.error("\nSanity check failed:", error);
  process.exit(1);
});
