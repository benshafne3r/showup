import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  pngFixture,
  signIn,
  signOut,
  todayDeadlineLocal,
  todayISO,
} from "./helpers";

/**
 * The full marketplace loop (Definition of Done criteria 1–12):
 * label creates artist + show + opportunity → creator requests → label
 * approves → creator accepts with a verified card (mock provider) → hold is
 * placed → creator checks in → label verifies attendance (hold released) →
 * creator submits content → label approves (payment released) → both sides
 * see history.
 */

const runId = Date.now().toString(36);
const ARTIST = `E2E Band ${runId}`;

test.describe.configure({ mode: "serial" });

test("label creates an artist (via a tour) and a show with an opportunity", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);

  // Tours-first: create the artist inline while creating their tour.
  await page.goto("/label/tours");
  await page.getByRole("button", { name: "Create" }).first().click();
  await page.getByRole("tab", { name: "New artist" }).click();
  await page.getByLabel("Name", { exact: true }).fill(ARTIST);
  await page.getByLabel("Genre").fill("Synthwave");
  await page.getByLabel("Tour name").fill(`E2E Tour ${runId}`);
  await page.getByRole("button", { name: "Create tour" }).click();
  // The dialog stays open and shows a success message; the artist now exists.
  await expect(page.getByText("Tour saved")).toBeVisible();

  // Create the show (dated today so check-in opens immediately). The show
  // form's artist picker is #show-artist (the page also has an import panel).
  await page.goto("/label/shows/new");
  await page.locator("#show-artist").click();
  await page.getByRole("option", { name: ARTIST }).click();
  await page.getByLabel("Venue name").fill(`E2E Hall ${runId}`);
  await page.getByLabel("City", { exact: true }).fill("Austin");
  await page.getByLabel("Date").fill(todayISO());
  await page.getByLabel("Stated ticket value (USD, per ticket)").fill("80");
  await page.getByLabel("Tickets available to creators").fill("4");
  await page.getByRole("radio", { name: "50%" }).click();
  await page.getByLabel("Creator payment (USD, 0 = attend-only)").fill("50");
  await page.getByLabel("Application deadline").fill(todayDeadlineLocal());
  await page.getByRole("button", { name: "Publish show" }).click();

  await expect(page).toHaveURL(/\/label\/shows\/[0-9a-f-]+\?saved=1/);
  await expect(page.getByText("Show saved.")).toBeVisible();
  await signOut(page);
});

test("creator discovers the show and requests a ticket", async ({ page }) => {
  await signIn(page, ACCOUNTS.leo);
  await expect(page).toHaveURL(/\/creator/);

  // Search for the freshly published show and wait for the debounced
  // router navigation to settle before clicking the card.
  await page.getByPlaceholder("Search artist, venue, or city…").fill(ARTIST);
  await page.waitForURL(/q=E2E/);
  const card = page.getByRole("link", { name: new RegExp(ARTIST) });
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(/\/creator\/shows\//);

  // Show detail: economics must be visible before requesting.
  await expect(page.getByText("Stated ticket value")).toBeVisible();
  await expect(page.getByText("$80.00", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Temporary hold", { exact: true })).toBeVisible();
  await expect(page.getByText("$40.00").first()).toBeVisible(); // 80 × 1 × 50%

  await page.getByRole("button", { name: "Request free ticket" }).click();
  await page.getByLabel("Message or content idea (optional)").fill("E2E: recap reel within 48h.");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect(page).toHaveURL(/\/creator\/messages\?tab=requests&submitted=1/);
  await expect(page.getByText("Request sent!")).toBeVisible();
  await signOut(page);
});

test("label approves the request", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/messages?tab=requests");
  await page.getByRole("link", { name: new RegExp(`Leo Martins.*${ARTIST}`) }).click();

  await expect(page.getByText("Terms if approved")).toBeVisible();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  // The page revalidates on success: the decision panel unmounts and the
  // request now shows the Approved status badge.
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  await signOut(page);
});

test("creator accepts within 24h: card verified, terms agreed, booking confirmed", async ({ page }) => {
  await signIn(page, ACCOUNTS.leo);
  await page.goto("/creator/bookings");
  await page.getByRole("link", { name: new RegExp(ARTIST) }).first().click();

  // Final terms are shown again before acceptance.
  await expect(page.getByText("Ticket & hold details", { exact: true })).toBeVisible();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await expect(page.getByText(/\d+ (hours?|minutes?) left/)).toBeVisible();

  // Step 2: verify a card (mock provider, 4242 always verifies).
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel("Exp. month").fill("12");
  await page.getByLabel("Exp. year").fill("2030");
  await page.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: "Verify & save card" }).click();
  await expect(page.getByText(/verified ✓/)).toBeVisible();

  // Step 3: explicit consent to the hold terms.
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm my booking" }).click();

  await expect(page).toHaveURL(/confirmed=1/);
  await expect(page.getByText("Booking confirmed!")).toBeVisible();
  // Show is today → the hold is placed immediately.
  await expect(page.getByText("Hold active")).toBeVisible();
  await signOut(page);
});

test("creator checks in with attendance proof", async ({ page }) => {
  await signIn(page, ACCOUNTS.leo);
  await page.goto("/creator/bookings");
  await page.getByRole("link", { name: new RegExp(ARTIST) }).first().click();

  await page.getByLabel(/Photo proof/).setInputFiles(pngFixture());
  await page.getByRole("button", { name: "Check in now" }).click();
  // On success the page revalidates into the "submitted" state.
  await expect(page.getByText(/Proof submitted/).first()).toBeVisible();
  await signOut(page);
});

test("label verifies attendance, releasing the hold", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/attendance");
  await page.getByRole("link", { name: /Leo Martins/ }).first().click();

  await page.getByRole("button", { name: "Verify attendance & release hold" }).click();
  // Revalidated page: attendance badge approved + hold badge released.
  await expect(page.getByText("Attendance verified").first()).toBeVisible();
  await expect(page.getByText("Hold released").first()).toBeVisible();
  await signOut(page);
});

test("creator submits the content deliverable", async ({ page }) => {
  await signIn(page, ACCOUNTS.leo);
  await page.goto("/creator/bookings");
  await page.getByRole("link", { name: new RegExp(ARTIST) }).first().click();

  // Hold must be released; attendance verified.
  await expect(page.getByText("Attendance verified", { exact: false }).first()).toBeVisible();

  await page.getByLabel("Post URL").fill("https://www.tiktok.com/@leo/video/1234567890");
  await page.getByRole("button", { name: "Submit for review" }).click();
  // Revalidated page: submission listed with the submitted badge.
  await expect(page.getByText("Content submitted").first()).toBeVisible();
  await signOut(page);
});

test("label approves content and the creator payment is released", async ({ page }) => {
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/content");
  await page.getByRole("link", { name: /Leo Martins/ }).first().click();

  await page.getByRole("button", { name: /Approve & pay \$50/ }).click();
  // Revalidated page: content approved + payment paid badges.
  await expect(page.getByText("Content approved").first()).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await signOut(page);
});

test("both sides see the completed history and payments", async ({ page }) => {
  // Creator: paid + hold released in payment history.
  await signIn(page, ACCOUNTS.leo);
  await page.goto("/creator/payments");
  await expect(page.getByText(/Total earned so far: \$\d/)).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Hold released").first()).toBeVisible();

  // Booking shows the full activity timeline.
  await page.goto("/creator/bookings");
  await expect(page.getByText("Completed").first()).toBeVisible();
  await signOut(page);

  // Label: spend shows the payment.
  await signIn(page, ACCOUNTS.labelOwner);
  await page.goto("/label/payments");
  await expect(page.getByText("Creator payments made")).toBeVisible();
  await expect(page.getByText("Leo Martins · $50.00")).toBeVisible();
  await signOut(page);
});
