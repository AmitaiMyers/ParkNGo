import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, PathOptions } from 'leaflet';
import type { RouteLeg } from '../lib/transitous.ts';
import type { LatLng } from '../lib/types.ts';

export interface MapMarker {
  position: LatLng;
  label: string;
  kind: 'origin' | 'parking' | 'destination' | 'user';
}

interface Props {
  legs: RouteLeg[];
  markers: MapMarker[];
  /** When set, the map keeps this point centered (navigation mode). */
  follow: LatLng | null;
  className: string;
}

const GUSH_DAN_CENTER: [number, number] = [32.08, 34.8];

const MARKER_COLORS: Record<MapMarker['kind'], string> = {
  origin: '#2563eb',
  parking: '#0f766e',
  destination: '#dc2626',
  user: '#f59e0b',
};

export function legStyle(leg: RouteLeg): PathOptions {
  switch (leg.mode) {
    case 'CAR':
    case 'BIKE':
      return { color: '#0f766e', weight: 6 };
    case 'WALK':
      return { color: '#6b7280', weight: 4, dashArray: '6 8' };
    case 'RAIL':
    case 'REGIONAL_RAIL':
    case 'SUBURBAN':
    case 'HIGHSPEED_RAIL':
    case 'LONG_DISTANCE':
      return { color: '#b91c1c', weight: 5 };
    case 'TRAM':
    case 'SUBWAY':
    case 'METRO':
      return { color: '#7c3aed', weight: 5 };
    default:
      return { color: '#16a34a', weight: 5 };
  }
}

const toTuple = (p: LatLng): [number, number] => [p.lat, p.lng];

function FitAndFollow({ legs, markers, follow }: Omit<Props, 'className'>) {
  const map = useMap();
  useEffect(() => {
    if (follow !== null) {
      return;
    }
    const points = [...legs.flatMap((leg) => leg.geometry), ...markers.map((m) => m.position)];
    if (points.length > 0) {
      map.fitBounds(points.map(toTuple) as LatLngBoundsExpression, { padding: [24, 24], animate: false });
    }
  }, [map, legs, markers, follow]);

  useEffect(() => {
    if (follow !== null) {
      map.setView(toTuple(follow), Math.max(map.getZoom(), 16), { animate: false });
    }
  }, [map, follow]);
  return null;
}

export function MapView({ legs, markers, follow, className }: Props) {
  return (
    <MapContainer className={className} center={GUSH_DAN_CENTER} zoom={11} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {legs.map((leg, index) => (
        <Polyline key={`${index}-${leg.mode}`} positions={leg.geometry.map(toTuple)} pathOptions={legStyle(leg)} />
      ))}
      {markers.map((marker) => (
        <CircleMarker
          key={`${marker.kind}-${marker.position.lat}-${marker.position.lng}`}
          center={toTuple(marker.position)}
          radius={marker.kind === 'user' ? 9 : 8}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: MARKER_COLORS[marker.kind], fillOpacity: 1 }}
        >
          <Tooltip>{marker.label}</Tooltip>
        </CircleMarker>
      ))}
      <FitAndFollow legs={legs} markers={markers} follow={follow} />
    </MapContainer>
  );
}
