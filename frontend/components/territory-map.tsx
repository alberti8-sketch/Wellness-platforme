"use client";

import type { Feature, Geometry } from "geojson";
import L, { type Layer, type PathOptions } from "leaflet";
import { useEffect, useMemo } from "react";
import { CircleMarker, GeoJSON, LayerGroup, LayersControl, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { BAND_META, NO_DATA_COLOR, fmt } from "@/lib/bands";
import type { TerritoryCollection, TerritoryProps } from "@/lib/geo";
import type { BandCode } from "@/lib/types";

export interface MapValue {
  name: string;
  score: number | null;
  band: BandCode | null;
  detail?: string;
}

type Props = {
  departements: TerritoryCollection | null;
  shapes: TerritoryCollection;
  values: Record<string, MapValue>;
  selected: string | null;
  onSelect: (code: string) => void;
  metricLabel: string;
};

/** Géoplateforme IGN (WMTS, open licence, no key) — French official basemaps. */
const ign = (layer: string, format: "png" | "jpeg") =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
const IGN_ATTRIBUTION = '&copy; <a href="https://geoservices.ign.fr/">IGN</a> – Géoplateforme';

function FitToData({ shapes }: { shapes: TerritoryCollection }) {
  const map = useMap();
  const key = shapes.features.map((f) => f.properties.code).sort().join(",");
  useEffect(() => {
    if (!shapes.features.length) return;
    const b = L.geoJSON(shapes).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [32, 32], maxZoom: 11 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function TerritoryMap({ departements, shapes, values, selected, onSelect, metricLabel }: Props) {
  // GeoJSON layers are not reactive in react-leaflet: remount when the styling inputs change.
  const layerKey = useMemo(
    () => JSON.stringify([selected, metricLabel, shapes.features.length, Object.entries(values).map(([k, v]) => [k, v.score])]),
    [values, selected, metricLabel, shapes],
  );

  const style = (f?: Feature<Geometry, TerritoryProps>): PathOptions => {
    const v = f ? values[f.properties.code] : undefined;
    const isSel = f?.properties.code === selected;
    return {
      fillColor: v?.band ? BAND_META[v.band].color : NO_DATA_COLOR,
      fillOpacity: isSel ? 0.75 : 0.55,
      color: isSel ? "#0b0b0b" : "#ffffff",
      weight: isSel ? 3 : 1.5,
    };
  };

  const tooltipHtml = (code: string, nom: string) => {
    const v = values[code];
    if (!v) return `${escapeHtml(nom)} (${code})`;
    return `<strong>${escapeHtml(nom)}</strong> (${code})<br/>${escapeHtml(metricLabel)} : <strong>${fmt(v.score)}</strong> / 10 · ${
      v.band ? BAND_META[v.band].label : "non calculé"
    }${v.detail ? `<br/><span style="color:#52514e">${escapeHtml(v.detail)}</span>` : ""}`;
  };

  const onEach = (f: Feature<Geometry, TerritoryProps>, layer: Layer) => {
    layer.bindTooltip(tooltipHtml(f.properties.code, f.properties.nom), { sticky: true, direction: "top", opacity: 0.95 });
    layer.on({
      click: () => onSelect(f.properties.code),
      mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, color: "#1f3a5f" }),
      mouseout: (e) => (e.target as L.Path).setStyle(style(f)),
    });
  };

  // Centroid markers keep small territories (communes, Paris…) visible and clickable at national zoom.
  const centroids = useMemo(
    () =>
      shapes.features
        .filter((f) => values[f.properties.code])
        .map((f) => ({ code: f.properties.code, nom: f.properties.nom, center: L.geoJSON(f).getBounds().getCenter() })),
    [shapes, values],
  );

  return (
    <MapContainer center={[46.6, 2.4]} zoom={6} zoomSnap={0.25} scrollWheelZoom className="h-full w-full rounded-lg" attributionControl>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Plan IGN (couleurs)">
          <TileLayer url={ign("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "png")} attribution={IGN_ATTRIBUTION} maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Photo satellite (IGN)">
          <TileLayer url={ign("ORTHOIMAGERY.ORTHOPHOTOS", "jpeg")} attribution={IGN_ATTRIBUTION} maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Sans fond">
          <LayerGroup />
        </LayersControl.BaseLayer>
        {departements && (
          <LayersControl.Overlay checked name="Limites départementales">
            <GeoJSON data={departements} interactive={false} style={{ color: "#52514e", weight: 0.6, opacity: 0.5, fillColor: "#f0efec", fillOpacity: 0.05 }} />
          </LayersControl.Overlay>
        )}
      </LayersControl>

      <GeoJSON key={layerKey} data={shapes} style={style as L.StyleFunction} onEachFeature={onEach as (f: Feature, l: Layer) => void} />

      {centroids.map(({ code, nom, center }) => {
        const v = values[code];
        return (
          <CircleMarker
            key={`${layerKey}-${code}`}
            center={center}
            radius={code === selected ? 9 : 7}
            pathOptions={{ fillColor: v.band ? BAND_META[v.band].color : NO_DATA_COLOR, fillOpacity: 1, color: code === selected ? "#0b0b0b" : "#ffffff", weight: 2 }}
            eventHandlers={{ click: () => onSelect(code) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <strong>{nom}</strong> · {fmt(v.score)} / 10 · {v.band ? BAND_META[v.band].label : "non calculé"}
            </Tooltip>
          </CircleMarker>
        );
      })}
      <FitToData shapes={shapes} />
    </MapContainer>
  );
}
