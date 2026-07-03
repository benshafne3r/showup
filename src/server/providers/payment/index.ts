import "server-only";

import { serverEnv } from "@/lib/env";
import type { PaymentProvider } from "./types";
import { MockPaymentProvider } from "./mock";
import { StripePaymentProvider } from "./stripe";

let cached: PaymentProvider | null = null;

/** Env-selected payment provider. Defaults to the mock (no real money). */
export function paymentProvider(): PaymentProvider {
  if (!cached) {
    cached =
      serverEnv.paymentProvider === "stripe"
        ? new StripePaymentProvider()
        : new MockPaymentProvider();
  }
  return cached;
}

export type { PaymentProvider } from "./types";
