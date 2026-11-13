import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

import { InventoryHeader } from "../../components/InventoryHeader";
import { queueInventoryOperation } from "../../lib/inventoryOutbox";
import { supabase } from "../../lib/supabase";

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default function PackagedGoodsStockInScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [mrp, setMrp] = useState("");
  const [purchaseRate, setPurchaseRate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function lookupBarcode(value: string) {
    const normalized = value.trim();
    if (!normalized) return;
    setLookingUp(true);
    setError("");
    const { data, error: lookupError } = await supabase
      .from("products")
      .select("name,price_per_unit")
      .eq("barcode", normalized)
      .eq("product_type", "PACKAGED_GOOD")
      .maybeSingle();
    setLookingUp(false);

    if (lookupError) {
      setError(lookupError.message);
    } else if (data) {
      setName(data.name);
      setMrp(String(data.price_per_unit));
      setMessage(t("inventory.barcodeFound"));
    } else {
      setMessage(t("inventory.newBarcode"));
    }
  }

  async function saveBatch() {
    const mrpValue = Number(mrp);
    const rateValue = Number(purchaseRate);
    const quantityValue = Number(quantity);

    if (!name.trim() || !batchNumber.trim()) {
      setError(t("inventory.nameAndBatchRequired"));
      return;
    }
    if (
      !isDate(manufactureDate) ||
      !isDate(expiryDate) ||
      manufactureDate > expiryDate
    ) {
      setError(t("inventory.invalidDates"));
      return;
    }
    if (
      !Number.isFinite(mrpValue) ||
      mrpValue < 0 ||
      !Number.isFinite(rateValue) ||
      rateValue < 0 ||
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0
    ) {
      setError(t("inventory.invalidStockNumbers"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await queueInventoryOperation("receive_packaged_batch", {
        p_name: name.trim(),
        p_barcode: barcode.trim() || null,
        p_batch_number: batchNumber.trim(),
        p_manufacture_date: manufactureDate,
        p_expiry_date: expiryDate,
        p_mrp: mrpValue,
        p_purchase_rate: rateValue,
        p_quantity: quantityValue,
        p_supplier_name: supplier.trim() || null,
      });

      setBatchNumber("");
      setManufactureDate("");
      setExpiryDate("");
      setMrp("");
      setPurchaseRate("");
      setQuantity("");
      setSupplier("");
      setMessage(
        result.status === "synced"
          ? t("inventory.batchSaved")
          : result.syncError
            ? `${t("inventory.savedLocallySyncError")} ${result.syncError}`
            : t("inventory.savedLocallyPending"),
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <InventoryHeader />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>{t("inventory.stockInTitle")}</Text>
        <Text style={styles.description}>{t("inventory.stockInDescription")}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("inventory.packagedGoods")}</Text>
          <View style={styles.field}>
            <Text style={styles.label}>{t("inventory.barcode")}</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                value={barcode}
                onChangeText={setBarcode}
                onSubmitEditing={() => void lookupBarcode(barcode)}
                placeholder={t("inventory.scanOrEnterBarcode")}
                autoCapitalize="none"
                returnKeyType="search"
                style={[styles.input, styles.barcodeInput]}
              />
              <Pressable
                disabled={lookingUp}
                onPress={() => void lookupBarcode(barcode)}
                style={styles.lookupButton}
              >
                {lookingUp ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.lookupText}>{t("common.search")}</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.hint}>{t("inventory.barcodeScannerHint")}</Text>
          </View>

          <View style={styles.row}>
            <InputField
              label={t("inventory.productName")}
              value={name}
              onChangeText={setName}
              placeholder={t("inventory.productName")}
            />
            <InputField
              label={t("inventory.batchNumber")}
              value={batchNumber}
              onChangeText={setBatchNumber}
              placeholder="e.g. LOT-041"
            />
          </View>
          <View style={styles.row}>
            <InputField
              label={t("inventory.manufactureDate")}
              value={manufactureDate}
              onChangeText={setManufactureDate}
              placeholder="YYYY-MM-DD"
            />
            <InputField
              label={t("inventory.expiryDate")}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
          <View style={styles.row}>
            <InputField
              label={t("inventory.mrp")}
              value={mrp}
              onChangeText={setMrp}
              placeholder="0.00"
              numeric
            />
            <InputField
              label={t("inventory.purchaseRate")}
              value={purchaseRate}
              onChangeText={setPurchaseRate}
              placeholder="0.00"
              numeric
            />
            <InputField
              label={t("inventory.quantityPieces")}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0"
              numeric
            />
          </View>
          <InputField
            label={t("inventory.supplierOptional")}
            value={supplier}
            onChangeText={setSupplier}
            placeholder={t("inventory.vendorName")}
          />
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>{t("inventory.purchaseTotal")}</Text>
            <Text style={styles.total}>
              ₹{(
                (Number(purchaseRate) || 0) * (Number(quantity) || 0)
              ).toFixed(2)}
            </Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <Pressable
            disabled={saving}
            onPress={() => void saveBatch()}
            style={[styles.saveButton, saving && styles.disabled]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveText}>{t("inventory.receiveBatch")}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
};

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
}: InputFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFDF9" },
  page: { width: "100%", maxWidth: 1050, alignSelf: "center", padding: 18, gap: 8 },
  title: { color: "#141212", fontSize: 24, fontWeight: "800" },
  description: { marginBottom: 8, color: "#6B625E", fontSize: 14 },
  card: { padding: 18, gap: 15, borderRadius: 16, borderWidth: 1, borderColor: "#E8DED7", backgroundColor: "#FFFFFF" },
  sectionTitle: { color: "#141212", fontSize: 18, fontWeight: "800" },
  field: { flex: 1, minWidth: 160, gap: 6 },
  label: { color: "#443B36", fontSize: 13, fontWeight: "700" },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D9CEC6", borderRadius: 9, paddingHorizontal: 12, color: "#141212", fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  barcodeRow: { flexDirection: "row", gap: 8 },
  barcodeInput: { flex: 1 },
  lookupButton: { minWidth: 90, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#141212" },
  lookupText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  hint: { color: "#6B625E", fontSize: 12 },
  totalBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 10, backgroundColor: "#FFF7E4" },
  totalLabel: { color: "#443B36", fontSize: 15, fontWeight: "600" },
  total: { color: "#141212", fontSize: 21, fontWeight: "800" },
  saveButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#E51A1A" },
  disabled: { opacity: 0.65 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  error: { color: "#C62828", fontSize: 14 },
  success: { color: "#217A45", fontSize: 14 },
});
