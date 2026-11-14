"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import L, { type Layer, type PathOptions } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Pane, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { TerritoryCollection, TerritoryProps } from "@/lib/geo";
import { NO_DATA } from "@/lib/communes";

export interface MapPoint {
  code: string;
  name: string;
  lat: number;
  lon: number;
  population: number;
  color: string | null;
  display: string;
}

export interface DeptValue {
  name: string;
  color: string | null;
  display: string;
}

type Props = {
  /** Commune circles (commune-level indicator) … */
  points: MapPoint[] | null;
  /** … or a department choropleth (department-level indicator). */
  departements: TerritoryCollection | null;
  deptValues: Record<string, DeptValue> | null;
  metricLabel: string;
  selected: string | null;
  onSelect: (code: string | null) => void;
};

const ESRI_GRAY = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ESRI_GRAY_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Fond &copy; Esri, HERE, Garmin, &copy; contributeurs OpenStreetMap";
const FRANCE_BOUNDS = L.latLngBounds([39.8, -9.5], [52.6, 13.8]);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const tip = (name: string, label: string, value: string) =>
  `<strong>${escapeHtml(name)}</strong><br/><span style="color:#61656E">${escapeHtml(label)}</span> : <strong>${escapeHtml(value)}</strong>`;

/** Circle radius from population, growing with the zoom level. */
function radius(pop: number, zoom: number) {
  const base = Math.min(16, 2.4 + Math.sqrt(pop) / 75);
  return Math.min(48, base * 2 ** ((zoom - 6) * 0.45));
}

/** All commune circles on one canvas (thousands of markers stay fluid). */
function CircleLayer({ points, label, selected, onSelect }: { points: MapPoint[]; label: string; selected: string | null; onSelect: (code: string) => void }) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ padding: 0.3 }), []);
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const group = L.layerGroup();
    // No-data first, then big communes below small ones so every circle stays visible.
    const rank = (p: MapPoint) => (p.code === selected ? 2 : p.color ? 1 : 0);
    const ordered = [...points].sort((a, b) => rank(a) - rank(b) || b.population - a.population);
    for (const p of ordered) {
      const m = L.circleMarker([p.lat, p.lon], {
        renderer,
        radius: p.color ? radius(p.population, zoom) : Math.max(1.6, radius(p.population, zoom) * 0.45),
        fillColor: p.color ?? NO_DATA,
        fillOpacity: p.color ? 0.92 : 0.5,
        color: p.code === selected ? "#15171C" : "#FFFFFF",
        weight: p.code === selected ? 3 : p.color ? 0.8 : 0,
      });
      m.bindTooltip(tip(p.name, label, p.display), { direction: "top", className: "pin-tip", opacity: 1 });
      m.on("click", () => select.current(p.code));
      group.addLayer(m);
    }
    group.addTo(map);
    return () => {
      group.remove();
    };
  }, [map, renderer, points, zoom, label, selected]);
  return null;
}

/** Zoom on the selection (commune or department); whole France otherwise. */
function FitView({ target, departements, outline }: { target: string | null; departements: TerritoryCollection | null; outline: FeatureCollection | null }) {
  const map = useMap();
  const point = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (target && target.startsWith("@")) {
      const [lat, lon] = target.slice(1).split(",").map(Number);
      point.current = [lat, lon];
      map.flyTo([lat, lon], Math.max(map.getZoom(), 11), { duration: 0.8 });
      return;
    }
    const dept = target ? departements?.features.find((f) => f.properties.code === target) : undefined;
    if (dept) {
      map.flyToBounds(L.geoJSON(dept).getBounds(), { padding: [60, 60], maxZoom: 9, duration: 0.8 });
      return;
    }
    if (!target && outline) map.fitBounds(L.geoJSON(outline).getBounds(), { paddingTopLeft: [340, 20], paddingBottomRight: [20, 20] });
  }, [map, target, departements, outline]);
  return null;
}

export default function DomainMap({ points, departements, deptValues, metricLabel, selected, onSelect }: Props) {
  const [mask, setMask] = useState<FeatureCollection | null>(null);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    Promise.all([fetch("/geo/france-mask.geojson").then((r) => r.json()), fetch("/geo/france-outline.geojson").then((r) => r.json())])
      .then(([m, o]) => {
        setMask(m);
        setOutline(o);
      })
      .catch(() => undefined);
  }, []);

  const sel = points?.find((p) => p.code === selected) ?? null;
  // Target for FitView: "@lat,lon" for a commune, the code for a department.
  const target = sel ? `@${sel.lat},${sel.lon}` : deptValues && selected ? selected : null;

  const deptKey = useMemo(() => JSON.stringify([metricLabel, selected, deptValues && Object.values(deptValues).map((v) => v.color)]), [metricLabel, selected, deptValues]);
  const deptStyle = (f?: Feature<Geometry, TerritoryProps>): PathOptions => {
    const v = f && deptValues ? deptValues[f.properties.code] : undefined;
    const on = f?.properties.code === selected;
    return { fillColor: v?.color ?? NO_DATA, fillOpacity: 0.88, color: on ? "#15171C" : "#FFFFFF", weight: on ? 2.5 : 0.8 };
  };
  const onEachDept = (f: Feature<Geometry, TerritoryProps>, layer: Layer) => {
    const v = deptValues?.[f.properties.code];
    layer.bindTooltip(tip(f.properties.nom, metricLabel, v?.display ?? "—"), { sticky: true, direction: "top", className: "pin-tip", opacity: 1 });
    layer.on({
      click: () => onSelect(f.properties.code),
      mouseover: (e) => (e.target as L.Path).setStyle({ weight: 2.5, color: "#15171C" }),
      mouseout: (e) => (e.target as L.Path).setStyle(deptStyle(f)),
    });
  };

  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={6}
      minZoom={5}
      maxZoom={15}
      zoomSnap={0.25}
      zoomControl={false}
      maxBounds={FRANCE_BOUNDS}
      maxBoundsViscosity={0.9}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer url={ESRI_GRAY} attribution={ESRI_ATTRIBUTION} maxZoom={16} />
      <Pane name="france-mask" style={{ zIndex: 350 }}>
        {mask && <GeoJSON data={mask} interactive={false} style={{ stroke: false, fillColor: "#E4E4E0", fillOpacity: 0.75 }} />}
        {outline && <GeoJSON data={outline} interactive={false} style={{ color: "#8A8D94", weight: 1, opacity: 0.8, fill: false }} />}
      </Pane>
      {departements && deptValues && (
        <GeoJSON key={deptKey} data={departements} style={deptStyle as L.StyleFunction} onEachFeature={onEachDept as (f: Feature, l: Layer) => void} />
      )}
      {departements && !deptValues && (
        <GeoJSON data={departements} interactive={false} style={{ color: "#8A8D94", weight: 0.5, opacity: 0.5, fill: false }} />
      )}
      {points && <CircleLayer points={points} label={metricLabel} selected={selected} onSelect={onSelect} />}
      <Pane name="labels" style={{ zIndex: 460, pointerEvents: "none" }}>
        <TileLayer url={ESRI_GRAY_LABELS} maxZoom={16} pane="labels" />
      </Pane>
      <ZoomButtons />
      <FitView target={target} departements={departements} outline={outline} />
    </MapContainer>
  );
}

function ZoomButtons() {
  const map = useMap();
  useEffect(() => {
    const z = L.control.zoom({ position: "bottomright", zoomInTitle: "Zoomer", zoomOutTitle: "Dézoomer" });
    z.addTo(map);
    return () => {
      z.remove();
    };
  }, [map]);
  return null;
}
