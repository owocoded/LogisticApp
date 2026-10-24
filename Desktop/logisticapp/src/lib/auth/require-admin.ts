import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/admin/login");
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc(
    "is_current_user_admin",
  );

  if (roleError || isAdmin !== true) {
    console.error(
      "Admin authorization check failed:",
      roleError?.message ?? "User is not an administrator",
    );

    redirect("/admin/login?error=unauthorized");
  }

  return user;
}
