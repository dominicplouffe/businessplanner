/* Types for `deploy-config.mjs`.
 *
 * The module is `.mjs` because `scripts/deploy.mjs` runs it directly with no
 * build step, and `tsconfig.json` sets `allowJs: false`. This file is what lets
 * `tests/deploy.test.ts` import it under `strict`. */

export declare const SECRET_KEYS: readonly string[];
export declare const OPTIONAL_SECRET_KEYS: readonly string[];
export declare const PERSISTED_KEYS: readonly string[];
export declare const WEBHOOK_PLACEHOLDER: string;

export declare function isWebhookPlaceholder(value: string): boolean;
export declare function generateAuthSecret(): string;
export declare function validateSecretValue(key: string, value: unknown): string | null;
export declare function buildSecretString(values: Record<string, string>): string;
export declare function answersToPersist(answers: Record<string, unknown>): Record<string, unknown>;
export declare function answersFromDisk(raw: unknown): Record<string, unknown>;
export declare function answersAfterTeardown(answers: Record<string, unknown>): Record<string, unknown>;
export declare function finalSnapshotId(now?: Date): string;

export type StackAction = "create" | "update" | "recreate" | "wait" | "manual";
export declare function stackAction(status: string | undefined | null): StackAction;

export interface RdsConfig {
  logicalId: string;
  engine: string;
  engineVersion: string;
  instanceClass: string;
  multiAz: boolean;
  performanceInsights: boolean;
}
export declare function readRdsConfig(template: unknown): RdsConfig | null;

export interface OrderableProblem {
  what: string;
  why: string;
  fix: string;
}
export declare function matchesEngineVersion(configured: string, offered: unknown): boolean;
export declare function checkOrderable(
  config: RdsConfig,
  options: unknown,
): OrderableProblem[];
