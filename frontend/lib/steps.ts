/**
 * The app is a 4-step journey for a newcomer. Secondary pages (method & weighting, data
 * management, CNAM reference) stay reachable from contextual links, not from the menu.
 */
export const STEPS = [
  { href: "/dashboard", label: "Vue d'ensemble", hint: "Où en sont les villes ?" },
  { href: "/carte", label: "Carte", hint: "Situer une ville" },
  { href: "/classement", label: "Comparer", hint: "Mettre des villes côte à côte" },
  { href: "/prediction", label: "Prédire", hint: "Anticiper les maladies" },
];
