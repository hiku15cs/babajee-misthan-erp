import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

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

function AnalyticsContent() {
  const [date, setDate] = useState(localDateInput());
  const [summary, setSummary] = useState<OwnerDailySummary>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isValidDateInput(date)) {
      setError("Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setSummary(await fetchOwnerDailySummary(date));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
      <OwnerPage
        title="Daily Profit & Loss"
        description="Net margin = counter sales − raw-material purchases − fuel consumed − wastage/spoilage − daily overheads."
      >
        <View style={ownerStyles.row}>
          <OwnerField
            label="Business date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-11-13"
          />
          <OwnerButton label="Load report" onPress={() => void load()} secondary loading={loading} />
        </View>
        {error ? <OwnerMessage error>{error}</OwnerMessage> : null}
        {summary ? (
          <>
            <View style={ownerStyles.row}>
              <OwnerCard title="Gross counter sales" value={money(summary.gross_sales)} variant="crimson" />
              <OwnerCard title="Raw materials purchased" value={money(summary.purchase_total)} variant="gold" />
              <OwnerCard title="Fuel purchased (reference)" value={money(summary.fuel_purchase_total)} variant="neutral" />
              <OwnerCard title="Fuel consumed" value={money(summary.fuel_total)} variant="gold" />
              <OwnerCard title="Wastage / spoilage" value={money(summary.wastage_total)} variant="crimson" />
              <OwnerCard title="Daily overheads" value={money(summary.overhead_total)} variant="gold" />
              <OwnerCard title="Net margin" value={money(summary.net_margin)} variant={summary.net_margin >= 0 ? "gold" : "crimson"} />
            </View>
            <View style={ownerStyles.section}>
              <Text style={ownerStyles.sectionTitle}>Collections</Text>
              <View style={ownerStyles.row}>
                <OwnerCard title="Cash" value={money(summary.cash_total)} variant="neutral" />
                <OwnerCard title="UPI" value={money(summary.upi_total)} variant="neutral" />
                <OwnerCard title="Udhaar / credit" value={money(summary.udhaar_total)} variant="neutral" />
              </View>
              <Text style={ownerStyles.muted}>
                {summary.closed_by_name
                  ? `Drawer counted by ${summary.closed_by_name}${summary.closed_at ? ` · ${new Date(summary.closed_at).toLocaleString()}` : ""}.`
                  : "No daily cash closing has been recorded for this date."}
              </Text>
            </View>
          </>
        ) : null}
      </OwnerPage>
    </ScrollView>
  );
}

export default function AnalyticsScreen() {
  return <OwnerGate><AnalyticsContent /></OwnerGate>;
}
