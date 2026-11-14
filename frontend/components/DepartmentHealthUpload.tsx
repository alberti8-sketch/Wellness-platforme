'use client'

import { FormEvent, useState } from 'react'
import axios from 'axios'
import { apiUrl, DatasetSummary } from '@/lib/department-health'

export default function DepartmentHealthUpload({ tenantId }: { tenantId: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function upload(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!tenantId.trim() || !file) {
      setError('Enter your Tenant ID above and select a CNAM .xls or .xlsx workbook.')
      return
    }
    setBusy(true)
    const form = new FormData()
    form.append('tenant_id', tenantId.trim())
    form.append('file', file)
    try {
      const { data } = await axios.post<DatasetSummary>(`${apiUrl}/api/department-health/upload`, form)
      sessionStorage.setItem('departmentHealthTenant', tenantId.trim())
      setMessage(`Saved ${data.year} dataset: ${data.source_name}. Open the dashboard and load this tenant's datasets.`)
    } catch (cause: unknown) {
      setError(
        axios.isAxiosError<{ detail: string }>(cause) && typeof cause.response?.data.detail === 'string'
          ? cause.response.data.detail
          : 'Could not upload the workbook. Check the backend connection and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card border-blue-200">
      <h2 className="text-xl font-bold mb-2">French Department Health Workbook</h2>
      <p className="text-sm text-gray-600 mb-4">
        Upload the CNAM Tableau 7 format (.xls or .xlsx) with departments, Hommes, Femmes and 65+ columns.
        Cities are linked through their department codes. Each upload is a separate persisted snapshot, never an added total.
        This uses the Tenant ID entered in Organization Info.
      </p>
      <form onSubmit={upload} className="flex flex-wrap gap-4 items-center">
        <input aria-label="CNAM department health workbook" type="file" accept=".xls,.xlsx" required onChange={event => {
          setFile(event.target.files?.[0] ?? null)
          setMessage('')
          setError('')
        }} />
        <button className="primary-btn disabled:opacity-50" disabled={busy}>{busy ? 'Uploading...' : 'Upload Department Data'}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 text-green-700">{message} <a className="underline" href="/dashboard">View dashboard</a></p>}
    </section>
  )
}
