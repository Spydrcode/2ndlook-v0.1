"use server";

import { getOrCreateInstallationId } from "@/lib/installations/cookie";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server action to generate a snapshot using the orchestrator
 *
 * Example usage in a React component:
 * ```tsx
 * import { generateSnapshotAction } from "@/server/server-actions";
 *
 * async function handleGenerate() {
 *   const result = await generateSnapshotAction(sourceId);
 *   if (result.error) {
 *     console.error(result.error);
 *   } else {
 *     console.log("Snapshot ID:", result.snapshot_id);
 *   }
 * }
 * ```
 */
export async function generateSnapshotAction(
  sourceId: string,
): Promise<{ snapshot_id: string; error?: never } | { snapshot_id?: never; error: string }> {
  try {
    const installationId = await getOrCreateInstallationId();
    const supabase = createAdminClient();

    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("id, installation_id")
      .eq("id", sourceId)
      .single();

    if (sourceError || !source || source.installation_id !== installationId) {
      return { error: "Invalid source_id" };
    }

    // Run the orchestrator pipeline
    const result = await runSnapshotOrchestrator({
      source_id: sourceId,
      installation_id: installationId,
    });

    return { snapshot_id: result.snapshot_id };
  } catch (error) {
    console.error("[Server Action] Snapshot generation failed:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to generate snapshot",
    };
  }
}
