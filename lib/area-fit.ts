import taxonomy from "@/config/area-taxonomy.json";

export type AreaFit = "tech" | "general" | "non_tech" | "ambiguous";
export interface AreaDecision { area_fit: AreaFit; area_reasons: string[]; primary_area: string; area_tags: string[] }

const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hits = (text: string, terms: string[]) => terms.filter((term) => new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(term)}($|[^\\p{L}\\p{N}_])`, "u").test(text));

export function classifyArea(title: string, description = ""): AreaDecision {
  const normalizedTitle = plain(title);
  const normalizedContent = plain(`${title} ${description}`);
  const strongHits = hits(normalizedContent, taxonomy.tech_strong);
  const titleHits = hits(normalizedTitle, taxonomy.tech_title);
  const skillHits = hits(normalizedContent, taxonomy.tech_skills);
  const positive = [...strongHits, ...titleHits];
  const tags = detectAreaCategories(title, description);
  if (positive.length || skillHits.length >= 2) {
    return { area_fit: "tech", area_reasons: (positive.length ? positive : skillHits).slice(0, 4).map((term) => `sinal tecnológico: ${term}`), primary_area: tags[0] || "ambiguous", area_tags: tags };
  }
  const negativeHits = hits(normalizedContent, taxonomy.non_tech);
  const negativeTitleHits = hits(normalizedTitle, taxonomy.non_tech);
  const generalHits = hits(normalizedTitle, taxonomy.general_program);
  if (generalHits.length && !negativeTitleHits.length) return { area_fit: "general", area_reasons: ["programa geral com trilhas ainda não definidas"], primary_area: "general", area_tags: ["general"] };
  if (negativeHits.length) return { area_fit: "non_tech", area_reasons: negativeHits.slice(0, 4).map((term) => `área fora do foco: ${term}`), primary_area: tags[0] || "ambiguous", area_tags: tags };
  const ambiguousHits = hits(normalizedContent, taxonomy.ambiguous);
  return { area_fit: "ambiguous", area_reasons: ambiguousHits.length ? ambiguousHits.slice(0, 3).map((term) => `área ambígua: ${term}`) : ["área tecnológica não confirmada"], primary_area: tags[0] || "ambiguous", area_tags: tags };
}

export function detectAreaCategories(title: string, description = "") {
  const content = plain(`${title} ${description}`);
  const found = Object.entries(taxonomy.categories).filter(([, terms]) => hits(content, terms).length > 0).map(([name]) => name);
  const tech = found.filter((name) => ["data_ai", "software", "qa", "product_design", "infra_cloud_security"].includes(name));
  return [...tech, ...found.filter((name) => !tech.includes(name))];
}
