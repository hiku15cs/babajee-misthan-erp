import { supabase } from "./supabase";

export type OwnerDailySummary = {
  report_date: string;
  gross_sales: number;
  cash_total: number;
  upi_total: number;
  udhaar_total: number;
  expected_cash: number;
  purchase_total: number;
  fuel_purchase_total: number;
  fuel_total: number;
  wastage_total: number;
  overhead_total: number;
  net_margin: number;
  actual_cash: number | null;
  cash_difference: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error("The daily report contains an invalid amount.");
  return number;
}

export function parseOwnerDailySummary(value: unknown): OwnerDailySummary {
  if (!isRecord(value) || typeof value.report_date !== "string") {
    throw new Error("The daily report returned an invalid response.");
  }
  const nullableAmount = (input: unknown) =>
    input === null || input === undefined ? null : numberValue(input);
  return {
    report_date: value.report_date,
    gross_sales: numberValue(value.gross_sales),
    cash_total: numberValue(value.cash_total),
    upi_total: numberValue(value.upi_total),
    udhaar_total: numberValue(value.udhaar_total),
    expected_cash: numberValue(value.expected_cash),
    purchase_total: numberValue(value.purchase_total),
    fuel_purchase_total: numberValue(value.fuel_purchase_total),
    fuel_total: numberValue(value.fuel_total),
    wastage_total: numberValue(value.wastage_total),
    overhead_total: numberValue(value.overhead_total),
    net_margin: numberValue(value.net_margin),
    actual_cash: nullableAmount(value.actual_cash),
    cash_difference: nullableAmount(value.cash_difference),
    closed_by_name: typeof value.closed_by_name === "string" ? value.closed_by_name : null,
    closed_at: typeof value.closed_at === "string" ? value.closed_at : null,
  };
}

export async function fetchOwnerDailySummary(date: string): Promise<OwnerDailySummary> {
  const { data, error } = await supabase.rpc("get_owner_daily_summary", { p_date: date });
  if (error) throw new Error(error.message);
  return parseOwnerDailySummary(data);
}
