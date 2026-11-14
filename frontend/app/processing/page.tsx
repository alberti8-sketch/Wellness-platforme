'use client'

import React, { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Clock, Database } from 'lucide-react'

interface InspectionRecord {
  pincode: string
  city: string
  indicator: string
  raw_value: number
  normalized_score: number
  classification: string
  anomaly_flags: string[]
}

interface ProcessingStatus {
  current_step: number
  total_steps: number
  status: string
  processed_records: number
}

export default function ProcessingPage() {
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    current_step: 3,
    total_steps: 4,
    status: 'processing',
    processed_records: 156
  })
  
  const [inspectionData, setInspectionData] = useState<InspectionRecord[]>([
    {
      pincode: '110001',
      city: 'Delhi',
      indicator: 'Physical Activity',
      raw_value: 45.5,
      normalized_score: 5,
      classification: 'medium',
      anomaly_flags: []
    },
    {
      pincode: '110002',
      city: 'Delhi',
      indicator: 'Nutrition',
      raw_value: 85.0,
      normalized_score: 10,
      classification: 'good',
      anomaly_flags: []
    },
    {
      pincode: '110003',
      city: 'Delhi',
      indicator: 'Environment',
      raw_value: 25.0,
      normalized_score: 0,
      classification: 'critical',
      anomaly_flags: ['Low environmental quality']
    },
  ])

  const [approved, setApproved] = useState(false)

  const handleApprove = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/processing/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processing_id: 'job-001',
          approve: true,
          approval_notes: 'Dataset approved after review',
          approver_id: 'admin-001'
        })
      })
      
      if (response.ok) {
        setApproved(true)
      }
    } catch (error) {
      console.error('Approval error:', error)
    }
  }

  const getStepStatus = (step: number) => {
    if (step < processingStatus.current_step) return 'completed'
    if (step === processingStatus.current_step) return 'active'
    return 'pending'
  }

  const stepDescriptions = {
    1: 'Ingestion & Tenant Isolation',
    2: 'Cleaning & Normalization',
    3: 'Aggregation & Indexing',
    4: 'Output Generation'
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">🔄 Data Processing Hub</h1>
        <p className="text-gray-600">Real-time pipeline execution and data approval</p>
      </div>

      {/* Pipeline Status */}
      <div className="card">
        <h2 className="text-xl font-bold mb-6">Pipeline Execution Status</h2>
        
        <div className="space-y-6">
          {/* Progress Steps */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold">Pipeline Progress</span>
              <span className="text-sm text-gray-600">
                Step {processingStatus.current_step}/{processingStatus.total_steps}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              {Array.from({ length: 4 }).map((_, i) => {
                const step = i + 1
                const status = getStepStatus(step)
                
                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 font-semibold text-white ${
                        status === 'completed' ? 'bg-success' :
                        status === 'active' ? 'bg-primary animate-pulse' :
                        'bg-gray-300'
                      }`}>
                        {status === 'completed' ? '✓' : step}
                      </div>
                      <p className="text-xs text-center text-gray-600 font-medium max-w-[80px]">
                        {stepDescriptions[step as keyof typeof stepDescriptions]}
                      </p>
                    </div>
                    
                    {i < 3 && (
                      <div className={`flex-shrink-0 h-1 w-8 mb-8 ${
                        status === 'completed' ? 'bg-success' : 'bg-gray-300'
                      }`} />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {/* Current Status */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Currently Processing</p>
              <p className="text-sm text-blue-700 mt-1">
                Aggregating {processingStatus.processed_records} records into composite wellness scores...
              </p>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-sm text-gray-600">Processed Records</p>
              <p className="text-2xl font-bold text-primary">{processingStatus.processed_records}</p>
            </div>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-sm text-gray-600">Valid Records</p>
              <p className="text-2xl font-bold text-success">150</p>
            </div>
            <div className="bg-gray-50 rounded p-4 border border-gray-200">
              <p className="text-sm text-gray-600">Records with Warnings</p>
              <p className="text-2xl font-bold text-warning">6</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Inspection Table */}
      <div className="card">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Inspection & Validation
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Pincode</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">City</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Indicator</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Raw Value</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Normalized</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Classification</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {inspectionData.map((record, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-900">{record.pincode}</td>
                  <td className="px-4 py-3 text-gray-900">{record.city}</td>
                  <td className="px-4 py-3 text-gray-700">{record.indicator}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{record.raw_value}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">{record.normalized_score}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      record.classification === 'good' ? 'bg-green-100 text-green-800' :
                      record.classification === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {record.classification.charAt(0).toUpperCase() + record.classification.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {record.anomaly_flags.length > 0 ? (
                      <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                        ⚠️ {record.anomaly_flags.length}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing 3 of 156 records. <a href="#" className="text-primary hover:underline">View all →</a>
        </div>
      </div>

      {/* Approval Section */}
      <div className={`card border-2 ${approved ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-start gap-4">
          {approved ? (
            <>
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-green-900">✅ Dataset Approved</h3>
                <p className="text-sm text-green-700 mt-1">
                  This dataset has been reviewed and approved. It is now available in the dashboard.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-bold text-amber-900">Approval Required</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Review the processed data above and approve it for use in analytics.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={handleApprove}
                    className="primary-btn"
                  >
                    ✓ Approve Dataset
                  </button>
                  <button className="secondary-btn">
                    ✗ Reject & Return
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Approved Datasets List */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4">Recently Approved Datasets</h2>
        <div className="space-y-3">
          <div className="p-4 bg-gray-50 rounded border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Delhi Health Survey 2024</p>
                <p className="text-sm text-gray-600">156 records • Approved 2 hours ago</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Approved
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
