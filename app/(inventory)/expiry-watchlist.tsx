import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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

type BatchStatus = "EXPIRED" | "CRITICAL" | "WARNING" | "SAFE" | "NO_DATE";
type BatchRow = {
  id: string;
  batch_number: string | null;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  mrp: number | null;
  manufacture_date: string | null;
  expiry_date: string | null;
  supplier_name: string | null;
  received_at: string;
  products: { name: string; barcode: string | null };
};

function todayUtcDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getDaysRemaining(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const [year, month, day] = expiryDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayUtcDate().split("-").map(Number);
  return Math.floor(
    (Date.UTC(year, month - 1, day) -
      Date.UTC(todayYear, todayMonth - 1, todayDay)) /
      86_400_000,
  );
}

function getBatchStatus(expiryDate: string | null): BatchStatus {
  if (!expiryDate) return "NO_DATE";
  const days = getDaysRemaining(expiryDate);
  if (days === null) return "NO_DATE";
  if (days < 0) return "EXPIRED";
  if (days < 7) return "CRITICAL";
  if (days <= 30) return "WARNING";
  return "SAFE";
}

function dateLabel(date: string | null): string {
  return date ?? "—";
}

export default function ExpiryWatchlistScreen() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<BatchRow | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("");
  const [returnVendor, setReturnVendor] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("product_batches")
      .select(
        "id,batch_number,quantity_received,quantity_remaining,unit_cost,mrp,manufacture_date,expiry_date,supplier_name,received_at,products!inner(name,barcode)",
      )
      .gt("quantity_remaining", 0)
      .eq("products.product_type", "PACKAGED_GOOD")
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("received_at", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setBatches([]);
    } else {
      setBatches((data ?? []) as unknown as BatchRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const counts = useMemo(
    () =>
      batches.reduce(
        (result, batch) => {
          result[getBatchStatus(batch.expiry_date)] += 1;
          return result;
        },
        { EXPIRED: 0, CRITICAL: 0, WARNING: 0, SAFE: 0, NO_DATE: 0 } as Record<
          BatchStatus,
          number
        >,
      ),
    [batches],
  );

  function openReturn(batch: BatchRow) {
    setSelected(batch);
    setReturnQuantity(String(batch.quantity_remaining));
    setReturnVendor(batch.supplier_name ?? "");
    setReturnReason("");
    setError("");
    setMessage("");
  }

  async function submitReturn() {
    if (!selected) return;
    const quantity = Number(returnQuantity);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > selected.quantity_remaining
    ) {
      setError(t("inventory.invalidReturnQuantity"));
      return;
    }

    setReturning(true);
    setError("");
    setMessage("");
    try {
      const result = await queueInventoryOperation("mark_product_batch_return", {
        p_batch_id: selected.id,
        p_quantity: quantity,
        p_vendor_name: returnVendor.trim() || null,
        p_reason: returnReason.trim() || null,
      });

      setSelected(null);
      if (result.status === "synced") {
        setMessage(t("inventory.returnRecorded"));
        await loadBatches();
      } else {
        setMessage(
          result.syncError
            ? `${t("inventory.returnQueuedWithError")} ${result.syncError}`
            : t("inventory.returnQueued"),
        );
      }
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : String(returnError));
    } finally {
      setReturning(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <InventoryHeader />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.title}>{t("inventory.expiryWatchlist")}</Text>
        <Text style={styles.description}>{t("inventory.expiryDescription")}</Text>

        <View style={styles.summary}>
          <CountBadge label={t("inventory.safe")} count={counts.SAFE} status="SAFE" />
          <CountBadge label={t("inventory.warning")} count={counts.WARNING} status="WARNING" />
          <CountBadge label={t("inventory.critical")} count={counts.CRITICAL} status="CRITICAL" />
          <CountBadge label={t("inventory.expired")} count={counts.EXPIRED} status="EXPIRED" />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {loading ? (
          <ActivityIndicator color="#E51A1A" style={styles.loader} />
        ) : batches.length === 0 ? (
          <Text style={styles.empty}>{t("inventory.noActiveBatches")}</Text>
        ) : (
          <View style={styles.list}>
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                status={getBatchStatus(batch.expiry_date)}
                days={getDaysRemaining(batch.expiry_date)}
                onReturn={() => openReturn(batch)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("inventory.markReturn")}</Text>
            <Text style={styles.modalSubtitle}>
              {selected?.products.name} · {selected?.batch_number ?? t("inventory.noBatchNumber")}
            </Text>
            <Field
              label={t("inventory.returnQuantity")}
              value={returnQuantity}
              onChangeText={setReturnQuantity}
              numeric
            />
            <Field
              label={t("inventory.vendorOptional")}
              value={returnVendor}
              onChangeText={setReturnVendor}
            />
            <Field
              label={t("inventory.returnReasonOptional")}
              value={returnReason}
              onChangeText={setReturnReason}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setSelected(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={returning}
                onPress={() => void submitReturn()}
                style={[styles.returnButton, returning && styles.disabled]}
              >
                {returning ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.returnText}>{t("inventory.confirmReturn")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CountBadge({
  label,
  count,
  status,
}: {
  label: string;
  count: number;
  status: BatchStatus;
}) {
  return (
    <View style={[styles.countBadge, styles[status]]}>
      <Text style={styles.countText}>{count}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function BatchCard({
  batch,
  status,
  days,
  onReturn,
}: {
  batch: BatchRow;
  status: BatchStatus;
  days: number | null;
  onReturn: () => void;
}) {
  const { t } = useTranslation();
  const label =
    status === "NO_DATE"
      ? t("inventory.noExpiryDate")
      : status === "EXPIRED"
        ? t("inventory.expired")
        : status === "CRITICAL"
          ? t("inventory.critical")
          : status === "WARNING"
            ? t("inventory.warning")
            : t("inventory.safe");

  return (
    <View style={styles.batchCard}>
      <View style={styles.batchHead}>
        <View style={styles.batchHeading}>
          <Text style={styles.productName}>{batch.products.name}</Text>
          <Text style={styles.meta}>
            {t("inventory.batchNumber")}: {batch.batch_number ?? "—"}
          </Text>
        </View>
        <View style={[styles.statusBadge, styles[status]]}>
          <Text style={styles.statusText}>{label}</Text>
        </View>
      </View>
      <View style={styles.details}>
        <Detail label={t("inventory.barcode")} value={batch.products.barcode ?? "—"} />
        <Detail label={t("inventory.manufactureDate")} value={dateLabel(batch.manufacture_date)} />
        <Detail label={t("inventory.expiryDate")} value={dateLabel(batch.expiry_date)} />
        <Detail
          label={t("inventory.daysToExpiry")}
          value={days === null ? "—" : days < 0 ? `${Math.abs(days)} ${t("inventory.daysAgo")}` : `${days} ${t("inventory.days")}`}
        />
        <Detail label={t("inventory.remainingStock")} value={String(batch.quantity_remaining)} />
        <Detail label={t("inventory.mrp")} value={`₹${Number(batch.mrp ?? 0).toFixed(2)}`} />
        <Detail label={t("inventory.purchaseRate")} value={`₹${Number(batch.unit_cost).toFixed(2)}`} />
        {batch.supplier_name ? (
          <Detail label={t("inventory.vendor")} value={batch.supplier_name} />
        ) : null}
      </View>
      <Pressable onPress={onReturn} style={styles.markReturnButton}>
        <Text style={styles.markReturnText}>{t("inventory.markReturn")}</Text>
      </Pressable>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.detailLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFDF9" },
  page: { width: "100%", maxWidth: 1400, alignSelf: "center", padding: 18, gap: 12 },
  title: { color: "#141212", fontSize: 24, fontWeight: "800" },
  description: { marginBottom: 4, color: "#6B625E", fontSize: 14 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  countBadge: { minWidth: 96, alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  countText: { color: "#141212", fontSize: 20, fontWeight: "800" },
  countLabel: { color: "#443B36", fontSize: 12, fontWeight: "700" },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  batchCard: { flexGrow: 1, flexBasis: 340, gap: 13, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: "#E8DED7", backgroundColor: "#FFFFFF" },
  batchHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  batchHeading: { flex: 1 },
  productName: { color: "#141212", fontSize: 17, fontWeight: "800" },
  meta: { marginTop: 4, color: "#6B625E", fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  statusText: { color: "#141212", fontSize: 11, fontWeight: "800" },
  details: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  detail: { width: "50%", paddingRight: 8 },
  detailLabel: { color: "#6B625E", fontSize: 11, fontWeight: "600" },
  detailValue: { marginTop: 3, color: "#141212", fontSize: 13, fontWeight: "700" },
  markReturnButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#F3A806" },
  markReturnText: { color: "#141212", fontSize: 13, fontWeight: "800" },
  SAFE: { backgroundColor: "#DDF3E4" },
  WARNING: { backgroundColor: "#FFF0C2" },
  CRITICAL: { backgroundColor: "#FFD7D7" },
  EXPIRED: { backgroundColor: "#D5D0D0" },
  NO_DATE: { backgroundColor: "#EEEEEE" },
  loader: { marginTop: 22 },
  empty: { paddingVertical: 30, color: "#6B625E", textAlign: "center" },
  error: { color: "#C62828", fontSize: 14 },
  success: { color: "#217A45", fontSize: 14 },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { width: "100%", maxWidth: 480, gap: 14, padding: 20, borderRadius: 16, backgroundColor: "#FFFFFF" },
  modalTitle: { color: "#141212", fontSize: 20, fontWeight: "800" },
  modalSubtitle: { color: "#6B625E", fontSize: 14 },
  field: { gap: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#D9CEC6", borderRadius: 9, paddingHorizontal: 12, color: "#141212", fontSize: 16 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  cancelButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 9, backgroundColor: "#F0EAE5" },
  cancelText: { color: "#443B36", fontWeight: "700" },
  returnButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 9, backgroundColor: "#E51A1A" },
  returnText: { color: "#FFFFFF", fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
