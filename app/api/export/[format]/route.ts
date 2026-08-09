import { NextResponse } from "next/server";
import { getAllJobs } from "@/lib/data";
import { createXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";

const columns = ["title", "company", "location", "work_mode", "source", "source_url", "display_tier", "target_fit", "location_fit", "published_at", "discovered_at", "score", "quality_score", "status", "display_reasons", "score_reasons", "validation_reasons"] as const;

function rowsOf(jobs: Awaited<ReturnType<typeof getAllJobs>>) {
  return jobs.map((job) => ({
    title: job.title,
    company: job.company,
    location: job.location,
    work_mode: job.work_mode,
    source: job.source,
    source_url: job.source_url,
    display_tier: job.display_tier ?? "",
    target_fit: job.target_fit ?? "",
    location_fit: job.location_fit ?? "",
    published_at: job.published_at ?? "",
    discovered_at: job.discovered_at,
    score: job.score,
    quality_score: job.quality_score ?? "",
    status: job.status,
    display_reasons: job.display_reasons?.join("; ") ?? "",
    score_reasons: job.score_reasons.join("; "),
    validation_reasons: job.validation_reasons?.join("; ") ?? "",
  }));
}

function safeCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_: Request, context: { params: Promise<{ format: string }> }) {
  const { format } = await context.params;
  const rows = rowsOf(await getAllJobs());
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => safeCsvCell(row[column])).join(","))].join("\n");
    return new NextResponse(`\uFEFF${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vagas-${stamp}.csv"` } });
  }
  if (format === "xlsx") {
    const widths = [42, 24, 22, 12, 14, 48, 14, 14, 14, 20, 20, 8, 12, 12, 52, 52, 60];
    const buffer = Buffer.from(createXlsx([...columns], rows, widths));
    return new NextResponse(buffer, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="vagas-${stamp}.xlsx"` } });
  }
  return NextResponse.json({ error: "Formato não suportado. Use csv ou xlsx." }, { status: 404 });
}
