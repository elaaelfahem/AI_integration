'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Company } from '@/types/auth';
import { useI18n } from '@/lib/i18n/i18n-context';
import { interpolate } from '@/lib/i18n/messages';
import {
  coordinatesForGovernorate,
  distanceKm,
  TUNISIA_CENTER,
} from '@/lib/tunisia-geo';

const ROUTE_SOURCE_ID = 'route';
const ROUTE_CASING_LAYER_ID = 'route-line-casing';
const ROUTE_LAYER_ID = 'route-line';

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// The route source/layers are added imperatively after the map's `load`
// event instead of being declared in the initial style: a geojson line
// layer present in the style from construction time in this raster-only
// custom style never painted (queryRenderedFeatures stayed empty even
// after a direct setData call) — adding them post-load via the imperative
// API is the reliable pattern and avoids that.
function addRouteLayers(map: maplibregl.Map) {
  if (map.getSource(ROUTE_SOURCE_ID)) return;
  map.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: EMPTY_FEATURE_COLLECTION,
  });
  map.addLayer({
    id: ROUTE_CASING_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: ROUTE_LAYER_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    paint: { 'line-color': '#111111', 'line-width': 5 },
  });
}

interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  geometry: GeoJSON.LineString;
}

async function fetchDrivingRoute(
  origin: [number, number],
  destination: [number, number],
): Promise<RouteInfo | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=simplified&geometries=geojson`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data?.routes?.[0];
    if (
      !route ||
      !Number.isFinite(route.distance) ||
      !Number.isFinite(route.duration) ||
      route.geometry?.type !== 'LineString' ||
      !Array.isArray(route.geometry.coordinates) ||
      route.geometry.coordinates.length < 2
    ) {
      return null;
    }
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      geometry: route.geometry,
    };
  } catch {
    return null;
  }
}

function drawRoute(map: maplibregl.Map, geometry: GeoJSON.LineString) {
  const data: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {},
    geometry,
  };
  addRouteLayers(map);
  const source = map.getSource(ROUTE_SOURCE_ID) as
    maplibregl.GeoJSONSource | undefined;
  source?.setData(data);
}

function routeBounds(coordinates: [number, number][]): maplibregl.LngLatBounds {
  const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
  for (const coord of coordinates) bounds.extend(coord);
  return bounds;
}

function routeMidpoint(coordinates: [number, number][]): [number, number] {
  return coordinates[Math.floor(coordinates.length / 2)];
}

export function CompanyMap({
  company,
  children,
  compact = false,
}: {
  company: Company;
  children?: ReactNode;
  /** Map on top, with only distance and "my location" under it. */
  compact?: boolean;
}) {
  const { messages } = useI18n();
  const t = messages.meetingDetailPage;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const distanceMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapError, setMapError] = useState('');

  const approximate = useMemo(
    () => coordinatesForGovernorate(company.governorate),
    [company.governorate],
  );
  const target = useMemo(() => approximate ?? TUNISIA_CENTER, [approximate]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: target,
      zoom: approximate ? 11 : 6,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    new maplibregl.Marker({ color: '#ff7900' })
      .setLngLat(target)
      .setPopup(new maplibregl.Popup({ offset: 24 }).setText(company.name))
      .addTo(map);
    map.on('load', () => addRouteLayers(map));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      distanceMarkerRef.current = null;
    };
  }, [approximate, company.id, company.name, target]);

  function locateMe() {
    setMapError('');
    if (!('geolocation' in navigator)) {
      setMapError(t.mapLocationUnavailable);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        setUserLocation(coords);
        setLocating(false);
        setRoute(null);
        const map = mapRef.current;
        if (map) {
          new maplibregl.Marker({ color: '#111' }).setLngLat(coords).addTo(map);
          map.fitBounds([coords, target], {
            padding: 80,
            minZoom: 9,
            maxZoom: 13,
          });
        }
        setRouteLoading(true);
        fetchDrivingRoute(coords, target).then((result) => {
          setRouteLoading(false);
          if (!result) {
            setMapError(t.mapRouteUnavailable);
            return;
          }
          setMapError('');
          setRoute(result);
          const current = mapRef.current;
          if (current) {
            const coordinates = result.geometry.coordinates as [
              number,
              number,
            ][];
            drawRoute(current, result.geometry);
            current.fitBounds(routeBounds(coordinates), {
              padding: 80,
              minZoom: 9,
              maxZoom: 14,
            });
            distanceMarkerRef.current?.remove();
            const el = document.createElement('div');
            el.className = 'company-map-distance-label';
            el.textContent = `${result.distanceKm.toFixed(1)} km`;
            distanceMarkerRef.current = new maplibregl.Marker({
              element: el,
              anchor: 'center',
            })
              .setLngLat(routeMidpoint(coordinates))
              .addTo(current);
          }
        });
      },
      () => {
        setLocating(false);
        setMapError(t.mapLocationUnavailable);
      },
      { timeout: 8000 },
    );
  }

  const straightLineDistance = userLocation
    ? distanceKm(userLocation, target)
    : null;
  const displayDistanceKm = route?.distanceKm ?? straightLineDistance;

  return (
    <div
      className={`company-map-layout${compact ? ' company-map-layout--compact' : ''}`}
    >
      <div className="company-map-canvas" ref={containerRef} />
      <aside className="company-map-panel">
        <div className="company-map-card">
          {compact ? null : (
            <>
              <div className="company-map-card-header">
                <span className="company-map-avatar" aria-hidden="true">
                  {company.name.slice(0, 2).toUpperCase()}
                </span>
                <strong>{company.name}</strong>
              </div>
              <hr />
            </>
          )}
          <dl className="company-map-facts">
            {compact ? null : (
              <>
                <div>
                  <dt>{t.mapPanelSector}</dt>
                  <dd>{company.sector || '—'}</dd>
                </div>
                <div>
                  <dt>{t.mapPanelAddress}</dt>
                  <dd>{company.address || '—'}</dd>
                </div>
                {company.delegation ? (
                  <div>
                    <dt>{t.mapPanelCity}</dt>
                    <dd>{company.delegation}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t.mapPanelGovernorate}</dt>
                  <dd>{company.governorate || '—'}</dd>
                </div>
              </>
            )}
            {displayDistanceKm !== null ? (
              <div>
                <dt>{t.mapPanelDistance}</dt>
                <dd>
                  {interpolate(t.mapDistanceValue, {
                    km: displayDistanceKm.toFixed(1),
                  })}
                  {route ? null : straightLineDistance !== null ? (
                    <span className="company-map-approx-tag">
                      {' '}
                      ({t.mapStraightLine})
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {route ? (
              <div>
                <dt>{t.mapPanelDuration}</dt>
                <dd>
                  {interpolate(t.mapDurationValue, {
                    min: String(Math.round(route.durationMin)),
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            className="outline-button"
            onClick={locateMe}
            disabled={locating || routeLoading}
          >
            {locating || routeLoading ? t.locatingLabel : t.myLocationButton}
          </button>
          {mapError ? (
            <p className="users-error" role="alert">
              {mapError}
            </p>
          ) : null}
          <p className="company-map-note">{t.mapApproxNote}</p>
        </div>
        {children}
      </aside>
    </div>
  );
}
