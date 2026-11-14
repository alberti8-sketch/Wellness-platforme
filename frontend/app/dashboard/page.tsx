'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Map } from 'lucide-react'
import dynamic from 'next/dynamic'
import { metricLabels, scoreColor, territories, TerritoryMetric } from '@/lib/territories'
import {
  apiUrl, Cohort, cohortLabels, Count, DatasetSummary, DepartmentDataset,
  formatCount, referenceHealth,
} from '@/lib/department-health'

const MapComponent = dynamic(() => import('@/components/HealthMap'), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-gray-100 rounded" role="status">Loading territory map...</div>,
})

export default function DashboardPage() {
  const [selectedCity, setSelectedCity] = useState('')
  const [metric, setMetric] = useState<TerritoryMetric>('global_score')
  const [mode, setMode] = useState<'wellness' | 'health'>('health')
  const [conditionId, setConditionId] = useState('diabete')
  const [cohort, setCohort] = useState<Cohort>('men')
  const [tenantInput, setTenantInput] = useState('')
  const [tenant, setTenant] = useState('')
  const [reload, setReload] = useState(0)
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [datasetId, setDatasetId] = useState('reference')
  const [healthData, setHealthData] = useState<DepartmentDataset | null>(referenceHealth)
  const [listError, setListError] = useState('')
  const [datasetError, setDatasetError] = useState('')
  const [listing, setListing] = useState(false)

  useEffect(() => {
    const savedTenant = sessionStorage.getItem('departmentHealthTenant')
    if (savedTenant) setTenantInput(savedTenant)
  }, [])

  useEffect(() => {
    if (!tenant) return
    const controller = new AbortController()
    setListing(true)
    setListError('')
    setDatasets([])
    fetch(`${apiUrl}/api/department-health?tenant_id=${encodeURIComponent(tenant)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load tenant datasets.')
        const result: { datasets: DatasetSummary[] } = await response.json()
        setDatasets(result.datasets)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setListError(cause instanceof Error ? cause.message : 'Could not load tenant datasets.')
      })
      .finally(() => { if (!controller.signal.aborted) setListing(false) })
    return () => controller.abort()
  }, [tenant, reload])

  useEffect(() => {
    setDatasetError('')
    if (datasetId === 'reference') {
      setHealthData(referenceHealth)
      setConditionId(current => referenceHealth.conditions.some(condition => condition.id === current && !condition.is_total)
        ? current : 'diabete')
      return
    }
    const controller = new AbortController()
    setHealthData(null)
    fetch(`${apiUrl}/api/department-health/${encodeURIComponent(datasetId)}?tenant_id=${encodeURIComponent(tenant)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load this dataset for the selected tenant.')
        const result: DepartmentDataset = await response.json()
        setHealthData(result)
        setConditionId(current => result.conditions.some(condition => condition.id === current && !condition.is_total)
          ? current : result.conditions.find(condition => !condition.is_total)?.id ?? '')
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setDatasetError(cause instanceof Error ? cause.message : 'Could not load dataset.')
      })
    return () => controller.abort()
  }, [datasetId, tenant])

  const conditions = healthData?.conditions.filter(condition => !condition.is_total) ?? []
  const conditionLabel = conditions.find(condition => condition.id === conditionId)?.label ?? 'Condition not reported'
  const departmentCounts: Record<string, Count | undefined> = Object.fromEntries(
    territories.map(territory => [
      territory.department_code,
      healthData?.departments[territory.department_code]?.[conditionId]?.[cohort],
    ]),
  )
  const visibleTerritories = selectedCity
    ? territories.filter(territory => territory.id === selectedCity)
    : territories
  const selectedTerritory = territories.find(territory => territory.id === selectedCity)
  const average = visibleTerritories.reduce((total, territory) => total + territory[metric], 0) / visibleTerritories.length
  const chartData = mode === 'health'
    ? visibleTerritories.map(territory => ({
        name: territory.city,
        score: typeof departmentCounts[territory.department_code] === 'number' ? departmentCounts[territory.department_code] : null,
      }))
    : selectedTerritory
    ? (Object.keys(metricLabels) as TerritoryMetric[]).map(key => ({
        name: metricLabels[key], score: selectedTerritory[key],
      }))
    : visibleTerritories.map(territory => ({ name: territory.city, score: territory[metric] }))

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">Territory &amp; Population Health Dashboard</h1>
        <p className="text-gray-600">
          Eight French territories from WP25, linked to the CNAM department-level health workbook.
        </p>
      </header>

      <div className="card flex flex-wrap items-end gap-6">
        <label className="text-sm font-medium">
          Map data
          <select aria-label="Map data" className="block mt-1 border rounded p-2" value={mode} onChange={event => setMode(event.target.value as 'wellness' | 'health')}>
            <option value="health">Disease / treatment counts</option>
            <option value="wellness">WP25 source scores</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          City
          <select aria-label="City" className="block mt-1 border rounded p-2" value={selectedCity} onChange={event => setSelectedCity(event.target.value)}>
            <option value="">All eight territories</option>
            {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.city}</option>)}
          </select>
        </label>
        {mode === 'wellness' && <label className="text-sm font-medium">
          Map indicator
          <select aria-label="Map indicator" className="block mt-1 border rounded p-2" value={metric} onChange={event => setMetric(event.target.value as TerritoryMetric)}>
            {(Object.keys(metricLabels) as TerritoryMetric[]).map(key => <option key={key} value={key}>{metricLabels[key]}</option>)}
          </select>
        </label>}
        {mode === 'health' && <>
          <label className="text-sm font-medium">
            Disease / treatment
            <select aria-label="Disease / treatment" className="block mt-1 border rounded p-2 max-w-xs" value={conditionId} onChange={event => setConditionId(event.target.value)}>
              {conditions.map(condition => <option key={condition.id} value={condition.id}>{condition.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Cohort
            <select aria-label="Cohort" className="block mt-1 border rounded p-2" value={cohort} onChange={event => setCohort(event.target.value as Cohort)}>
              {(Object.keys(cohortLabels) as Cohort[]).map(key => <option value={key} key={key}>{cohortLabels[key]}</option>)}
            </select>
          </label>
        </>}
        <p className="text-gray-600">{visibleTerritories.length} territories displayed</p>
        {mode === 'wellness' && <p className="font-semibold">Average {metricLabels[metric].toLowerCase()}: {average.toFixed(1)} / 100</p>}
      </div>

      <section className="card">
        <h2 className="text-xl font-bold mb-3">Health Data Source</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="text-sm font-medium">
            Tenant ID for uploaded workbooks
            <input className="block border rounded p-2 mt-1" value={tenantInput} maxLength={128} onChange={event => setTenantInput(event.target.value)} />
          </label>
          <button className="secondary-btn disabled:opacity-50" disabled={!tenantInput.trim() || listing} onClick={() => {
            const nextTenant = tenantInput.trim()
            setTenant(nextTenant)
            sessionStorage.setItem('departmentHealthTenant', nextTenant)
            setDatasetId('reference')
            setReload(value => value + 1)
          }}>{listing ? 'Loading...' : 'Load Tenant Datasets'}</button>
          <label className="text-sm font-medium">
            Workbook / reporting year
            <select aria-label="Workbook / reporting year" className="block border rounded p-2 mt-1 max-w-sm" value={datasetId} onChange={event => setDatasetId(event.target.value)}>
              <option value="reference">2024 supplied reference workbook</option>
              {datasets.map(dataset => <option key={dataset.dataset_id} value={dataset.dataset_id}>{dataset.year}: {dataset.source_name} ({dataset.created_at})</option>)}
            </select>
          </label>
          <a className="text-blue-700 underline text-sm" href="/collect">Upload another workbook</a>
        </div>
        {listError && <p role="alert" className="text-red-700 mt-3">{listError} The supplied reference remains available; uploaded data was not loaded.</p>}
        {datasetError && <p role="alert" className="text-red-700 mt-3">{datasetError} Select a different workbook or reload the tenant datasets to retry.</p>}
        {tenant && !listing && !listError && !datasets.length && <p className="text-gray-600 mt-3">No uploaded datasets found for {tenant}.</p>}
        {healthData && <p className="text-sm text-gray-500 mt-3 break-all">Source: {healthData.source_name} | Reporting year: {healthData.year}</p>}
        <p className="mt-3 text-sm text-amber-800">
          Counts cover the whole department, not the selected city. No city-level prevalence is inferred.
          Age 65+ includes both sexes and overlaps the men/women counts. Conditions can overlap and must not be summed.
          Blank means not reported / not applicable; &lt;10 remains suppressed.
        </p>
      </section>

      <section className="card">
        <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><Map className="w-5 h-5" />Territory Map</h2>
        {mode === 'health' && !healthData
          ? <p role={datasetError ? 'alert' : 'status'} className="p-8">{datasetError || 'Loading selected workbook...'}</p>
          : <MapComponent territories={visibleTerritories} metric={metric} onSelectRegion={territory => setSelectedCity(territory.id)}
              health={mode === 'health' && healthData ? { label: `${conditionLabel}, ${cohortLabels[cohort]}`, year: healthData.year, counts: departmentCounts } : undefined} />}
        {mode === 'wellness' ? <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <span>{metricLabels[metric]} / 100:</span>
          <span className="inline-block h-3 w-40 rounded" style={{ background: 'linear-gradient(to right, hsl(0,70%,38%), hsl(60,70%,38%), hsl(120,70%,38%))' }} />
          <span>0 to 100 (raw source scores, not clinical health ranks)</span>
        </div> : <p className="mt-4 text-sm text-gray-600">Blue intensity: reported department count (not prevalence or health rank). Purple: &lt;10. Grey: not reported / not applicable. Colours are relative to visible departments.</p>}
        <p className="mt-2 text-sm text-gray-500">Markers use approximate city centres, not territory boundaries. Click a city for details; choose all territories to reset.</p>
      </section>

      {selectedTerritory && mode === 'wellness' && (
        <section className="grid gap-4 sm:grid-cols-4" aria-label={`${selectedTerritory.city} indicators`}>
          {(Object.keys(metricLabels) as TerritoryMetric[]).map(key => (
            <div className="card" key={key}>
              <p className="text-sm text-gray-600">{metricLabels[key]}</p>
              <p className="text-2xl font-bold">{selectedTerritory[key]} <span className="text-sm text-gray-500">/ 100</span></p>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2 className="text-xl font-bold mb-4">{mode === 'health' ? `${conditionLabel}: ${cohortLabels[cohort]} by department` : selectedTerritory ? `${selectedTerritory.city}: source indicators` : `${metricLabels[metric]} by city`}</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} />
            <YAxis domain={mode === 'health' ? [0, 'auto'] : [0, 100]} />
            <Tooltip />
            <Bar dataKey="score" fill="#2563eb" name={mode === 'health' ? 'Department count (people)' : 'Score / 100'} />
          </BarChart>
        </ResponsiveContainer>
        {mode === 'health' && <p className="text-sm text-gray-500 mt-2">Blank and suppressed counts are omitted from bars, not treated as zero. See the table for exact source values.</p>}
      </section>

      <section className="card">
        <h2 className="text-xl font-bold mb-4">Workbook Territory Matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">City</th>
                <th className="px-4 py-3 text-left">Workbook postal code</th>
                {Object.values(metricLabels).map(label => <th className="px-4 py-3 text-right" key={label}>{label} / 100</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleTerritories.map(territory => (
                <tr key={territory.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><button className="text-blue-700 underline" onClick={() => setSelectedCity(territory.id)}>{territory.city}</button></td>
                  <td className="px-4 py-3 font-mono">{territory.source_postal_code}</td>
                  {(Object.keys(metricLabels) as TerritoryMetric[]).map(key => (
                    <td className="px-4 py-3 text-right font-semibold" key={key} style={{ color: scoreColor(territory[key]) }}>{territory[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card border-blue-200">
        <h2 className="text-xl font-bold mb-2">Men, Women &amp; Disease: {conditionLabel}</h2>
        <p className="text-sm text-gray-600 mb-4">Department-level counts for {healthData?.year ?? 'selected dataset'}. These are not city population estimates or percentages.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="p-3 text-left">City reference</th><th className="p-3 text-left">Department</th>
              {Object.values(cohortLabels).map(label => <th className="p-3 text-right" key={label}>{label}</th>)}
            </tr></thead>
            <tbody className="divide-y">
              {visibleTerritories.map(territory => <tr key={territory.id}>
                <td className="p-3">{territory.city}</td><td className="p-3 font-mono">{territory.department_code}</td>
                {(Object.keys(cohortLabels) as Cohort[]).map(key => <td className="p-3 text-right" key={key}>{formatCount(healthData?.departments[territory.department_code]?.[conditionId]?.[key])}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
