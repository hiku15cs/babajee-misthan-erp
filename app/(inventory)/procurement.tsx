import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";

import { InventoryHeader } from "../../components/InventoryHeader";
import { queueInventoryOperation } from "../../lib/inventoryOutbox";
import { supabase } from "../../lib/supabase";

type MaterialGroup = "DAIRY" | "GROCERY" | "FUEL";
type MaterialOption = { name: string; unit: string; alternateUnit?: string };
type ProcurementHistory = {
  id: string;
  quantity: number;
  unit: string;
  rate_per_unit: number;
  total_cost: number;
  vendor_name: string | null;
  logged_by_name: string;
  created_at: string;
};

const materials: Record<MaterialGroup, MaterialOption[]> = {
  DAIRY: [
    { name: "Milk", unit: "litre" },
    { name: "Khowa", unit: "kg" },
    { name: "Chena", unit: "kg" },
    { name: "Ghee", unit: "kg" },
  ],
  GROCERY: [
    { name: "Sugar", unit: "kg" },
    { name: "Maida", unit: "kg" },
    { name: "Besan", unit: "kg" },
  ],
  FUEL: [
    { name: "Gas Cylinder", unit: "cylinder" },
    { name: "Wood / Lakdi", unit: "quintal" },
    { name: "Coal / Koila", unit: "kg", alternateUnit: "quintal" },
  ],
};

const groups: MaterialGroup[] = ["DAIRY", "GROCERY", "FUEL"];

function money(value: number): string {
  return `₹${value.toFixed(2)}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function ProcurementScreen() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [group, setGroup] = useState<MaterialGroup>("DAIRY");
  const [selectedName, setSelectedName] = useState("Milk");
  const [unit, setUnit] = useState("litre");
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState("");
  const [vendor, setVendor] = useState("");
  const [history, setHistory] = useState<ProcurementHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedMaterial = useMemo(
    () => materials[group].find((item) => item.name === selectedName) ?? materials[group][0],
    [group, selectedName],
  );
  const quantityValue = Number(quantity);
  const rateValue = Number(rate);
  const totalCost =
    Number.isFinite(quantityValue) && Number.isFinite(rateValue)
      ? quantityValue * rateValue
      : 0;

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError("");
    const materialKind = group === "FUEL" ? "FUEL" : "INGREDIENT";
    const { data: material, error: materialError } = await supabase
      .from("raw_materials")
      .select("id")
      .eq("name", selectedName)
      .eq("category", materialKind)
      .eq("unit", unit)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (materialError) {
      setError(materialError.message);
      setHistory([]);
      setLoadingHistory(false);
      return;
    }
    if (!material) {
      setHistory([]);
      setLoadingHistory(false);
      return;
    }

    const { data, error: historyError } = await supabase
      .from("material_procurements")
      .select("id,quantity,unit,rate_per_unit,total_cost,vendor_name,logged_by_name,created_at")
      .eq("raw_material_id", material.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (historyError) {
      setError(historyError.message);
      setHistory([]);
    } else {
      setHistory((data ?? []) as ProcurementHistory[]);
    }
    setLoadingHistory(false);
  }, [group, selectedName, unit]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function changeGroup(nextGroup: MaterialGroup) {
    setGroup(nextGroup);
    setSelectedName(materials[nextGroup][0].name);
    setUnit(materials[nextGroup][0].unit);
    setQuantity("");
    setRate("");
    setMessage("");
  }

  function chooseMaterial(item: MaterialOption) {
    setSelectedName(item.name);
    setUnit(item.unit);
  }

  async function saveProcurement() {
    if (
      !selectedMaterial ||
      !Number.isFinite(quantityValue) ||
      quantityValue <= 0 ||
      !Number.isFinite(rateValue) ||
      rateValue < 0
    ) {
      setError("Enter a quantity greater than zero and a valid non-negative rate.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await queueInventoryOperation("record_material_procurement", {
        p_name: selectedMaterial.name,
        p_category_group: group,
        p_unit: unit,
        p_quantity: quantityValue,
        p_rate_per_unit: rateValue,
        p_vendor_name: vendor.trim() || null,
      });

      setQuantity("");
      setRate("");
      setVendor("");
      if (result.status === "synced") {
        setMessage("Purchase saved and synced.");
        await loadHistory();
      } else {
        setMessage(
          result.syncError
            ? `Saved on this device. Sync will retry: ${result.syncError}`
            : "Saved on this device. It will sync when internet is available.",
        );
      }
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
        <Text style={styles.title}>{t("inventory.procurementTitle")}</Text>
        <Text style={styles.description}>{t("inventory.procurementDescription")}</Text>
        <View style={[styles.columns, width >= 900 && styles.columnsWide]}>
          <View style={[styles.card, width >= 900 && styles.formColumn]}>
            <View style={styles.tabs}>
              {groups.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => changeGroup(item)}
                  style={[styles.tab, group === item && styles.tabActive]}
                >
                  <Text style={[styles.tabText, group === item && styles.tabTextActive]}>
                    {t(`inventory.group${item}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{t("inventory.material")}</Text>
            <View style={styles.choiceGrid}>
              {materials[group].map((item) => (
                <Pressable
                  key={item.name}
                  onPress={() => chooseMaterial(item)}
                  style={[
                    styles.choice,
                    selectedName === item.name && styles.choiceActive,
                  ]}
                >
                  <Text style={styles.choiceText}>{item.name}</Text>
                  <Text style={styles.muted}>{item.unit}</Text>
                </Pressable>
              ))}
            </View>

            {selectedMaterial.alternateUnit ? (
              <View style={styles.tabs}>
                {[selectedMaterial.unit, selectedMaterial.alternateUnit].map(
                  (option) => (
                    <Pressable
                      key={option}
                      onPress={() => setUnit(option)}
                      style={[styles.unitOption, unit === option && styles.unitOptionActive]}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          unit === option && styles.tabTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <InputField
                label={`${t("inventory.quantity")} (${unit})`}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0"
                keyboardType="decimal-pad"
              />
              <InputField
                label={t("inventory.ratePerUnit")}
                value={rate}
                onChangeText={setRate}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <InputField
              label={t("inventory.vendorOptional")}
              value={vendor}
              onChangeText={setVendor}
              placeholder={t("inventory.vendorName")}
            />
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>{t("inventory.totalCost")}</Text>
              <Text style={styles.total}>{money(totalCost)}</Text>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            <Pressable
              disabled={saving}
              onPress={() => void saveProcurement()}
              style={[styles.saveButton, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>{t("inventory.savePurchase")}</Text>
              )}
            </Pressable>
          </View>

          <View style={[styles.card, width >= 900 && styles.historyColumn]}>
            <Text style={styles.sectionTitle}>{t("inventory.rateHistory")}</Text>
            <Text style={styles.muted}>
              {selectedName} · {unit} · {t(`inventory.group${group}`)}
            </Text>
            {loadingHistory ? (
              <ActivityIndicator color="#E51A1A" style={styles.loader} />
            ) : history.length === 0 ? (
              <Text style={styles.empty}>{t("inventory.noRateHistory")}</Text>
            ) : (
              history.map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View style={styles.historyMain}>
                    <Text style={styles.historyRate}>
                      {money(Number(entry.rate_per_unit))} / {entry.unit}
                    </Text>
                    <Text style={styles.muted}>
                      {Number(entry.quantity)} {entry.unit} · {entry.logged_by_name}
                    </Text>
                    <Text style={styles.muted}>{dateTime(entry.created_at)}</Text>
                    {entry.vendor_name ? (
                      <Text style={styles.muted}>{entry.vendor_name}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.historyTotal}>
                    {money(Number(entry.total_cost))}
                  </Text>
                </View>
              ))
            )}
          </View>
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
  keyboardType?: "default" | "decimal-pad";
};

function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: InputFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFDF9" },
  page: { width: "100%", maxWidth: 1400, alignSelf: "center", padding: 18, gap: 8 },
  title: { color: "#141212", fontSize: 24, fontWeight: "800" },
  description: { marginBottom: 8, color: "#6B625E", fontSize: 14 },
  columns: { gap: 16 },
  columnsWide: { flexDirection: "row", alignItems: "flex-start" },
  formColumn: { flex: 1.15 },
  historyColumn: { flex: 0.85 },
  card: {
    padding: 18,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8DED7",
    backgroundColor: "#FFFFFF",
  },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 9, backgroundColor: "#FFF3E7" },
  tabActive: { backgroundColor: "#F3A806" },
  tabText: { color: "#443B36", fontSize: 14, fontWeight: "600" },
  tabTextActive: { color: "#141212", fontWeight: "800" },
  unitOption: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: "#FFF3E7" },
  unitOptionActive: { backgroundColor: "#F3A806" },
  label: { color: "#443B36", fontSize: 13, fontWeight: "700" },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { minWidth: 110, padding: 12, borderWidth: 1, borderColor: "#E8DED7", borderRadius: 10 },
  choiceActive: { borderColor: "#E51A1A", backgroundColor: "#FFF3F0" },
  choiceText: { color: "#141212", fontSize: 14, fontWeight: "700" },
  muted: { marginTop: 3, color: "#6B625E", fontSize: 12 },
  inputRow: { flexDirection: "row", gap: 10 },
  field: { flex: 1, minWidth: 120, gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D9CEC6",
    borderRadius: 9,
    paddingHorizontal: 12,
    color: "#141212",
    fontSize: 16,
  },
  totalBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 10, backgroundColor: "#FFF7E4" },
  totalLabel: { color: "#443B36", fontSize: 15, fontWeight: "600" },
  total: { color: "#141212", fontSize: 21, fontWeight: "800" },
  saveButton: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#E51A1A" },
  disabled: { opacity: 0.65 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  error: { color: "#C62828", fontSize: 14 },
  success: { color: "#217A45", fontSize: 14 },
  sectionTitle: { color: "#141212", fontSize: 18, fontWeight: "800" },
  loader: { marginTop: 18 },
  empty: { paddingVertical: 24, color: "#6B625E", fontSize: 14 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0EAE5" },
  historyMain: { flex: 1 },
  historyRate: { color: "#141212", fontSize: 15, fontWeight: "700" },
  historyTotal: { color: "#E51A1A", fontSize: 14, fontWeight: "800" },
});
