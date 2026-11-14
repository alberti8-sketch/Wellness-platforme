'use client'

import { FormEvent, useState } from 'react'
import { DatasetSummary } from '@/lib/department-health'
import { api } from '@/lib/api'
import { useSession } from '@/components/session'

export default function DepartmentHealthUpload() {
  const { me, ready } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function upload(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!ready || !me || me.role === 'viewer' || !file) {
      setError('Connect with an account allowed to upload, and select a CNAM .xls or .xlsx workbook.')
      return
    }
    setBusy(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const data = await api.post<DatasetSummary>('/api/department-health/upload', form)
      setMessage(`Saved ${data.year} dataset: ${data.source_name}. Open the WP25 dashboard and select the uploaded workbook.`)
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
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
        This uses your signed-in account and its permitted departments.
      </p>
      <form onSubmit={upload} className="flex flex-wrap gap-4 items-center">
        <input aria-label="CNAM department health workbook" type="file" accept=".xls,.xlsx" required onChange={event => {
          setFile(event.target.files?.[0] ?? null)
          setMessage('')
          setError('')
        }} />
        <button className="primary-btn disabled:opacity-50" disabled={busy || !ready || me?.role === 'viewer'}>{busy ? 'Uploading...' : 'Upload Department Data'}</button>
      </form>
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 text-green-700">{message} <a className="underline" href="/dashboard">View dashboard</a></p>}
    </section>
  )
}
