# Babajee Misthan Bhandar ERP — Phase 1 Setup

The app source and configuration for this phase are in this directory. The
business workflow remains documented in the workspace-level
`babajee_misthan_bhandar_complete_system_guide.md`.

## What this phase includes

- Expo + TypeScript starter configuration, NativeWind/Tailwind brand tokens,
  and the provided logo at `assets/logo.png`.
- English, Hindi, and Hinglish POS dictionaries with SecureStore-persisted
  language selection.
- Supabase client with SecureStore-backed auth sessions.
- Initial Supabase schema, role-based RLS, inventory audit triggers, and a
  safe workflow to assign the two owner accounts.

Offline transaction queue/synchronization and inventory behavior are not
implemented in this foundation phase.

## Initialize a fresh Expo project

To reproduce the project from scratch in a new directory:

```sh
npx create-expo-app@latest babajee-erp --template blank-typescript@sdk-58
cd babajee-erp
npm install nativewind@5.0.0-rc.0 react-native-css@3.1.0-rc.0 tailwindcss@^4 @tailwindcss/postcss postcss @supabase/supabase-js i18next react-i18next react-native-url-polyfill
npx expo install expo-dev-client expo-secure-store expo-status-bar expo-system-ui react-native-reanimated react-native-worklets react-native-safe-area-context
npx expo install expo-router expo-sqlite expo-network expo-crypto react-native-web
npm install zustand
npm pkg set overrides.lightningcss=1.29.2
```

Then copy the contents of the delivered `babajee-erp/` directory into the new
project (allowing its configuration and source files to replace the generated
starter files), and copy `B/8.png` to `assets/logo.png`. In this workspace, the
project has already been created and the logo copied, so do not run the
`create-expo-app` command over this existing directory. To install and run the
delivered project (or reconcile dependencies after copying the files):

```sh
cd "/Users/hiku/Documents/Babajee Misthan bhandar/babajee-erp"
npm install
cp -n .env.example .env
# Edit .env and set the two project values described below.
npx expo start
```

The `@supabase/supabase-js` package includes the required React Native auth
support. The URL polyfill is imported by `App.tsx`. NativeWind 5 is currently
an RC; these files pair `nativewind@5.0.0-rc.0` with
`react-native-css@3.1.0-rc.0` and Tailwind CSS 4 on Expo SDK 58. NativeWind
currently documents SDK 57 as its tested target, although this project’s SDK 58
Android and web bundles are validated locally. Check the [NativeWind v5
installation guide](https://www.nativewind.dev/v5/getting-started/installation)
before upgrading those versions. The Lightning CSS override is required to
avoid CSS deserialization errors documented by NativeWind. NativeWind v4 is
stable but uses Tailwind CSS 3, not Tailwind CSS 4.

The Tailwind configuration is `tailwind.config.js`; the colors are available
as utilities such as `bg-brand-crimson`, `bg-surface-light`,
`dark:bg-surface-dark`, and `dark-media:bg-surface-dark`. `dark:` is the
explicit class-based variant; `dark-media:` follows the system
`prefers-color-scheme`. Expo is configured for automatic system appearance.

## Create and configure a Supabase project

1. Create a project in the [Supabase Dashboard](https://supabase.com/dashboard)
   and choose a region appropriate for the shop. Keep the database password in
   a password manager.
2. In **Project Settings → API**, copy the Project URL and the public
   **publishable** key (or legacy `anon` key). Put them in `babajee-erp/.env`:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

   These `EXPO_PUBLIC_` values are shipped in the app. Never put a
   `service_role` or secret key in the app, source control, or an `EXPO_PUBLIC_`
   variable.
3. Open **SQL Editor → New query**. Open
   `supabase/migrations/202611060001_initial_schema.sql`, paste its complete
   contents into the editor, and click **Run**. Confirm that the enums, tables,
   indexes, triggers, and policies completed without an error. This creates
   `profiles`, `products`, `product_batches`, `raw_materials`, `transactions`,
   `transaction_items`, `transaction_payments`, and `audit_logs`. The extra
   `transaction_payments` table records split Cash/UPI/Credit payments.
4. In **Authentication → Providers**, keep Email enabled. Disable public
   sign-ups; this is a staff-only system. Create the two owner users from
   **Authentication → Users → Add user**. Enter each brother's actual name,
   email, and a unique strong password, and mark the email confirmed if
   appropriate for your internal account policy.
5. Open `supabase/seeds/seed_owner_profiles.sql`. Replace both example emails
   and names, then run it in **SQL Editor**. It assigns `OWNER` roles to the
   matching Auth users and fails if both users were not found.

Supabase Auth stores password hashes itself when users are created; this is the
safe way to seed password-based accounts. Do not insert directly into
`auth.users`, paste plaintext passwords into SQL, or hand-edit
`encrypted_password`. The SQL seed creates/updates the two public owner
profiles; Supabase Auth creates and hashes the credentials.

### Optional Supabase CLI migration workflow

For ongoing schema changes, install/use the Supabase CLI and link this project:

```sh
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

The dashboard SQL Editor flow above works without Docker or the CLI. Do not
apply the initial migration a second time after it has already run in that
project.

## Run and verify the app

After `.env` has real values:

```sh
npm install
npm run typecheck
npx expo start
```

Build and launch a development client for Android before testing native
SecureStore or other native modules on a physical tablet/phone:

```sh
npx expo run:android
npx expo start --dev-client
```

A normal Expo Go install may not include the project's required native module
versions.

## Install a custom development build on an Android phone

This project includes `expo-dev-client` and `eas.json` with an installable
Android APK development profile. An Expo account is required for the EAS cloud
build.

1. In `babajee-erp/.env`, make sure `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set. These are public client values, not
   a service-role key.
2. Log in to EAS and link this app to your Expo account:

   ```sh
   cd "/Users/hiku/Documents/Babajee Misthan bhandar/babajee-erp"
   npx eas-cli@latest login
   npx eas-cli@latest build:configure
   ```

   Follow the prompts to create/select the EAS project. If asked, use the
   existing Expo app configuration and Android package
   `com.babajeemishthanbhandar.erp`.
3. In the Expo dashboard for the linked project, open **Environment
   variables** and add these names with the same values as `.env`, under the
   **development** environment:

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

   The build machine cannot read your local `.env` file. Never add a
   `service_role` or secret key here as a public app variable.
4. Build the Android development APK:

   ```sh
   npx eas-cli@latest build --platform android --profile development
   ```

   When the build completes, open its install link on your Android phone and
   install the APK. Android may ask you to permit installing apps from the
   browser used to download it.
5. On your computer, start Metro:

   ```sh
   npx expo start --dev-client
   ```

   Open the installed **Babajee ERP** development app and scan the terminal or
   browser QR code. Keep the phone and computer on the same Wi-Fi.

The development build installs the current app version. A standalone preview
APK can be built without starting Metro; see
[`PHASE5_OFFLINE_AND_BUILDS.md`](./PHASE5_OFFLINE_AND_BUILDS.md) for the cloud
build and tablet-install steps.

## Important security and operational notes

- Authenticated app users may read active products. Only Owners and Managers
  can edit products and raw materials. Billing staff may create sales and see
  their own transactions. Owners can see all sales and the audit log.
- Product and raw-material row changes are logged with `auth.uid()` and the
  profile name captured at the time of the change. Operations from SQL Editor
  have no signed-in user and are recorded as `System / unknown user`.
- The initial migration provides the base tables and row-level access rules.
  Later migrations add expiry-aware stock deduction and offline sales sync.
  The sales queue requires the Phase 3 migration before the Phase 5 migration.

  ## Phase 3 inventory screens and migration

  Phase 3 adds the Expo Router inventory routes:

  - `app/(inventory)/procurement.tsx` — dairy, grocery, and fuel receiving with
    quantity × unit-rate totals and purchase-rate history.
  - `app/(inventory)/fmcg-batches.tsx` — barcode input, product/batch data,
    manufacturing and expiry dates, MRP, purchase rate, and quantity.
  - `app/(inventory)/expiry-watchlist.tsx` — expiry status dashboard and
    quantity-controlled vendor returns.

  Apply `supabase/migrations/202611130001_procurement_fmcg_expiry.sql` in the
  Supabase SQL Editor after the initial schema migration. It adds procurement
  history, FMCG batch fields, vendor-return history, role-checked/idempotent
  inventory RPCs, and the server-side FEFO stock-consumption function. Inventory
  writes are stored first in an Expo SQLite outbox (browser testing uses browser
  storage) and sync when a network is available. If an RPC is rejected, the item
  remains queued and the screen shows the sync error; fix the account/permission
  issue before retrying.

Owners and Managers can sign in to use these inventory screens. The two
existing owner accounts work with the app login. Barcode scanners that act as
a keyboard and send Enter can fill the barcode field. FEFO allocation helpers
in `stores/cartStore.ts` filter expired stock and allocate soonest-expiring
batches first. The atomic sale sync RPC is available in
`supabase/migrations/202611130002_offline_sales_sync.sql`; a POS checkout still
needs to call `queueOfflineTransaction` from `lib/offlineSync.ts` to use it.

## Phase 5 offline sales and APK builds

See [`PHASE5_OFFLINE_AND_BUILDS.md`](./PHASE5_OFFLINE_AND_BUILDS.md) for the
sales queue contract, migration order, direct Bluetooth printer helper, EAS
preview/development profiles, and tablet installation instructions. The
current direct thermal printer bridge supports paired Bluetooth printers;
USB OTG requires a compatible native printer transport.
