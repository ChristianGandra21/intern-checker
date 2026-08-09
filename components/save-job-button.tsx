"use client";

import { Bookmark, ExternalLink, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SaveJobButton({ jobId, authenticated, initiallySaved, disabled }: { jobId: string; authenticated: boolean; initiallySaved: boolean; disabled?: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const router = useRouter();
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (saved) return <Link className="button-light w-full whitespace-nowrap" href={applicationId ? `/applications/${applicationId}` : "/applications"}><ExternalLink size={16} />Ver processo</Link>;

  async function save() {
    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent(`/?save=${jobId}`)}`);
      return;
    }
    setBusy(true);
    const response = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId }) });
    const data = await response.json() as { application?: { id?: string } };
    if (response.ok) { setApplicationId(data.application?.id || null); setSaved(true); }
    setBusy(false);
  }
  return <button type="button" onClick={save} disabled={disabled || busy} className="button-light w-full whitespace-nowrap">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Bookmark size={16} />}Salvar vaga</button>;
}
