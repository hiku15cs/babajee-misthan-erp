import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { OwnerGate } from "../../components/OwnerGate";
import {
  localDateInput,
  isValidDateInput,
  OwnerField,
  OwnerMessage,
  OwnerPage,
  ownerStyles,
} from "../../components/OwnerUi";
import { supabase } from "../../lib/supabase";

type AuditEntry = {
  id: number;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor_id: string | null;
  actor_name: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

type AuditUser = { id: string; full_name: string; role: string };

function AuditContent() {
  const [date, setDate] = useState(localDateInput());
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    const { data, error: usersError } = await supabase
      .from("profiles")
      .select("id,full_name,role")
      .order("full_name");
    if (usersError) throw new Error(usersError.message);
    setUsers(data ?? []);
  }, []);

  const loadEntries = useCallback(async () => {
    if (!isValidDateInput(date)) {
      setError("Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    setLoading(true);
    setError("");
    const start = `${date}T00:00:00+05:30`;
    const nextDate = new Date(`${date}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const next = nextDate.toISOString().slice(0, 10);
    let query = supabase
      .from("audit_logs")
      .select("id,table_name,action,actor_id,actor_name,old_data,new_data,created_at")
      .gte("created_at", start)
      .lt("created_at", `${next}T00:00:00+05:30`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (userId) query = query.eq("actor_id", userId);
    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as AuditEntry[]);
    }
    setLoading(false);
  }, [date, userId]);

  useEffect(() => {
    void loadUsers().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [loadUsers]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
      <OwnerPage
        title="Multi-Admin Audit Trail"
        description="Review who changed inventory, procurement, batches, daily expenses, or closing records and inspect the captured before/after values."
      >
        <View style={ownerStyles.section}>
          <View style={ownerStyles.row}>
            <OwnerField
              label="Date (YYYY-MM-DD)"
              value={date}
              onChangeText={setDate}
              placeholder="2026-11-13"
            />
            <Pressable
              onPress={() => setUserId("")}
              style={[ownerStyles.outline, !userId && ownerStyles.outlineActive]}
            >
              <Text>All users</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={ownerStyles.row}>
              {users.map((user) => (
                <Pressable
                  key={user.id}
                  onPress={() => setUserId(user.id)}
                  style={[ownerStyles.outline, userId === user.id && ownerStyles.outlineActive]}
                >
                  <Text>{user.full_name} · {user.role}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
        {error ? <OwnerMessage error>{error}</OwnerMessage> : null}
        {loading ? <ActivityIndicator color="#E51A1A" /> : null}
        {!loading && entries.length === 0 ? (
          <View style={ownerStyles.section}>
            <Text style={ownerStyles.body}>No audit entries found for this filter.</Text>
          </View>
        ) : null}
        {entries.map((entry) => (
          <View key={entry.id} style={ownerStyles.section}>
            <View style={ownerStyles.row}>
              <Text style={[styles.action, entry.action === "DELETE" && styles.deleteAction]}>
                {entry.action}
              </Text>
              <Text style={ownerStyles.sectionTitle}>{entry.table_name}</Text>
              <Text style={ownerStyles.muted}>{new Date(entry.created_at).toLocaleString()}</Text>
            </View>
            <Text style={ownerStyles.body}>
              Performed by: {entry.actor_name}
              {entry.actor_id ? ` · ${users.find((user) => user.id === entry.actor_id)?.role ?? "User"}` : ""}
            </Text>
            {entry.old_data ? (
              <View style={styles.dataBox}>
                <Text style={styles.dataTitle}>Old values</Text>
                <Text selectable style={styles.dataText}>{JSON.stringify(entry.old_data, null, 2)}</Text>
              </View>
            ) : null}
            {entry.new_data ? (
              <View style={styles.dataBox}>
                <Text style={styles.dataTitle}>New values</Text>
                <Text selectable style={styles.dataText}>{JSON.stringify(entry.new_data, null, 2)}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </OwnerPage>
    </ScrollView>
  );
}

export default function AuditScreen() {
  return <OwnerGate><AuditContent /></OwnerGate>;
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, overflow: "hidden", backgroundColor: "#FFF3CF", color: "#604500", fontSize: 11, fontWeight: "900" },
  deleteAction: { backgroundColor: "#FFF0EF", color: "#B42318" },
  dataBox: { padding: 10, gap: 6, borderRadius: 8, backgroundColor: "#F8F5F2" },
  dataTitle: { color: "#51463D", fontSize: 12, fontWeight: "800" },
  dataText: { color: "#443B36", fontSize: 11, lineHeight: 16, fontFamily: "monospace" },
});
