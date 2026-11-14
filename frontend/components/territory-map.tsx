"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import L, { type Layer, type PathOptions } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, LayerGroup, LayersControl, MapContainer, Marker, Pane, TileLayer, Tooltip, useMap } from "react-leaflet";
import { BAND_META, NO_DATA_COLOR, fmt } from "@/lib/bands";
import type { FoodPoint } from "@/lib/context-data";
import type { TerritoryCollection, TerritoryProps } from "@/lib/geo";
import type { BandCode } from "@/lib/types";

export interface MapValue {
  name: string;
  score: number | null;
  band: BandCode | null;
  detail?: string;
  typeLabel?: string | null;
  population?: number | null;
}

type Props = {
  departements: TerritoryCollection | null;
  shapes: TerritoryCollection;
  values: Record<string, MapValue>;
  selected: string | null;
  /** Territories in the comparison (shown with a dark ring and their order number). */
  compared?: string[];
  onSelect: (code: string) => void;
  metricLabel: string;
  /** Optional OpenStreetMap fast-food outlets layer. */
  foodPoints?: FoodPoint[];
};

/** Géoplateforme IGN (WMTS, open licence, no key) — French official basemaps. */
const ign = (layer: string, format: "png" | "jpeg") =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
const IGN_ATTRIBUTION = '&copy; <a href="https://geoservices.ign.fr/">IGN</a> – Géoplateforme';

// Metropolitan France + margin: panning stays around France.
const FRANCE_BOUNDS = L.latLngBounds([39.8, -7.5], [52.6, 11.8]);

let maskCache: Promise<[FeatureCollection, FeatureCollection]> | null = null;
function loadFranceAssets() {
  maskCache ??= Promise.all([
    fetch("/geo/france-mask.geojson").then((r) => r.json() as Promise<FeatureCollection>),
    fetch("/geo/france-outline.geojson").then((r) => r.json() as Promise<FeatureCollection>),
  ]);
  return maskCache;
}

function FitFrance({ outline }: { outline: FeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!outline) return;
    const b = L.geoJSON(outline).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [16, 16] });
  }, [map, outline]);
  return null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(v: MapValue, on: boolean, cmpIndex: number) {
  const color = v.band ? BAND_META[v.band].color : NO_DATA_COLOR;
  const size = on ? 20 : cmpIndex >= 0 ? 18 : 14;
  const label = on ? `<span class="city-pin__label">${escapeHtml(v.name)} · ${fmt(v.score)}</span>` : "";
  const badge = cmpIndex >= 0 ? `<span class="city-pin__cmp">${cmpIndex + 1}</span>` : "";
  return L.divIcon({
    className: "city-pin",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<span class="city-pin__hit${on ? " city-pin--on" : ""}${cmpIndex >= 0 ? " city-pin--cmp" : ""}"><span class="city-pin__dot" style="width:${size}px;height:${size}px;background:${color}"></span>${badge}${label}</span>`,
  });
}

export default function TerritoryMap({ departements, shapes, values, selected, compared = [], onSelect, metricLabel, foodPoints = [] }: Props) {
  const [mask, setMask] = useState<FeatureCollection | null>(null);
  const [outline, setOutline] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    loadFranceAssets()
      .then(([m, o]) => {
        setMask(m);
        setOutline(o);
      })
      .catch(() => undefined);
  }, []);

  // GeoJSON layers are not reactive in react-leaflet: remount when the styling inputs change.
  const layerKey = useMemo(
    () => JSON.stringify([selected, compared, metricLabel, shapes.features.length, Object.entries(values).map(([k, v]) => [k, v.score])]),
    [values, selected, compared, metricLabel, shapes],
  );

  const style = (f?: Feature<Geometry, TerritoryProps>): PathOptions => {
    const v = f ? values[f.properties.code] : undefined;
    const isSel = f?.properties.code === selected;
    return {
      fillColor: v?.band ? BAND_META[v.band].color : NO_DATA_COLOR,
      fillOpacity: isSel ? 0.7 : 0.5,
      color: isSel ? "#15171C" : "#ffffff",
      weight: isSel ? 2.5 : 1.2,
    };
  };

  const onEach = (f: Feature<Geometry, TerritoryProps>, layer: Layer) => {
    layer.on({ click: () => onSelect(f.properties.code) });
  };

  const pins = useMemo(
    () =>
      shapes.features
        .filter((f) => values[f.properties.code])
        .map((f) => ({ code: f.properties.code, center: L.geoJSON(f).getBounds().getCenter() })),
    [shapes, values],
  );

  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={6}
      minZoom={5}
      zoomSnap={0.25}
      maxBounds={FRANCE_BOUNDS}
      maxBoundsViscosity={0.9}
      preferCanvas
      scrollWheelZoom
      className="h-full w-full rounded-xl"
      attributionControl
    >
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
            <GeoJSON data={departements} interactive={false} style={{ color: "#61656E", weight: 0.5, opacity: 0.45, fill: false }} />
          </LayersControl.Overlay>
        )}
      </LayersControl>

      {/* Everything outside France greyed out (above tiles, below data layers). */}
      <Pane name="france-mask" style={{ zIndex: 350 }}>
        {mask && <GeoJSON data={mask} interactive={false} style={{ stroke: false, fillColor: "#E9E9E4", fillOpacity: 0.93 }} />}
        {outline && <GeoJSON data={outline} interactive={false} style={{ color: "#15171C", weight: 1.2, opacity: 0.55, fill: false }} />}
      </Pane>

      <GeoJSON key={layerKey} data={shapes} style={style as L.StyleFunction} onEachFeature={onEach as (f: Feature, l: Layer) => void} />

      {foodPoints.length > 0 && (
        <Pane name="food" style={{ zIndex: 450 }}>
          {foodPoints.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lon]}
              radius={2.5}
              pathOptions={{ color: "#ffffff", weight: 0.6, fillColor: "#15171C", fillOpacity: 0.75 }}
              pane="food"
            >
              <Tooltip direction="top" offset={[0, -3]}>
                {p.name ?? "Fast-food"}
                {p.cuisine ? ` · ${p.cuisine.replace(/_/g, " ").replace(/;/g, ", ")}` : ""}
              </Tooltip>
            </CircleMarker>
          ))}
        </Pane>
      )}

      {pins.map(({ code, center }) => {
        const v = values[code];
        const on = code === selected;
        return (
          <Marker
            key={`${layerKey}-${code}`}
            position={center}
            icon={pinIcon(v, on, compared.indexOf(code))}
            zIndexOffset={on ? 1000 : 0}
            title={`${v.name} — ${metricLabel} ${fmt(v.score)} sur 10`}
            eventHandlers={{ click: () => onSelect(code) }}
          >
            {!on && (
              <Tooltip direction="top" offset={[0, -12]} className="pin-tip" opacity={1}>
                <div className="min-w-[180px]">
                  <p className="text-sm font-semibold">{v.name}</p>
                  {(v.typeLabel || v.population != null) && (
                    <p className="mt-0.5 text-xs text-[#61656E]">
                      {[v.typeLabel, v.population != null ? `${fmt(v.population, 0)} hab.` : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#61656E]">{metricLabel}</span>
                    <span className="tabular-nums text-sm font-semibold">
                      {fmt(v.score)} <span className="text-xs font-normal text-[#61656E]">/10</span>
                    </span>
                  </div>
                  {v.band && (
                    <span
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: BAND_META[v.band].tint, color: BAND_META[v.band].text }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: BAND_META[v.band].color }} />
                      {BAND_META[v.band].label}
                    </span>
                  )}
                  {v.detail && <p className="mt-1.5 text-xs text-[#61656E]">{v.detail}</p>}
                  <p className="mt-2 text-[11px] text-[#7A7E87]">Cliquer pour la fiche détaillée</p>
                </div>
              </Tooltip>
            )}
          </Marker>
        );
      })}
      <FitFrance outline={outline} />
    </MapContainer>
  );
}
