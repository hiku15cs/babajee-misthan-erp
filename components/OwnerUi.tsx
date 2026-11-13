import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { ReactNode } from "react";

export function localDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value;
}

export function money(value: number | null | undefined): string {
  return `₹${(value ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function OwnerPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageDescription}>{description}</Text>
      {children}
    </View>
  );
}

export function OwnerCard({
  title,
  value,
  detail,
  variant = "gold",
}: {
  title: string;
  value: string;
  detail?: string;
  variant?: "gold" | "crimson" | "neutral";
}) {
  return (
    <View style={[styles.metricCard, styles[`metric${variant}`]]}>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

export function OwnerField({
  label,
  style,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor="#8B8079"
        style={[styles.input, style]}
      />
    </View>
  );
}

export function OwnerButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? "#E51A1A" : "#FFFFFF"} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function OwnerMessage({
  error,
  children,
}: {
  error?: boolean;
  children: string;
}) {
  return (
    <Text style={[styles.message, error ? styles.error : styles.success]}>
      {children}
    </Text>
  );
}

export const ownerStyles = StyleSheet.create({
  section: {
    padding: 16,
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8DED7",
    backgroundColor: "#FFFFFF",
  },
  sectionTitle: { color: "#141212", fontSize: 18, fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  body: { color: "#443B36", fontSize: 14, lineHeight: 21 },
  muted: { color: "#746A64", fontSize: 12, lineHeight: 18 },
  outline: {
    minHeight: 42,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#D9CEC6",
    backgroundColor: "#FFFFFF",
  },
  outlineActive: { borderColor: "#E51A1A", backgroundColor: "#FFF1EF" },
});

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1400,
    alignSelf: "center",
    padding: 18,
    gap: 16,
  },
  pageTitle: { color: "#141212", fontSize: 25, fontWeight: "800" },
  pageDescription: { marginTop: -10, color: "#6B625E", fontSize: 14 },
  metricCard: {
    flexGrow: 1,
    flexBasis: 185,
    minHeight: 112,
    padding: 16,
    justifyContent: "space-between",
    borderRadius: 14,
  },
  metricgold: { backgroundColor: "#FFF3CF", borderColor: "#F3A806", borderWidth: 1 },
  metriccrimson: { backgroundColor: "#FFF0EF", borderColor: "#E51A1A", borderWidth: 1 },
  metricneutral: { backgroundColor: "#FFFFFF", borderColor: "#E8DED7", borderWidth: 1 },
  metricTitle: { color: "#51463D", fontSize: 13, fontWeight: "700" },
  metricValue: { color: "#141212", fontSize: 23, fontWeight: "800" },
  metricDetail: { color: "#746A64", fontSize: 12 },
  field: { flexGrow: 1, flexBasis: 180, gap: 6 },
  label: { color: "#443B36", fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D9CEC6",
    borderRadius: 9,
    paddingHorizontal: 12,
    color: "#141212",
    fontSize: 15,
    backgroundColor: "#FFFFFF",
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#E51A1A",
  },
  secondaryButton: { backgroundColor: "#FFF1EF", borderWidth: 1, borderColor: "#E51A1A" },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryText: { color: "#E51A1A" },
  disabled: { opacity: 0.6 },
  message: { fontSize: 13, lineHeight: 19 },
  error: { color: "#B42318" },
  success: { color: "#217A45" },
});
