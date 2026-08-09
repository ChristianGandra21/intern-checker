import { ProfileWorkspace } from "@/components/profile-workspace";
import { hasDatabaseConfig } from "@/lib/supabase";

export default function ProfilePage() {
  return <main id="conteudo" className="shell pb-20 pt-10"><div className="mb-8 max-w-3xl"><p className="eyebrow text-[var(--green)]">Aderência ao perfil</p><p className="mt-3 text-lg leading-relaxed text-[var(--ink-soft)]">Transforme seus objetivos e experiências em um ranking explicável — com IA apenas quando você autorizar.</p></div><ProfileWorkspace databaseConfigured={hasDatabaseConfig()} /></main>;
}
