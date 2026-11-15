/**
 * Main menu, in discovery order. Secondary pages (method & weighting, data management, CNAM reference)
 * stay reachable from contextual links, not from the menu.
 */
export const STEPS = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/assistant", label: "Solutions" },
  { href: "/carte", label: "Carte de France" },
  { href: "/prediction", label: "Prédire le diabète" },
];

/** Pages about one commune: the menu keeps the current commune (?ville=) when moving between them. */
export const CITY_PAGES = new Set(["/dashboard", "/assistant"]);
