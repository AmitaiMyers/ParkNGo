// MapLibre GL map with OpenFreeMap vector tiles (free, no key). Lazy-loaded: the app paints before it.

import { LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
// Vite bundles MapLibre's web worker as its own chunk; by default MapLibre would look for it next to this chunk.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { ExpressionSpecification, GeoJSONSource, LngLatLike } from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../../hooks/useEnvironment.ts';
import type { RouteLeg } from '../../lib/transitous.ts';
import type { Language, LatLng } from '../../lib/types.ts';
import { MODE_COLOR_TOKEN, modeGroup } from '../modes.ts';
import type { ModeGroup } from '../modes.ts';
import styles from './MapCanvas.module.css';

/** Single place to swap the tile provider (OpenFreeMap is a free, as-is public service). */
const STYLE_URLS: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const GUSH_DAN: LngLatLike = [34.8, 32.08];
const ROUTE_SOURCE = 'parkngo-routes';
const LAYERS = { casing: 'parkngo-route-casing', line: 'parkngo-route-line', walk: 'parkngo-route-walk' } as const;
const FOLLOW_ZOOM = 16;

setWorkerUrl(maplibreWorkerUrl);

export interface MapRoute {
  id: string;
  legs: RouteLeg[];
  emphasis: 'selected' | 'faint';
}

export interface MapPoint {
  id: string;
  position: LatLng;
  kind: 'origin' | 'parking' | 'destination' | 'user';
  emphasis: 'selected' | 'faint';
  label: string;
}

export interface MapPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  theme: Theme;
  language: Language;
  label: string;
  routes: MapRoute[];
  points: MapPoint[];
  /** Keep this point centered (navigation). */
  follow: LatLng | null;
  /** Changing this re-fits the camera to the selected route and points. */
  fitKey: string;
  padding: MapPadding;
  reducedMotion: boolean;
}

const lngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function cssToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value === '') {
    throw new Error(`Missing CSS token ${name}`);
  }
  return value;
}

function routeFeatures(routes: MapRoute[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route) =>
      route.legs
        .filter((leg) => leg.geometry.length >= 2)
        .map((leg) => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: leg.geometry.map(lngLat) },
          properties: { group: modeGroup(leg.mode), faint: route.emphasis === 'faint' },
        })),
    ),
  };
}

function modeColorExpression(): ExpressionSpecification {
  const groups: ModeGroup[] = ['vehicle', 'walk', 'rail', 'lrt', 'bus'];
  return ['match', ['get', 'group'], ...groups.flatMap((group) => [group, cssToken(MODE_COLOR_TOKEN[group])]), cssToken('--mode-bus')] as unknown as ExpressionSpecification;
}

/** Adds (or refreshes after a style change) the route source and its three layers. */
function ensureRouteLayers(map: MapLibreMap): void {
  if (map.getSource(ROUTE_SOURCE) === undefined) {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  const notWalk: ExpressionSpecification = ['!=', ['get', 'group'], 'walk'];
  const faintOr = (faint: number, selected: number): ExpressionSpecification => ['case', ['get', 'faint'], faint, selected];
  if (map.getLayer(LAYERS.casing) === undefined) {
    map.addLayer({
      id: LAYERS.casing,
      type: 'line',
      source: ROUTE_SOURCE,
      filter: notWalk,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': cssToken('--map-casing'), 'line-width': faintOr(5, 10), 'line-opacity': faintOr(0.4, 1) },
    });
  }
  if (map.getLayer(LAYERS.line) === undefined) {
    map.addLayer({
      id: LAYERS.line,
      type: 'line',
      source: ROUTE_SOURCE,
      filter: notWalk,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': modeColorExpression(), 'line-width': faintOr(3, 6), 'line-opacity': faintOr(0.35, 1) },
    });
  }
  if (map.getLayer(LAYERS.walk) === undefined) {
    map.addLayer({
      id: LAYERS.walk,
      type: 'line',
      source: ROUTE_SOURCE,
      filter: ['==', ['get', 'group'], 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': cssToken('--mode-walk'), 'line-width': faintOr(3, 4), 'line-dasharray': [0.1, 2], 'line-opacity': faintOr(0.35, 1) },
    });
  }
}

/** Place names in the app language (OpenMapTiles name:xx fields), falling back to the local name. */
function localizeLabels(map: MapLibreMap, language: Language): void {
  const field: ExpressionSpecification = language === 'he' ? ['coalesce', ['get', 'name:he'], ['get', 'name']] : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  for (const layer of map.getStyle().layers) {
    // Icon-only symbol layers have no text-field; only name labels are localized (not route refs).
    if (layer.type === 'symbol' && layer.layout !== undefined && 'text-field' in layer.layout && JSON.stringify(layer.layout['text-field']).includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', field);
    }
  }
}

function markerElement(point: MapPoint): HTMLElement {
  const element = document.createElement('div');
  element.className = [styles.marker, styles[point.kind], point.kind === 'parking' && point.emphasis === 'faint' ? styles.parkingFaint : ''].join(' ');
  element.setAttribute('aria-hidden', 'true');
  element.title = point.label;
  if (point.kind === 'parking') {
    element.textContent = 'P';
  }
  return element;
}

export default function MapCanvas({ theme, language, label, routes, points, follow, fitKey, padding, reducedMotion }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [styleVersion, setStyleVersion] = useState(0);

  // Create the map once.
  useEffect(() => {
    if (container.current === null) {
      throw new Error('MapCanvas container is not mounted');
    }
    const map = new MapLibreMap({
      container: container.current,
      style: STYLE_URLS[theme],
      center: GUSH_DAN,
      zoom: 10.5,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      // No label cross-fade: avoids ~300 ms of continuous repainting after every camera move.
      fadeDuration: 0,
      // Beyond 2× the extra pixels are invisible but cost GPU time.
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    });
    map.touchZoomRotate.disableRotation();
    map.on('style.load', () => setStyleVersion((v) => v + 1));
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    mapRef.current = map;
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Created once with the initial theme; later theme changes call setStyle below.
  }, []);

  // Switch between light and dark map styles.
  const appliedTheme = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (map !== null && appliedTheme.current !== theme) {
      appliedTheme.current = theme;
      map.setStyle(STYLE_URLS[theme]);
    }
  }, [theme]);

  // Route lines and labels (re-applied after every style load, so colors follow the theme).
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || styleVersion === 0) {
      return;
    }
    ensureRouteLayers(map);
    localizeLabels(map, language);
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource;
    source.setData(routeFeatures(routes));
    if (!reducedMotion) {
      // Fade the new route in.
      map.setPaintProperty(LAYERS.line, 'line-opacity-transition', { duration: 0, delay: 0 });
      map.setPaintProperty(LAYERS.line, 'line-opacity', 0);
      requestAnimationFrame(() => {
        map.setPaintProperty(LAYERS.line, 'line-opacity-transition', { duration: 450, delay: 0 });
        map.setPaintProperty(LAYERS.line, 'line-opacity', ['case', ['get', 'faint'], 0.35, 1]);
      });
    }
  }, [routes, styleVersion, language, reducedMotion]);

  // Markers: create, move, remove.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const wanted = new Set(points.map((point) => `${point.id}:${point.kind}:${point.emphasis}`));
    for (const [key, marker] of markers.current) {
      if (!wanted.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    for (const point of points) {
      const key = `${point.id}:${point.kind}:${point.emphasis}`;
      const existing = markers.current.get(key);
      if (existing === undefined) {
        markers.current.set(key, new Marker({ element: markerElement(point) }).setLngLat(lngLat(point.position)).addTo(map));
      } else {
        existing.setLngLat(lngLat(point.position));
      }
    }
  }, [points]);

  // Fit the camera to the selected route when the fit key changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || follow !== null) {
      return;
    }
    const coordinates = [
      ...routes.filter((route) => route.emphasis === 'selected').flatMap((route) => route.legs.flatMap((leg) => leg.geometry)),
      ...points.filter((point) => point.emphasis === 'selected').map((point) => point.position),
    ];
    if (coordinates.length === 0) {
      return;
    }
    const bounds = new LngLatBounds(lngLat(coordinates[0]!), lngLat(coordinates[0]!));
    coordinates.forEach((point) => bounds.extend(lngLat(point)));
    // A lone point (just a destination) gets a neighbourhood view, not street level.
    map.fitBounds(bounds, { padding, maxZoom: coordinates.length === 1 ? 13 : 15, duration: reducedMotion ? 0 : 600 });
    // Keyed on fitKey only: a new route or selection moves the camera, a re-render never does.
  }, [fitKey]);

  // Follow the user during navigation.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || follow === null) {
      return;
    }
    map.easeTo({ center: lngLat(follow), zoom: Math.max(map.getZoom(), FOLLOW_ZOOM), padding, duration: reducedMotion ? 0 : 500 });
  }, [follow, padding, reducedMotion]);

  return <div ref={container} className={styles.map} role="region" aria-label={label} />;
}
