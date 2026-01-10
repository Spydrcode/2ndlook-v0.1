"use server";

import { createClient } from "@/lib/supabase/server";
import { runSnapshotOrchestrator } from "@/lib/orchestrator/runSnapshot";

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
export async function generateSnapshotAction(sourceId: string): Promise<
  | { snapshot_id: string; error?: never }
  | { snapshot_id?: never; error: string }
> {
  try {
    const supabase = createClient();

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Unauthorized" };
    }

    // Run the orchestrator pipeline
    const result = await runSnapshotOrchestrator({
      source_id: sourceId,
      user_id: user.id,
    });

    return { snapshot_id: result.snapshot_id };
  } catch (error) {
    console.error("[Server Action] Snapshot generation failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate snapshot",
    };
  }
}
