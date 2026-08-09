/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Maximize2, Navigation, ExternalLink, X, Copy, Check, Phone } from 'lucide-react';
import { Doctor } from '../types';
import { mapConfig } from '../config';
import {
  buildDirectionsLink,
  buildMapLink,
  buildOsmEmbedUrl,
  buildTileGrid,
  formatFullAddress,
  hasCoordinates,
} from '../lib/location';

/**
 * Tile maths needs a pixel size, but the card is fluid. A ResizeObserver keeps
 * the two in step so the pin stays exactly over the clinic at every breakpoint.
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      // Sub-pixel jitter would re-render on every scroll-driven reflow.
      setWidth((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, Math.round(width)] as const;
}

/* ==========================================================================
   Static tile map — the thumbnail on each doctor card
   ========================================================================== */

function StaticTileMap({
  latitude,
  longitude,
  zoom,
  height,
  label,
}: {
  latitude: number;
  longitude: number;
  zoom: number;
  height: number;
  label: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tilesFailed, setTilesFailed] = useState(false);

  const grid = width > 0 ? buildTileGrid(latitude, longitude, zoom, width, height) : null;

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      style={{ height }}
      className="relative w-full overflow-hidden rounded-lg bg-slate-100"
    >
      {grid && !tilesFailed &&
        grid.tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
            width={256}
            height={256}
            onError={() => setTilesFailed(true)}
            className="pointer-events-none absolute max-w-none select-none"
            style={{ left: tile.left, top: tile.top }}
          />
        ))}

      {/* Offline / blocked tile host — the address text still carries the day. */}
      {tilesFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 text-center">
          <MapPin className="h-5 w-5 text-slate-400" />
          <span className="px-2 text-[11px] text-slate-500">Map preview unavailable</span>
        </div>
      )}

      {/* The pin. -translate-y-full anchors its tip — not its centre — on the
          coordinate, which is what makes it read as pin-pointed. */}
      {grid && !tilesFailed && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full drop-shadow-md"
          style={{ left: grid.pin.left, top: grid.pin.top }}
        >
          <MapPin className="h-7 w-7 fill-rose-500 text-white" strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

/* ==========================================================================
   Expanded, interactive map view
   ========================================================================== */

/**
 * The map takes a share of the window rather than a flat 420px, so that on a
 * laptop-height screen the address block and the action buttons below it still
 * land above the fold instead of being pushed out of the panel.
 */
function useViewportMapHeight() {
  const measure = () => Math.max(200, Math.min(420, Math.round(window.innerHeight * 0.42)));
  const [height, setHeight] = useState(measure);

  useEffect(() => {
    const onResize = () => setHeight(measure());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return height;
}

function MapViewDialog({ doctor, onClose }: { doctor: Doctor; onClose: () => void }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [copied, setCopied] = useState(false);
  const height = useViewportMapHeight();
  const fullAddress = formatFullAddress(doctor);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Stop the page behind the dialog from scrolling under the patient's finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const copyAddress = () => {
    const text = [doctor.hospital, fullAddress, doctor.landmark && `Landmark: ${doctor.landmark}`]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Rendered into <body>, not in place.
   *
   * This dialog is mounted deep inside the page column, and any ancestor that
   * carries a transform, filter or `contain` becomes the containing block for
   * `position: fixed` — which would size the overlay to that ancestor instead
   * of the window and bury it under the sticky header. Portalling puts the
   * dialog out of reach of whatever the page does to itself.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Map — ${doctor.hospital}`}
        onClick={(e) => e.stopPropagation()}
        /* Column layout: the title bar and its close button stay put while only
           the body scrolls, so the way out is never scrolled off-screen. */
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{doctor.hospital}</h3>
            <p className="text-sm text-slate-500">{doctor.name} · {doctor.specialty}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="shrink-0 cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* min-h-0 is what actually lets a flex child shrink below its content
            height — without it the body refuses to scroll and overflows. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div ref={ref} className="overflow-hidden rounded-xl border border-slate-200">
            {hasCoordinates(doctor) && width > 0 ? (
              // Only mounted once the dialog opens — an iframe per card in the
              // list would cost a full map app download each.
              <iframe
                title={`Map of ${doctor.hospital}`}
                src={buildOsmEmbedUrl(
                  doctor.latitude,
                  doctor.longitude,
                  Math.min(mapConfig.zoom + 1, 19),
                  width,
                  height,
                )}
                width="100%"
                height={height}
                loading="lazy"
                className="block w-full border-0"
              />
            ) : (
              <div style={{ height }} className="flex items-center justify-center bg-slate-50 text-sm text-slate-500">
                Exact coordinates are not on file for this chamber.
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400">{mapConfig.attribution}</p>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-start gap-2 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{fullAddress || doctor.hospital}</span>
            </p>
            {doctor.landmark && (
              <p className="pl-6 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Landmark:</span> {doctor.landmark}
              </p>
            )}
            {doctor.clinicPhone && (
              <p className="flex items-center gap-2 pl-6 text-sm text-slate-600">
                <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <a href={`tel:${doctor.clinicPhone.replace(/\s/g, '')}`} className="hover:text-indigo-700">
                  {doctor.clinicPhone}
                </a>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={buildDirectionsLink(doctor)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              <Navigation className="h-4 w-4" />
              Get directions
            </a>
            <a
              href={buildMapLink(doctor)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Open in {mapConfig.linkProvider === 'osm' ? 'OpenStreetMap' : 'Google Maps'}
            </a>
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Address copied' : 'Copy address'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ==========================================================================
   Public pieces
   ========================================================================== */

/** Full postal address + the landmark patients navigate by. */
export function ClinicAddress({
  doctor,
  className = '',
  showPhone = true,
}: {
  doctor: Doctor;
  className?: string;
  showPhone?: boolean;
}) {
  const fullAddress = formatFullAddress(doctor);

  return (
    <div className={`space-y-1 text-sm ${className}`}>
      <p className="flex items-start gap-1.5 text-slate-600">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>
          <span className="font-medium text-slate-800">{doctor.hospital}</span>
          {fullAddress && <span className="block text-slate-600">{fullAddress}</span>}
        </span>
      </p>
      {doctor.landmark && (
        <p className="pl-5 text-[13px] text-slate-500">
          <span className="font-medium text-slate-600">Landmark:</span> {doctor.landmark}
        </p>
      )}
      {showPhone && doctor.clinicPhone && (
        <p className="flex items-center gap-1.5 pl-5 text-[13px] text-slate-500">
          <Phone className="h-3 w-3 shrink-0 text-slate-400" />
          {doctor.clinicPhone}
        </p>
      )}
    </div>
  );
}

/**
 * Map thumbnail with a pin on the clinic. Clicking (or Enter/Space) opens the
 * interactive map view. Renders nothing when maps are switched off in .env or
 * the record has no coordinates — callers do not need to guard.
 */
export default function DoctorLocationMap({
  doctor,
  height = 116,
  className = '',
}: {
  doctor: Doctor;
  height?: number;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!mapConfig.enabled || !hasCoordinates(doctor)) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // The whole doctor card is clickable; opening the map must not also
          // select the doctor.
          e.stopPropagation();
          setIsOpen(true);
        }}
        aria-label={`View ${doctor.hospital} on a map`}
        className={`group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-slate-200 transition-colors hover:border-indigo-400 ${className}`}
      >
        <StaticTileMap
          latitude={doctor.latitude}
          longitude={doctor.longitude}
          zoom={mapConfig.zoom}
          height={height}
          label={`Map showing ${doctor.hospital}`}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-slate-900/70 px-2 py-1.5 text-[11px] font-medium text-white">
          <span className="truncate">{doctor.area || doctor.district}</span>
          <span className="inline-flex shrink-0 items-center gap-1 group-hover:underline">
            <Maximize2 className="h-3 w-3" />
            Map view
          </span>
        </span>
      </button>

      {isOpen && <MapViewDialog doctor={doctor} onClose={() => setIsOpen(false)} />}
    </>
  );
}
