"use client";

import { useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type StoreLocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  disabled?: boolean;
};

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:24px;height:24px;background:#7c3aed;
    border:3px solid white;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px #0005
  "></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function MapClickHandler({
  onChange,
  disabled,
}: {
  onChange: (latitude: number, longitude: number) => void;
  disabled: boolean;
}) {
  useMapEvents({
    click(event) {
      if (!disabled) {
        onChange(event.latlng.lat, event.latlng.lng);
      }
    },
  });

  return null;
}

export default function StoreLocationMap({
  latitude,
  longitude,
  onChange,
  disabled = false,
}: StoreLocationMapProps) {
  const [mapError, setMapError] = useState(false);

  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const center: [number, number] = hasCoordinates
    ? [latitude, longitude]
    : [6.5244, 3.3792];

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          key={`${center[0]}-${center[1]}`}
          center={center}
          zoom={hasCoordinates ? 16 : 11}
          scrollWheelZoom
          className="h-80 w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              tileerror: () => setMapError(true),
              tileload: () => setMapError(false),
            }}
          />
          <MapClickHandler onChange={onChange} disabled={disabled} />
          {hasCoordinates && (
            <Marker position={[latitude, longitude]} icon={pinIcon} />
          )}
        </MapContainer>
      </div>

      <p className="text-sm text-slate-600">
        {disabled
          ? "Your store location is shown on the map."
          : "Click the map to place or move your store pin."}
      </p>

      {mapError && (
        <p className="text-sm text-amber-700">
          Map tiles could not be loaded. Check your internet connection. You can
          still enter coordinates manually.
        </p>
      )}
    </div>
  );
}
