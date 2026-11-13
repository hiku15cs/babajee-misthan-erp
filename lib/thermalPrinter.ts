import { PermissionsAndroid, Platform } from "react-native";
import type { ThermalPrinterDevice } from "react-native-thermal-pos-printer";

type PrinterBridge = typeof import("react-native-thermal-pos-printer").default;
export type ThermalPrinterConnection = "BLUETOOTH";

async function getPrinterBridge(): Promise<PrinterBridge> {
  if (Platform.OS !== "android") {
    throw new Error("Direct thermal printing is currently supported on Android only.");
  }

  try {
    return (await import("react-native-thermal-pos-printer")).default;
  } catch (error) {
    throw new Error(
      `The thermal printer native module is not installed in this app build. Install a new EAS development or preview APK. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function requestBluetoothConnectPermission(): Promise<void> {
  if (Number(Platform.Version) < 31) return;

  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (!permission) {
    throw new Error("This Android runtime does not expose Bluetooth connect permission.");
  }
  const result = await PermissionsAndroid.request(permission, {
    title: "Connect to receipt printer",
    message: "Babajee ERP needs Bluetooth access to print receipts directly.",
    buttonPositive: "Allow",
    buttonNegative: "Cancel",
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error("Bluetooth permission was denied. Allow it in Android app settings to print.");
  }
}

export async function getPairedThermalPrinters(): Promise<ThermalPrinterDevice[]> {
  await requestBluetoothConnectPermission();
  const printer = await getPrinterBridge();
  await printer.init();
  return printer.getDeviceList();
}

export async function connectThermalPrinter(
  address: string,
  connection: ThermalPrinterConnection = "BLUETOOTH",
): Promise<void> {
  if (!address.trim()) throw new Error("Select a paired printer first.");
  if (connection !== "BLUETOOTH") {
    throw new Error("This printer bridge currently supports paired Bluetooth printers only.");
  }
  await requestBluetoothConnectPermission();
  const printer = await getPrinterBridge();
  await printer.init();
  await printer.connectPrinter(address, { type: connection, timeout: 10000 });
}

export async function printEscPosBytes(bytes: Uint8Array): Promise<void> {
  if (!bytes.length) throw new Error("There are no receipt bytes to print.");
  const printer = await getPrinterBridge();
  if (!(await printer.isConnected())) {
    throw new Error("Connect a thermal printer before printing.");
  }
  await printer.sendRawCommand(Array.from(bytes));
}

export async function disconnectThermalPrinter(): Promise<void> {
  const printer = await getPrinterBridge();
  if (await printer.isConnected()) await printer.disconnectPrinter();
}
