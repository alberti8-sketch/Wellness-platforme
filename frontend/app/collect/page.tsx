'use client'

import React, { useRef, useState } from 'react'
import { FileUp, AlertCircle, CheckCircle } from 'lucide-react'
import axios from 'axios'
import DepartmentHealthUpload from '@/components/DepartmentHealthUpload'

interface UploadStatus {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message: string
  jobId?: string
}

export default function CollectPage() {
  const [formData, setFormData] = useState({
    tenantId: '',
    tenantName: '',
    regionCode: 'IN-DL',
    userRole: 'corporate'
  })
  
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ status: 'idle', message: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.xlsx')) {
        setUploadStatus({ status: 'error', message: 'Only .xlsx files are supported' })
        return
      }
      setSelectedFile(file)
      setUploadStatus({ status: 'idle', message: '' })
    }
  }

  const handleDragDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (!file.name.endsWith('.xlsx')) {
        setUploadStatus({ status: 'error', message: 'Only .xlsx files are supported' })
        return
      }
      setSelectedFile(file)
      setUploadStatus({ status: 'idle', message: '' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.tenantId || !formData.tenantName) {
      setUploadStatus({ status: 'error', message: 'Please fill in all required fields' })
      return
    }
    
    if (!selectedFile) {
      setUploadStatus({ status: 'error', message: 'Please select an Excel file' })
      return
    }

    setUploadStatus({ status: 'uploading', message: 'Processing your data...' })

    try {
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('tenant_id', formData.tenantId)
      form.append('tenant_name', formData.tenantName)
      form.append('region_code', formData.regionCode)

      const response = await axios.post('http://localhost:8000/api/ingest/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      setUploadStatus({
        status: 'success',
        message: `✅ Upload successful! Job ID: ${response.data.job_id}`,
        jobId: response.data.job_id
      })
    } catch (error: any) {
      setUploadStatus({
        status: 'error',
        message: error.response?.data?.detail || 'Upload failed. Please try again.'
      })
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">📊 Data Collection Portal</h1>
        <p className="text-gray-600">Upload health indicator data in bulk using Excel files</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="md:col-span-1">
          <div className="card">
            <h2 className="text-xl font-bold mb-6">Organization Info</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tenant ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="tenantId"
                  value={formData.tenantId}
                  onChange={handleFormChange}
                  placeholder="e.g., ORG-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="tenantName"
                  value={formData.tenantName}
                  onChange={handleFormChange}
                  placeholder="e.g., Health Ministry"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Region Code
                </label>
                <select
                  name="regionCode"
                  value={formData.regionCode}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="IN-DL">Delhi (IN-DL)</option>
                  <option value="IN-MH">Maharashtra (IN-MH)</option>
                  <option value="IN-KA">Karnataka (IN-KA)</option>
                  <option value="IN-TN">Tamil Nadu (IN-TN)</option>
                  <option value="IN-GJ">Gujarat (IN-GJ)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  User Role
                </label>
                <select
                  name="userRole"
                  value={formData.userRole}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="corporate">Corporate Wellness Officer (B2B)</option>
                  <option value="government">Government Health Official (B2G)</option>
                  <option value="ngo">NGO Health Worker</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={uploadStatus.status === 'uploading'}
                className="w-full primary-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadStatus.status === 'uploading' ? 'Processing...' : 'Upload & Process'}
              </button>
            </form>
          </div>
          <DepartmentHealthUpload tenantId={formData.tenantId} />
        </div>

        {/* File Upload Section */}
        <div className="md:col-span-2 space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDragDrop}
            className="card border-2 border-dashed border-gray-300 hover:border-primary transition cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-center py-12">
              <FileUp className="mx-auto w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Drop Excel file here</h3>
              <p className="text-gray-600 mb-4">or click to select file</p>
              <p className="text-sm text-gray-500">Supported format: .xlsx only</p>
              {selectedFile && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800">
                  ✓ File selected: {selectedFile.name}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Status Messages */}
          {uploadStatus.status === 'success' && (
            <div className="card bg-green-50 border-green-200 flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-green-900">{uploadStatus.message}</h4>
                <p className="text-sm text-green-700 mt-1">
                  Proceed to <a href="/processing" className="underline font-semibold">Processing Hub</a> to review and approve data
                </p>
              </div>
            </div>
          )}

          {uploadStatus.status === 'error' && (
            <div className="card bg-red-50 border-red-200 flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-900">Upload Error</h4>
                <p className="text-sm text-red-700 mt-1">{uploadStatus.message}</p>
              </div>
            </div>
          )}

          {/* Template & Guidelines */}
          <div className="card">
            <h3 className="font-semibold mb-4">📋 Excel Template Requirements</h3>
            <div className="bg-gray-50 p-4 rounded space-y-2 text-sm">
              <p><strong>Required Columns:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Pincode</strong> - Geographic pincode identifier</li>
                <li><strong>City</strong> - City name</li>
                <li><strong>PA</strong> - Physical Activity (minutes/week)</li>
                <li><strong>NUT</strong> - Nutrition Score (0-100)</li>
                <li><strong>ENV</strong> - Environmental Quality Index (0-100)</li>
                <li><strong>Disease</strong> - Clinical disease name</li>
                <li><strong>Disease_Prevalence</strong> - Prevalence percentage (%)</li>
              </ul>
              <p className="mt-4">
                <a
                  href="/api/sample-template"
                  className="text-primary font-semibold hover:underline"
                >
                  📥 Download Sample Template
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
