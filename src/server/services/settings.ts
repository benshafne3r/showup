import "server-only";

import { serviceDb } from "@/server/db/service";

export type PlatformSettings = {
  depositPercentageTemplates: number[];
  acceptanceWindowHours: number;
  authorizationWindowDays: number;
  paymentMethodGraceDays: number;
  contentDeadlineDefaultDays: number;
};

const DEFAULTS: PlatformSettings = {
  depositPercentageTemplates: [25, 50, 75, 100],
  acceptanceWindowHours: 24,
  authorizationWindowDays: 5,
  paymentMethodGraceDays: 3,
  contentDeadlineDefaultDays: 7,
};

const KEY_MAP: Record<keyof PlatformSettings, string> = {
  depositPercentageTemplates: "deposit_percentage_templates",
  acceptanceWindowHours: "acceptance_window_hours",
  authorizationWindowDays: "authorization_window_days",
  paymentMethodGraceDays: "payment_method_grace_days",
  contentDeadlineDefaultDays: "content_deadline_default_days",
};

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const { data } = await serviceDb().from("platform_settings").select("key, value");
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  const read = <K extends keyof PlatformSettings>(k: K): PlatformSettings[K] => {
    const raw = byKey.get(KEY_MAP[k]);
    return (raw ?? DEFAULTS[k]) as PlatformSettings[K];
  };
  return {
    depositPercentageTemplates: read("depositPercentageTemplates"),
    acceptanceWindowHours: read("acceptanceWindowHours"),
    authorizationWindowDays: read("authorizationWindowDays"),
    paymentMethodGraceDays: read("paymentMethodGraceDays"),
    contentDeadlineDefaultDays: read("contentDeadlineDefaultDays"),
  };
}

export async function updatePlatformSetting(
  key: keyof PlatformSettings,
  value: PlatformSettings[typeof key],
  updatedBy: string,
): Promise<void> {
  const { error } = await serviceDb()
    .from("platform_settings")
    .upsert({ key: KEY_MAP[key], value: value as never, updated_by: updatedBy });
  if (error) throw new Error(`Failed to update setting ${key}: ${error.message}`);
}
