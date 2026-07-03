/**
 * Typed environment access. Client-safe values are prefixed NEXT_PUBLIC_;
 * everything else must only be read from server code.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
};

export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get paymentProvider(): "mock" | "stripe" {
    return process.env.PAYMENT_PROVIDER === "stripe" ? "stripe" : "mock";
  },
  get mockWebhookSecret() {
    return process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret-dev";
  },
  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY ?? "";
  },
  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET ?? "";
  },
  get emailProvider(): "console" | "resend" {
    return process.env.EMAIL_PROVIDER === "resend" ? "resend" : "console";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "ShowUp <notifications@example.com>";
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
};
