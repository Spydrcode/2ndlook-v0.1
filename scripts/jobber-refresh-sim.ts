import { getJobberTokens } from "../src/lib/jobber/tokenManager";

const installationId = process.env.JOBBER_INSTALLATION_ID;

if (!installationId) {
  console.error("Set JOBBER_INSTALLATION_ID to run this script.");
  process.exit(1);
}

async function run() {
  const [first, second] = await Promise.all([
    getJobberTokens(installationId, { forceRefresh: true }),
    getJobberTokens(installationId, { forceRefresh: true }),
  ]);

  console.log("First result:", {
    ok: !!first,
    tokenVersion: first?.tokenVersion,
    expiresAt: first?.expiresAt,
  });
  console.log("Second result:", {
    ok: !!second,
    tokenVersion: second?.tokenVersion,
    expiresAt: second?.expiresAt,
  });
}

run().catch((err) => {
  console.error("Refresh simulation failed:", err);
  process.exit(1);
});
