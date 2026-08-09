/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Doctor } from '../types';
import { mapConfig, MapLinkProvider } from '../config';

/* ==========================================================================
   Addresses
   ========================================================================== */

/**
 * The postal address, minus the landmark: building → area → city → state → PIN.
 * Empty parts are dropped so a partially-filled record never renders ", , ".
 */
export function formatFullAddress(doctor: Doctor): string {
  const cityWithPin = [doctor.district, doctor.pincode].filter(Boolean).join(' – ');
  return [doctor.addressLine, doctor.area, cityWithPin, doctor.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

/** Address + landmark, for a single-line summary or a maps text query. */
export function formatAddressWithLandmark(doctor: Doctor): string {
  return [formatFullAddress(doctor), doctor.landmark].filter(Boolean).join(' · ');
}

/** True when the record has enough detail to render a real address block. */
export function hasAddress(doctor: Doctor): boolean {
  return Boolean(doctor.addressLine || doctor.area || doctor.landmark);
}

/** Only a lat/lng pair can be pin-pointed; text alone cannot. */
export function hasCoordinates(
  doctor: Doctor,
): doctor is Doctor & { latitude: number; longitude: number } {
  return (
    typeof doctor.latitude === 'number' &&
    typeof doctor.longitude === 'number' &&
    Number.isFinite(doctor.latitude) &&
    Number.isFinite(doctor.longitude)
  );
}

/* ==========================================================================
   Deep links into a real map application
   ========================================================================== */

/**
 * A link that drops a pin on the clinic. Coordinates win over text because a
 * text search for "Line Bazar, Purnia" can resolve to the wrong side of town —
 * and with several same-named doctors in the directory, the pin IS the
 * distinguishing information.
 */
export function buildMapLink(doctor: Doctor, provider: MapLinkProvider = mapConfig.linkProvider): string {
  if (doctor.mapUrl) return doctor.mapUrl;

  if (hasCoordinates(doctor)) {
    const { latitude: lat, longitude: lng } = doctor;
    return provider === 'osm'
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const query = encodeURIComponent(formatAddressWithLandmark(doctor) || doctor.hospital);
  return provider === 'osm'
    ? `https://www.openstreetmap.org/search?query=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** Turn-by-turn directions from wherever the patient is now. */
export function buildDirectionsLink(
  doctor: Doctor,
  provider: MapLinkProvider = mapConfig.linkProvider,
): string {
  const destination = hasCoordinates(doctor)
    ? `${doctor.latitude},${doctor.longitude}`
    : formatAddressWithLandmark(doctor) || doctor.hospital;

  return provider === 'osm'
    ? `https://www.openstreetmap.org/directions?to=${encodeURIComponent(destination)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/* ==========================================================================
   Slippy-map tile maths (Web Mercator / EPSG:3857)
   --------------------------------------------------------------------------
   Rendering the thumbnail from raw tiles keeps the card list cheap: one <img>
   per visible tile, no map library, no API key, and no iframe per doctor. An
   iframe-based interactive map is only mounted once the patient opens the
   expanded map view.
   ========================================================================== */

const TILE_SIZE = 256;
/** Web Mercator cannot represent the poles; this is the standard cut-off. */
const MAX_LATITUDE = 85.05112878;

/** Longitude/latitude → absolute pixel position on the world map at `zoom`. */
function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(Math.min(lat, MAX_LATITUDE), -MAX_LATITUDE);
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Inverse of {@link project} — used to derive the bounding box of a viewport. */
function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return {
    lng: (x / scale) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

export interface MapTile {
  key: string;
  url: string;
  /** Offset inside the thumbnail viewport, in CSS pixels. */
  left: number;
  top: number;
}

export interface TileGrid {
  tiles: MapTile[];
  /** Where the pin belongs — always the exact centre of the viewport. */
  pin: { left: number; top: number };
}

/**
 * Work out which tiles cover a `width × height` viewport centred on the clinic,
 * and where each one sits. Tile indices are clamped to the valid range so an
 * edge-of-world coordinate cannot request a 404 tile.
 */
export function buildTileGrid(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
  tileUrlTemplate: string = mapConfig.tileUrl,
): TileGrid {
  const centre = project(lat, lng, zoom);
  const originX = centre.x - width / 2;
  const originY = centre.y - height / 2;

  const maxIndex = 2 ** zoom - 1;
  const firstCol = Math.floor(originX / TILE_SIZE);
  const lastCol = Math.floor((originX + width) / TILE_SIZE);
  const firstRow = Math.floor(originY / TILE_SIZE);
  const lastRow = Math.floor((originY + height) / TILE_SIZE);

  const tiles: MapTile[] = [];
  for (let row = firstRow; row <= lastRow; row++) {
    if (row < 0 || row > maxIndex) continue;
    for (let col = firstCol; col <= lastCol; col++) {
      // Longitude wraps around the globe; latitude does not.
      const wrappedCol = ((col % (maxIndex + 1)) + maxIndex + 1) % (maxIndex + 1);
      tiles.push({
        key: `${zoom}/${col}/${row}`,
        url: tileUrlTemplate
          .replace('{z}', String(zoom))
          .replace('{x}', String(wrappedCol))
          .replace('{y}', String(row)),
        left: col * TILE_SIZE - originX,
        top: row * TILE_SIZE - originY,
      });
    }
  }

  return { tiles, pin: { left: width / 2, top: height / 2 } };
}

/**
 * The `bbox` an OpenStreetMap embed expects, matched to the same viewport the
 * thumbnail shows so the expanded view opens exactly where the patient tapped.
 */
export function buildOsmEmbedUrl(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
): string {
  const centre = project(lat, lng, zoom);
  const topLeft = unproject(centre.x - width / 2, centre.y - height / 2, zoom);
  const bottomRight = unproject(centre.x + width / 2, centre.y + height / 2, zoom);
  const bbox = [topLeft.lng, bottomRight.lat, bottomRight.lng, topLeft.lat]
    .map((value) => value.toFixed(6))
    .join(',');

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}
