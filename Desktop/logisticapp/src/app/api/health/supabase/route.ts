
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json(
        { status: "error", message: "Supabase session check failed." },
        { status: 503 },
      );
    }

    return NextResponse.json({ status: "connected" });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Supabase configuration is unavailable." },
      { status: 503 },
    );
  }
}
