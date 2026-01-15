/**
 * Environment configuration validator for 2ndlook v0.1
 * Checks required environment variables for AI/orchestrator features
 */

export interface EnvironmentConfig {
  openai: {
    apiKey: string;
    isConfigured: boolean;
  };
}

/**
 * Validate and return environment configuration
 * Throws clear errors if required variables are missing
 */
export function validateEnvironment(): EnvironmentConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. " +
        "Add it to your .env.local file to enable AI snapshot generation. " +
        "Get your API key at: https://platform.openai.com/api-keys",
    );
  }

  return {
    openai: {
      apiKey: openaiApiKey,
      isConfigured: true,
    },
  };
}

/**
 * Check if OpenAI is configured (non-throwing)
 * Useful for conditional feature enablement
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Get safe environment info for logging (never logs secrets)
 */
export function getEnvironmentInfo() {
  return {
    openai: {
      configured: isOpenAIConfigured(),
      keyPrefix: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.slice(0, 7)}...` : "not set",
    },
    nodeEnv: process.env.NODE_ENV || "development",
  };
}
