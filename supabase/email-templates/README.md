# Supabase auth email templates

Branded HTML for Supabase Auth (GoTrue) emails, matching the app's notification
email design (`src/server/providers/email/template.ts`). Supabase auth templates
live in the dashboard, not in code — these files are the source of truth to paste in.

## How to apply (prod project `mpcjunweelepgcglolvx`)

1. Dashboard → **Authentication → Emails → Templates**:
   https://supabase.com/dashboard/project/mpcjunweelepgcglolvx/auth/templates
2. For each template below, set the **Subject** and paste the matching `.html`
   file's contents into the **Message body** (source/HTML view), then **Save**.

| Template          | Subject                        | File                   |
| ----------------- | ------------------------------ | ---------------------- |
| Reset Password    | `Reset your ShowUp password`   | `reset-password.html`  |
| Confirm signup    | `Confirm your ShowUp email`    | `confirm-signup.html`  |

The Magic Link, Invite, Change Email, and Reauthentication templates can reuse
`confirm-signup.html` (swap the heading/subject) if you enable those flows — the
app currently uses password auth + reset, so only the two above matter.

## Notes

- The button + fallback link both use `{{ .ConfirmationURL }}`, which respects
  the **Site URL** + **Redirect URLs** allowlist (must include
  `https://app.showuptickets.com/**`).
- Requires Custom SMTP (Resend) to be configured on the same project.
- Keep the `#F23645` red and the 🎟 wordmark in sync with the in-app template.
