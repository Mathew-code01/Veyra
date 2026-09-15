// ============================================================================
// FILE: core/cloud/configuration/CloudEnvironment.ts
// ============================================================================

export type CloudEnvironment =
  "development" | "test" | "staging" | "production";

export function resolveCloudEnvironment(
  value: string | undefined,
): CloudEnvironment {
  switch (value?.trim().toLowerCase()) {
    case "production":
    case "prod":
      return "production";

    case "staging":
    case "stage":
      return "staging";

    case "test":
    case "testing":
      return "test";

    case "development":
    case "dev":
    default:
      return "development";
  }
}
