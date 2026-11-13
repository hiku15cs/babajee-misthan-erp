import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { OwnerGate } from "../../components/OwnerGate";
import {
  OwnerButton,
  OwnerField,
  OwnerMessage,
  OwnerPage,
  ownerStyles,
} from "../../components/OwnerUi";
import { supabase } from "../../lib/supabase";

type ManagedUser = {
  id: string;
  full_name: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  is_active: boolean;
  created_at: string;
};
type ManagedRole = "MANAGER" | "STAFF";

function UsersContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedRole>("MANAGER");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id,full_name,role,is_active,created_at")
      .order("created_at", { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setUsers([]);
    } else {
      setUsers((data ?? []) as ManagedUser[]);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function createUser() {
    if (!name.trim() || !email.trim() || password.length < 12) {
      setError("Enter a name, valid email, and a password of at least 12 characters.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    const { data, error: createError } = await supabase.functions.invoke(
      "admin-create-user",
      {
        body: {
          full_name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
        },
      },
    );
    if (createError) {
      setError(createError.message);
    } else if (!data || typeof data.id !== "string") {
      setError("The user creation function returned an invalid response.");
    } else {
      setName("");
      setEmail("");
      setPassword("");
      setMessage(
        `Created ${data.full_name} (${email.trim().toLowerCase()}) as ${data.role}. Share the initial password securely.`,
      );
      await loadUsers();
    }
    setSaving(false);
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 36 }}>
      <OwnerPage
        title="User Management"
        description="Create staff accounts through a server-side admin function. New accounts can be Managers or Billing Staff; owner accounts remain SQL-managed."
      >
        <View style={ownerStyles.section}>
          <Text style={ownerStyles.sectionTitle}>Create a Manager or Staff account</Text>
          <View style={ownerStyles.row}>
            <OwnerField label="Full name" value={name} onChangeText={setName} placeholder="Staff member name" />
            <OwnerField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <OwnerField
              label="Temporary password (12+ characters)"
              value={password}
              onChangeText={setPassword}
              placeholder="Set a strong initial password"
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={ownerStyles.row}>
            {(["MANAGER", "STAFF"] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setRole(value)}
                style={[ownerStyles.outline, role === value && ownerStyles.outlineActive]}
              >
                <Text>{value === "MANAGER" ? "Manager" : "Billing Staff"}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={ownerStyles.muted}>
            Never share a Supabase service-role key with the app. User provisioning is performed by the deployed Edge Function, which validates the signed-in owner.
          </Text>
          <OwnerButton label="Create account" onPress={() => void createUser()} loading={saving} />
          {error ? <OwnerMessage error>{error}</OwnerMessage> : null}
          {message ? <OwnerMessage>{message}</OwnerMessage> : null}
        </View>
        <View style={ownerStyles.section}>
          <Text style={ownerStyles.sectionTitle}>Registered users</Text>
          {loadingUsers ? <ActivityIndicator color="#E51A1A" /> : null}
          {!loadingUsers && users.length === 0 ? (
            <Text style={ownerStyles.body}>No profiles found.</Text>
          ) : null}
          {users.map((user) => (
            <View key={user.id} style={styles.userRow}>
              <View style={styles.userMain}>
                <Text style={styles.userName}>{user.full_name}</Text>
                <Text style={ownerStyles.muted}>{user.role} · {user.is_active ? "Active" : "Inactive"}</Text>
              </View>
              <Text style={ownerStyles.muted}>{new Date(user.created_at).toLocaleDateString()}</Text>
            </View>
          ))}
        </View>
      </OwnerPage>
    </ScrollView>
  );
}

export default function UsersScreen() {
  return <OwnerGate><UsersContent /></OwnerGate>;
}

const styles = StyleSheet.create({
  userRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F0EAE5" },
  userMain: { flex: 1 },
  userName: { color: "#141212", fontSize: 15, fontWeight: "700" },
});
