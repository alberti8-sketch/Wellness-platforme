"use client";

import type { Feature, Geometry } from "geojson";
import L, { type Layer, type PathOptions } from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from "react-leaflet";
import { BAND_META, NO_DATA_COLOR, fmt } from "@/lib/bands";
import type { DeptCollection } from "@/lib/geo";
import type { BandCode } from "@/lib/types";

export interface MapValue {
  name: string;
  score: number | null;
  band: BandCode | null;
  detail?: string;
}

type Props = {
  geo: DeptCollection;
  values: Record<string, MapValue>;
  selected: string | null;
  onSelect: (code: string) => void;
  metricLabel: string;
};

function FitToData({ geo, codes }: { geo: DeptCollection; codes: string[] }) {
  const map = useMap();
  const key = codes.slice().sort().join(",");
  useEffect(() => {
    const feats = geo.features.filter((f) => codes.includes(f.properties.code));
    const layer = L.geoJSON(feats.length ? ({ ...geo, features: feats } as DeptCollection) : geo);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, geo, key]);
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function TerritoryMap({ geo, values, selected, onSelect, metricLabel }: Props) {
  const codes = Object.keys(values);
  // GeoJSON layers are not reactive in react-leaflet: remount when the styling inputs change.
  const layerKey = useMemo(
    () => JSON.stringify([selected, metricLabel, Object.entries(values).map(([k, v]) => [k, v.score])]),
    [values, selected, metricLabel],
  );

  const style = (f?: Feature<Geometry, { code: string }>): PathOptions => {
    const v = f ? values[f.properties.code] : undefined;
    const isSel = f?.properties.code === selected;
    if (!v) return { fillColor: "#f0efec", fillOpacity: 0.55, color: "#c3c2b7", weight: 0.6 };
    return {
      fillColor: v.band ? BAND_META[v.band].color : NO_DATA_COLOR,
      fillOpacity: isSel ? 0.9 : 0.72,
      color: isSel ? "#0b0b0b" : "#ffffff",
      weight: isSel ? 3 : 1.5,
    };
  };

  const onEach = (f: Feature<Geometry, { code: string; nom: string }>, layer: Layer) => {
    const v = values[f.properties.code];
    const name = escapeHtml(f.properties.nom);
    const body = v
      ? `<strong>${name}</strong> (${f.properties.code})<br/>${escapeHtml(metricLabel)} : <strong>${fmt(v.score)}</strong> / 10 · ${
          v.band ? BAND_META[v.band].label : "non calculé"
        }${v.detail ? `<br/><span style="color:#52514e">${escapeHtml(v.detail)}</span>` : ""}`
      : `${name} (${f.properties.code})<br/><span style="color:#898781">Pas de donnée publiée</span>`;
    layer.bindTooltip(body, { sticky: true, direction: "top", opacity: 0.95 });
    if (v) {
      layer.on({
        click: () => onSelect(f.properties.code),
        mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, color: "#1f3a5f" }),
        mouseout: (e) => (e.target as L.Path).setStyle(style(f)),
      });
    }
  };

  // Centroid markers keep very small territories (e.g. Paris) visible and clickable at national zoom.
  const centroids = useMemo(
    () =>
      geo.features
        .filter((f) => values[f.properties.code])
        .map((f) => ({ code: f.properties.code, nom: f.properties.nom, center: L.geoJSON(f).getBounds().getCenter() })),
    [geo, values],
  );

  return (
    <MapContainer center={[46.6, 2.4]} zoom={6} zoomSnap={0.25} scrollWheelZoom className="h-full w-full rounded-lg" attributionControl>
      {/* No basemap tiles: department outlines give the context, and no request leaves for a third-party tile server. */}
      <GeoJSON key={layerKey} attribution="Contours : IGN Admin Express / france-geojson" data={geo} style={style as L.StyleFunction} onEachFeature={onEach as (f: Feature, l: Layer) => void} />
      {centroids.map(({ code, nom, center }) => {
        const v = values[code];
        return (
          <CircleMarker
            key={`${layerKey}-${code}`}
            center={center}
            radius={code === selected ? 8 : 6}
            pathOptions={{ fillColor: v.band ? BAND_META[v.band].color : NO_DATA_COLOR, fillOpacity: 1, color: code === selected ? "#0b0b0b" : "#ffffff", weight: 2 }}
            eventHandlers={{ click: () => onSelect(code) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <strong>{nom}</strong> · {fmt(v.score)} / 10 · {v.band ? BAND_META[v.band].label : "non calculé"}
            </Tooltip>
          </CircleMarker>
        );
      })}
      <FitToData geo={geo} codes={codes} />
    </MapContainer>
  );
}
