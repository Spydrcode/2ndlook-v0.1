import { getJobberTokens } from "@/lib/jobber/tokenManager";

export interface JobberTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

export async function getJobberAccessToken(installationId: string): Promise<string | null> {
  const bundle = await getJobberTokens(installationId);
  return bundle?.accessToken ?? null;
}

export async function getJobberTokensBundle(installationId: string): Promise<JobberTokens | null> {
  const bundle = await getJobberTokens(installationId);
  if (!bundle) return null;
  return {
    access_token: bundle.accessToken,
    refresh_token: bundle.refreshToken,
    expires_at: bundle.expiresAt,
  };
}
