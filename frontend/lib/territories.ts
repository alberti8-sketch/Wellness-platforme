// WP25 reference cities (sheet CITY), bundled from frontend/data/wp25-territories.json.
// Scores stay on their source 0–100 scale (not the platform's 1–10 bands).
import data from '@/data/wp25-territories.json'

export type TerritoryMetric = 'sport' | 'environment' | 'health_care' | 'global_score'

export interface Territory {
  id: string
  city: string
  source_city: string
  source_postal_code: string
  department_code: string
  latitude: number
  longitude: number
  sport: number
  environment: number
  health_care: number
  global_score: number
}

export const territories: Territory[] = data as Territory[]

// Key order = column order of the WP25 sheet (SPORT, ENVIRONMENT, HEALTH CARE, Global score).
export const metricLabels: Record<TerritoryMetric, string> = {
  sport: 'Sport',
  environment: 'Environment',
  health_care: 'Health care',
  global_score: 'Global score',
}

/** 0 → red, 50 → yellow, 100 → green: matches the legend gradient hsl(0…120, 70%, 38%). */
export function scoreColor(score: number): string {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0))
  return `hsl(${Math.round(clamped * 1.2)}, 70%, 38%)`
}
