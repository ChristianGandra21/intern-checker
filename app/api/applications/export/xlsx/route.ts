import { NextResponse } from "next/server";
import { applicationExportColumns, applicationExportRows } from "@/lib/application-export";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin, hasDatabaseConfig } from "@/lib/supabase";
import type { TrackedApplication } from "@/lib/types";
import { createXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";

const applicationSelect = "*,application_stages(*),jobs(source)";

export async function GET() {
  const user = await requireUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
  if (!hasDatabaseConfig()) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });

  const result = await getSupabaseAdmin()
    .from("tracked_applications")
    .select(applicationSelect)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const applications = (result.data || []) as TrackedApplication[];
  const rows = applicationExportRows(applications);
  const widths = [42, 26, 22, 24, 28, 32, 70, 10, 16, 72, 24, 16, 22, 20, 48, 42, 60, 22, 22];
  const buffer = Buffer.from(createXlsx([...applicationExportColumns], rows, widths, "Minhas vagas"));
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="minhas-vagas-${stamp}.xlsx"`,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-content-type-options": "nosniff",
    },
  });
}
