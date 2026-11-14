// CNAM department-level counts (Tableau 7: people per pathology / treatment, by cohort).
// Values are department COUNTS, not prevalences; "<10" is a suppressed small count; null = not reported.
import reference from '@/data/department-health-2024.json'

export type Cohort = 'men' | 'women' | 'age65plus'
export type Count = number | '<10' | null

export const cohortLabels: Record<Cohort, string> = {
  men: 'Men',
  women: 'Women',
  age65plus: 'Age 65+',
}

export interface Condition {
  id: string
  label: string
  is_total: boolean
}

export interface DepartmentDataset {
  dataset_id?: string
  year: number
  source_name: string
  source_level: string
  sheets: string[]
  conditions: Condition[]
  /** department code → condition id → cohort → count */
  departments: Record<string, Record<string, Partial<Record<Cohort, Count>>>>
}

/** Item of GET /api/department-health (backend app/routers/department_health.py). */
export interface DatasetSummary {
  dataset_id: string
  source_name: string
  year: number
  created_at: string
}

/** Bundled 2024 reference workbook, rebuilt by backend/scripts/build_reference_data.py. */
export const referenceHealth: DepartmentDataset = reference as unknown as DepartmentDataset

export function formatCount(count: Count | undefined): string {
  if (count === null || count === undefined) return 'Not reported'
  if (count === '<10') return '<10 (suppressed)'
  return count.toLocaleString('fr-FR')
}

/** Blue intensity relative to the largest visible count; purple = "<10"; grey = not reported. */
export function countColor(count: Count | undefined, maximum: number): string {
  if (count === '<10') return '#7c3aed'
  if (typeof count !== 'number') return '#9ca3af'
  const ratio = maximum > 0 ? Math.min(1, count / maximum) : 0
  return `hsl(217, 80%, ${Math.round(80 - ratio * 50)}%)`
}
