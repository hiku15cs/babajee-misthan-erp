import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("User provisioning function is missing Supabase environment variables.");
    return respond(500, { error: "User provisioning is not configured." });
  }
  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { error: "Sign in as an owner to create an account." });
  }

  let input: {
    full_name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return respond(400, { error: "Request body must be valid JSON." });
  }

  const fullName = typeof input.full_name === "string" ? input.full_name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;
  if (
    !fullName ||
    fullName.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 128 ||
    (role !== "MANAGER" && role !== "STAFF")
  ) {
    return respond(400, {
      error: "Provide a name, valid email, 12–128 character password, and MANAGER or STAFF role.",
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const accessToken = authorization.slice("Bearer ".length);
  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser(accessToken);
  if (callerError || !callerData.user) {
    return respond(401, { error: "The sign-in session is invalid or expired." });
  }

  const { data: actor, error: actorError } = await admin
    .from("profiles")
    .select("id,full_name,role,is_active")
    .eq("id", callerData.user.id)
    .maybeSingle();
  if (actorError) {
    console.error("Could not verify provisioning actor profile.", actorError.message);
    return respond(500, { error: "Could not verify the signed-in profile." });
  }
  if (actor?.role !== "OWNER" || !actor.is_active) {
    return respond(403, { error: "Only an active owner can create users." });
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (authError || !created.user) {
    return respond(400, { error: authError?.message ?? "Supabase Auth did not create the user." });
  }

  const profile = {
    id: created.user.id,
    full_name: fullName,
    role,
    is_active: true,
  };
  const { error: profileError } = await admin.from("profiles").insert(profile);
  if (profileError) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("Could not clean up Auth user after profile creation failed.", cleanupError.message);
    }
    return respond(500, { error: `Auth user was created but profile setup failed: ${profileError.message}` });
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    table_name: "profiles",
    record_id: created.user.id,
    action: "INSERT",
    actor_id: actor.id,
    actor_name: actor.full_name,
    old_data: null,
    new_data: profile,
  });
  if (auditError) {
    const { error: profileCleanupError } = await admin
      .from("profiles")
      .delete()
      .eq("id", created.user.id);
    const { error: authCleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (profileCleanupError || authCleanupError) {
      console.error("User creation rollback was incomplete.", {
        profileCleanupError: profileCleanupError?.message,
        authCleanupError: authCleanupError?.message,
      });
    }
    return respond(500, { error: `Could not write user audit record: ${auditError.message}` });
  }

  return respond(201, {
    id: created.user.id,
    full_name: fullName,
    role,
    is_active: true,
  });
});
