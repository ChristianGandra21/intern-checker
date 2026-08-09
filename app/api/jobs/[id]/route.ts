import { NextRequest, NextResponse } from "next/server";
export async function PATCH(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({ error: "O acompanhamento agora é pessoal. Use POST /api/applications.", job_id: id }, { status: 410 });
}
