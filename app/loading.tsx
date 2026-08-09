import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <main className="shell grid min-h-[60dvh] place-items-center py-16" aria-live="polite" aria-busy="true">
      <div className="text-center">
        <LoaderCircle className="mx-auto animate-spin text-[var(--green)]" size={30} />
        <p className="eyebrow mt-4 text-[var(--ink-soft)]">Carregando seu radar</p>
      </div>
    </main>
  );
}
