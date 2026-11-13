# Phase 4 — Owner insights and administration

## What is included

- Owner-only daily cash/UPI/Udhaar totals, cash drawer reconciliation, and
  today's material/fuel purchases and recorded operating costs.
- Daily net margin: **gross counter sales − raw-material purchases − fuel
  consumed − wastage/spoilage − daily overheads**. Fuel purchases are displayed
  separately as a reference and are not subtracted again as fuel consumed.
- Date and user filters for audit records with action, table, time, actor, and
  captured old/new values.
- Manager and Billing Staff account creation through an authenticated
  Supabase Edge Function. The function checks the caller's active OWNER profile
  and uses a server-side service key; no service-role key is shipped to the app.

The owner screens are `app/(admin)/closing.tsx`,
`app/(admin)/analytics.tsx`, `app/(admin)/audit.tsx`, and
`app/(admin)/users.tsx`. Owner sign-ins open the closing register. Inventory
users see an Owner Insights link only if their active profile role is OWNER;
the screen and database endpoints also enforce owner access.

## Supabase setup required

You already applied the Phase 1, Phase 3, and Phase 5 SQL migrations. Apply this
Phase 4 migration **once** in Supabase Dashboard → **SQL Editor**:

1. Open `supabase/migrations/202611140001_owner_insights.sql`.
2. Copy the full file into a new SQL Editor query and run it.
3. Confirm it completes successfully. It adds daily closing/operating-cost
   tables, owner-only summary and write RPCs, and audit triggers for profiles,
   procurement, batches, returns, costs, and closing records.

Deploy user provisioning from this project directory:

```sh
cd "/Users/hiku/Documents/Babajee Misthan bhandar/babajee-erp"
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy admin-create-user
```

Supabase Edge Functions provide `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to the function runtime. If the service key is not
present in the project's Edge Function secrets, add it privately in Supabase
Dashboard → **Edge Functions → Secrets** (or with `npx supabase secrets set`).
Never put that key in `.env`, an Expo `EXPO_PUBLIC_` variable, source control,
or the Android build.

After deployment, sign in with an active OWNER and open **User management**.
The owner can create Managers and Billing Staff with an email and initial
password of at least 12 characters. Public Auth sign-up remains disabled; share
the initial password with each staff member securely and have them change it
through your approved account process.

## Reporting assumptions

- Business dates use India Standard Time (`Asia/Kolkata`).
- Cash expected in the drawer is the Cash tender portion of completed sales;
  for split sales it comes from `transaction_payments`.
- Udhaar is shown as credit sales; it is not included in cash/UPI collections.
- `material_procurements` entries with group DAIRY/GROCERY count as
  raw-material purchases. Fuel procurement is displayed separately. Fuel
  consumed, spoilage/wastage, and overheads must be entered as operating costs
  in Daily Closing to appear in the P&L. Inventory quantity alone does not
  calculate consumed fuel cost.
- Existing audit logs from Phase 1 cover product and raw-material changes.
  Phase 4 adds audit records for procurement, batch, return, closing, operating
  cost, profile changes, and new accounts created through the Owner screen.
- User creation spans Supabase Auth and Postgres, which do not share one
  transaction. The function compensates by deleting the newly created Auth
  user/profile if profile or audit setup fails; check function logs if a
  rollback itself reports an error.

## Current Phase 5 follow-ups

- Phase 5's offline sales table/RPC is ready after its migration, but no POS
  billing screen exists in this project yet. Add the sale UI and call
  `checkoutCurrentCartOffline` before considering offline checkout fully
  exercised.
- No physical thermal printer is available yet, so Bluetooth Classic printing
  has not been hardware-tested. USB OTG is not enabled.
- An EAS standalone preview APK still needs to be built and installed on the
  tablet; see `PHASE5_OFFLINE_AND_BUILDS.md`.
