import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { OwnerGate } from "../../components/OwnerGate";
import {
  localDateInput,
  isValidDateInput,
  money,
  OwnerButton,
  OwnerCard,
  OwnerField,
  OwnerMessage,
  OwnerPage,
  ownerStyles,
} from "../../components/OwnerUi";
import {
  fetchOwnerDailySummary,
  type OwnerDailySummary,
} from "../../lib/ownerReports";
import { supabase } from "../../lib/supabase";

type CostType = "FUEL_CONSUMED" | "WASTAGE" | "OVERHEAD";

function ClosingContent() {
  const [date, setDate] = useState(localDateInput());
  const [actualCash, setActualCash] = useState("");
  const [summary, setSummary] = useState<OwnerDailySummary>();
  const [costType, setCostType] = useState<CostType>("OVERHEAD");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSummary = useCallback(async () => {
    if (!isValidDateInput(date)) {
      setError("Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const report = await fetchOwnerDailySummary(date);
      setSummary(report);
      setActualCash(report.actual_cash === null ? "" : String(report.actual_cash));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  async function saveClosing() {
    const counted = Number(actualCash);
    if (!summary || !Number.isFinite(counted) || counted < 0) {
      setError("Enter a valid non-negative cash count.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.rpc("record_daily_closing", {
      p_date: date,
      p_actual_cash: counted,
    });
    if (saveError) {
      setError(saveError.message);
    } else {
      setMessage("Daily cash closing saved.");
      await loadSummary();
    }
    setSaving(false);
  }

  async function saveCost() {
    const costAmount = Number(amount);
    if (
      !isValidDateInput(date) ||
      !Number.isFinite(costAmount) ||
      costAmount <= 0 ||
      !description.trim()
    ) {
      setError("Enter a valid positive amount and expense description.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase.rpc("record_daily_operating_cost", {
      p_date: date,
      p_cost_type: costType,
      p_amount: costAmount,
      p_description: description.trim(),
    });
    if (saveError) {
      setError(saveError.message);
    } else {
      setAmount("");
      setDescription("");
      setMessage("Operating cost recorded.");
      await loadSummary();
    }
    setSaving(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <OwnerPage
        title="Daily Closing Register"
        description="Review tender totals, reconcile the drawer, and record fuel consumed, wastage, or daily overheads."
      >
        <View style={ownerStyles.row}>
          <OwnerField
            label="Business date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-11-13"
          />
          <OwnerButton label="Refresh totals" onPress={() => void loadSummary()} secondary />
        </View>
        {loading ? <Text style={ownerStyles.muted}>Loading daily totals…</Text> : null}
        {summary ? (
          <>
            <View style={ownerStyles.row}>
              <OwnerCard title="Cash collected" value={money(summary.cash_total)} />
              <OwnerCard title="UPI collected" value={money(summary.upi_total)} />
              <OwnerCard title="Udhaar / credit" value={money(summary.udhaar_total)} />
              <OwnerCard title="Expected drawer cash" value={money(summary.expected_cash)} variant="crimson" />
            </View>
            <View style={ownerStyles.section}>
              <Text style={ownerStyles.sectionTitle}>Drawer reconciliation</Text>
              <Text style={ownerStyles.body}>
                Expected physical cash: {money(summary.expected_cash)}
                {summary.closed_by_name ? ` · Last closed by ${summary.closed_by_name}` : ""}
              </Text>
              <View style={ownerStyles.row}>
                <OwnerField
                  label="Actual cash counted (₹)"
                  value={actualCash}
                  onChangeText={setActualCash}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                />
                <OwnerButton label="Save daily closing" onPress={() => void saveClosing()} loading={saving} />
              </View>
              {summary.cash_difference !== null ? (
                <Text style={styles.difference}>
                  Difference: {money(summary.cash_difference)}{" "}
                  {summary.cash_difference === 0 ? "(balanced)" : "(over / short)"}
                </Text>
              ) : null}
            </View>
            <View style={ownerStyles.section}>
              <Text style={ownerStyles.sectionTitle}>Today’s expenses</Text>
              <View style={ownerStyles.row}>
                <OwnerCard title="Raw materials purchased" value={money(summary.purchase_total)} variant="gold" />
                <OwnerCard title="Fuel purchased" value={money(summary.fuel_purchase_total)} variant="gold" />
                <OwnerCard title="Fuel consumed" value={money(summary.fuel_total)} variant="gold" />
                <OwnerCard title="Wastage / spoilage" value={money(summary.wastage_total)} variant="crimson" />
                <OwnerCard title="Daily overheads" value={money(summary.overhead_total)} variant="neutral" />
              </View>
              <Text style={ownerStyles.muted}>
                Fuel purchases are recorded in procurement; the P&L separately counts fuel consumed to avoid treating purchase and consumption as the same expense.
              </Text>
            </View>
          </>
        ) : null}
        <View style={ownerStyles.section}>
          <Text style={ownerStyles.sectionTitle}>Log an operating cost</Text>
          <View style={ownerStyles.row}>
            {([
              ["FUEL_CONSUMED", "Fuel consumed"],
              ["WASTAGE", "Wastage / spoilage"],
              ["OVERHEAD", "Daily overhead"],
            ] as const).map(([value, label]) => (
              <Text
                key={value}
                accessibilityRole="button"
                onPress={() => setCostType(value)}
                style={[styles.category, costType === value && styles.categoryActive]}
              >
                {label}
              </Text>
            ))}
          </View>
          <View style={ownerStyles.row}>
            <OwnerField
              label="Amount (₹)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <OwnerField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. LPG used today"
            />
            <OwnerButton label="Add expense" onPress={() => void saveCost()} loading={saving} />
          </View>
        </View>
        {error ? <OwnerMessage error>{error}</OwnerMessage> : null}
        {message ? <OwnerMessage>{message}</OwnerMessage> : null}
      </OwnerPage>
    </ScrollView>
  );
}

export default function ClosingScreen() {
  return <OwnerGate><ClosingContent /></OwnerGate>;
}

const styles = StyleSheet.create({
  page: { paddingBottom: 36 },
  difference: { color: "#E51A1A", fontSize: 15, fontWeight: "800" },
  category: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#FFF3E7",
    color: "#443B36",
    fontSize: 13,
    fontWeight: "700",
  },
  categoryActive: { backgroundColor: "#F3A806", color: "#141212" },
});
