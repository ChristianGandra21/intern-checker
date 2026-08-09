"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PendingSave({ jobId }: { jobId?: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!jobId) return;
    void fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: jobId }) })
      .then(async (response) => ({ response, data: await response.json() as { application?: { id?: string } } }))
      .then(({ response, data }) => response.ok && data.application?.id ? router.replace(`/applications/${data.application.id}`) : router.replace("/"));
  }, [jobId, router]);
  return null;
}
