"use client";

import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

const IDLE_REFRESH_INTERVAL_MS = 30_000;
const RUNNING_REFRESH_INTERVAL_MS = 5_000;

export function DashboardAutoRefresh({ running = false }: { running?: boolean }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, running ? RUNNING_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh, running]);

  return (
    <button
      type="button"
      className="button-quiet border border-[var(--line)] bg-[var(--surface)]"
      onClick={refresh}
      disabled={isRefreshing}
      aria-live="polite"
    >
      <RefreshCcw className={isRefreshing ? "animate-spin" : ""} size={15} aria-hidden="true" />
      {isRefreshing ? "Sincronizando" : running ? "Coleta em andamento · 5s" : "Atualização automática · 30s"}
    </button>
  );
}
