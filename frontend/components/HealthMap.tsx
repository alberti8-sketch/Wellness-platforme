'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import { metricLabels, scoreColor, Territory, TerritoryMetric } from '@/lib/territories'
import { Count, countColor, formatCount } from '@/lib/department-health'

interface HealthMapProps {
  territories: Territory[]
  metric: TerritoryMetric
  onSelectRegion: (territory: Territory) => void
  health?: { label: string; year: number; counts: Record<string, Count | undefined> }
}

function FitTerritories({ territories }: { territories: Territory[] }) {
  const map = useMap()

  useEffect(() => {
    if (territories.length) {
      map.fitBounds(
        latLngBounds(territories.map(territory => [territory.latitude, territory.longitude])),
        { padding: [40, 40], maxZoom: 11 },
      )
    }
  }, [map, territories])

  return null
}

export default function HealthMap({ territories, metric, onSelectRegion, health }: HealthMapProps) {
  const maximum = Math.max(0, ...territories.map(territory => {
    const count = health?.counts[territory.department_code]
    return typeof count === 'number' ? count : 0
  }))
  return (
    <MapContainer
      center={[46.6, 2.2]}
      zoom={6}
      scrollWheelZoom={false}
      style={{ height: '500px', borderRadius: '8px' }}
      aria-label="WP25 eight-city territory map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTerritories territories={territories} />
      {territories.map(territory => (
        <CircleMarker
          key={territory.id}
          center={[territory.latitude, territory.longitude]}
          radius={12}
          pathOptions={{
            color: health ? countColor(health.counts[territory.department_code], maximum) : scoreColor(territory[metric]),
            fillColor: health ? countColor(health.counts[territory.department_code], maximum) : scoreColor(territory[metric]),
            fillOpacity: 0.8,
            weight: 2,
          }}
          eventHandlers={{ click: () => onSelectRegion(territory) }}
        >
          <Tooltip permanent direction="top">{territory.city}</Tooltip>
          <Popup>
            <strong>{territory.city}</strong>
            <p>Workbook postal code: {territory.source_postal_code}</p>
            <p>Department: {territory.department_code}</p>
            {health
              ? <p>{health.label} ({health.year}): {formatCount(health.counts[territory.department_code])} people in department</p>
              : <p>{metricLabels[metric]}: {territory[metric]} / 100</p>}
            <p>Approximate city centre, not an administrative boundary.</p>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
