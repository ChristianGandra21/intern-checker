import type { Job, UserProfile } from "./types";

export interface AreaPreferences { excluded_area_categories: string[]; excluded_area_terms: string[] }
export const emptyAreaPreferences: AreaPreferences = { excluded_area_categories: [], excluded_area_terms: [] };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function isVisibleForPreferences(job: Job, preferences: AreaPreferences) {
  if (job.primary_area === "general") return true;
  if (job.primary_area && preferences.excluded_area_categories.includes(job.primary_area)) return false;
  const haystack = normalize(`${job.title} ${job.description} ${job.company}`);
  return !preferences.excluded_area_terms.some((term) => term.trim() && haystack.includes(normalize(term.trim())));
}

export function preferencesFromProfile(profile: Partial<UserProfile> | null | undefined): AreaPreferences {
  return {
    excluded_area_categories: profile?.excluded_area_categories || [],
    excluded_area_terms: profile?.excluded_area_terms || [],
  };
}
