# Phase 5 — Offline sales, printing, and Android builds

## Offline sales synchronization

`lib/offlineSync.ts` exposes `queueOfflineTransaction`, which writes a sale to
the Android SQLite database before attempting a network sync. Each record has
an idempotency ID, `synced = 0`, and the signed-in cashier ID. The root app
starts a NetInfo listener; on reconnect or sign-in it syncs pending sales and
the existing inventory outbox. Failed sales remain local with their last error
and can be retried on the next sync.

The sale RPC also consumes packaged-product batches using the Phase 3 FEFO
function. If unexpired stock is no longer available when an offline sale syncs,
that sale remains unsynced and reports an error; resolve the stock discrepancy
before retrying it.

Apply migrations in order in **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/202611060001_initial_schema.sql`
2. `supabase/migrations/202611130001_procurement_fmcg_expiry.sql`
3. `supabase/migrations/202611130002_offline_sales_sync.sql`

The third migration adds an idempotency key and the atomic
`sync_offline_transaction` RPC. It requires the Phase 3 FEFO RPC. Do not mark
an offline sale as complete in the UI until `queueOfflineTransaction` returns;
that return confirms the durable local insert. A false `synced` value means
the sale is saved on the tablet but still awaits server confirmation.

`stores/cartStore.ts` also exposes a checkout helper. It inserts the current
cart into SQLite first, then clears the cart only after that local insert
succeeds:

```ts
import { checkoutCurrentCartOffline } from "../stores/cartStore";

const saved = await checkoutCurrentCartOffline("SILENT");

// Keep the receipt/cart available for retry or reprint if saved.synced is false.
```

For split tenders, pass the breakdown as the second argument; its amounts must
sum to the sale total:

```ts
const saved = await checkoutCurrentCartOffline("BILL_ONLY", [
  { payment_mode: "CASH", amount: 100 },
  { payment_mode: "UPI", amount: 140 },
]);
```

Use the authenticated POS user on the device. Local sales are isolated by
cashier ID and are sent with the same stable operation ID on each retry. Do not
clear the cart before the local queue insert succeeds.

## Direct Bluetooth thermal printing

The Android Bluetooth bridge is `react-native-thermal-pos-printer`; it sends
ESC/POS bytes directly and does not open Android's print dialog. It requires a
new custom development or preview APK; it is not available in Expo Go.

1. Pair the ESC/POS Bluetooth printer in **Android Settings → Bluetooth**.
2. Install a new APK after adding the printer module. On the first use, allow
   the app's Bluetooth permission. On Android 12 and newer (including Android
   14+), the app requests `BLUETOOTH_CONNECT` at runtime.
3. Call the helper methods from `lib/thermalPrinter.ts`:

```ts
import {
  connectThermalPrinter,
  getPairedThermalPrinters,
  printEscPosBytes,
} from "../lib/thermalPrinter";

const devices = await getPairedThermalPrinters();
const printer = devices[0];
if (!printer) throw new Error("Pair a printer in Android Settings first.");

await connectThermalPrinter(printer.address);
await printEscPosBytes(
  new Uint8Array([
    0x1b, 0x40, // Initialize ESC/POS
    ...Array.from("BABA JI MISTHAN BHANDAR\nTest receipt\n\n", (char) =>
      char.charCodeAt(0),
    ),
    0x1d, 0x56, 0x00, // Cut paper (if supported)
  ]),
);
```

The code is model-independent, but the printer must support **Bluetooth
Classic SPP/RFCOMM and ESC/POS**. For a purchase, choose a reputable 58mm or
80mm thermal model whose exact regional SKU explicitly lists those protocols;
avoid BLE-only models and vendor-specific mobile-app-only models. Pairing and
printing cannot be hardware-tested until a physical printer is available.

**USB OTG is not enabled by this bridge.** The installed library's Android
implementation currently rejects USB connections, despite USB being listed in
its package description. A USB printer needs an Android USB-host transport
that supports that printer's interface and permission flow. Confirm the
printer's make/model and whether it uses USB bulk printer-class or USB-serial
before selecting a bridge; do not assume any USB cable will work. The app does
not silently fall back to Android's print dialog.

## EAS Cloud Build and tablet installation

The EAS project ID is configured in `app.json`; no local Android Studio install
is needed. EAS builds the native APK in the cloud. The `preview` profile creates
a standalone internal APK (no Metro server needed). The `development` profile
creates a development-client APK that does require Metro while developing.

1. From this project directory, sign in and ensure the project is configured:

   ```sh
   cd "/Users/hiku/Documents/Babajee Misthan bhandar/babajee-erp"
   npx eas-cli@latest login
   npx eas-cli@latest build:configure
   ```

2. In Expo Dashboard → this project → **Environment variables**, add
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the
   **preview**, **development**, and **production** environments. These are
   public client credentials; never add a Supabase `service_role` or secret key.
3. Build the standalone APK:

   ```sh
   npx eas-cli@latest build --platform android --profile preview
   ```

   EAS prints a build page and build ID when the job is queued and again when
   it completes. Download the `.apk` from that page, or fetch it from the
   terminal by replacing `BUILD_ID` with the ID EAS printed:

   ```sh
   npx eas-cli@latest build:download --build-id BUILD_ID
   ```
4. On the tablet, allow **Install unknown apps** for the browser or file manager
   used to download the APK, then open the downloaded file and install
   **Babajee ERP**. This standalone preview build does not need your computer or
   an Expo server running.
5. To install a development-client APK instead:

   ```sh
   npx eas-cli@latest build --platform android --profile development
   ```

   Install it with the same link, then start the Metro server on your computer:

   ```sh
   npx expo start --dev-client
   ```

   Keep the tablet and computer on the same Wi-Fi and open the development
   client. The development build is for coding and debugging; use the `preview`
   build for normal standalone testing.

If Android platform-tools (`adb`) are already installed, you can install a
downloaded APK over USB without Android Studio:

```sh
adb install -r "/path/to/the-downloaded.apk"
```
