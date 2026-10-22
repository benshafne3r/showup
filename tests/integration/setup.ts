import { config } from "dotenv";

config({ path: ".env.local" });
if (process.env.PAYMENT_PROVIDER !== "mock") {
  throw new Error("Integration tests need PAYMENT_PROVIDER=mock in .env.local");
}
// The mock provider posts webhooks to the app; point them nowhere so a dev
// server that happens to be running can't race these tests.
process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:9";
