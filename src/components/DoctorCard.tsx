/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Star, MapPin, Video, Building2, Clock, ArrowRight, BadgeCheck } from 'lucide-react';
import type { Appointment, Doctor } from '../types';
import { doctorInitials, nextAvailableSlot, relativeDay } from '../lib/doctors';
import { PLATFORM_FEE } from '../lib/pricing';
import { usePreferences } from '../lib/preferences';

/** Portrait with an initials fallback — a dead image URL must never show a broken icon. */
export function DoctorAvatar({ doctor, className = '' }: { doctor: Doctor; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !doctor.image?.trim()) {
    return (
      <div
        role="img"
        aria-label={doctor.name}
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-50 to-teal-50 font-bold text-indigo-700 ${className}`}
      >
        <span className="text-[1.15em]">{doctorInitials(doctor.name)}</span>
      </div>
    );
  }
  return (
    <img
      src={doctor.image}
      alt={doctor.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 bg-slate-100 object-cover object-top ${className}`}
    />
  );
}

interface DoctorCardProps {
  doctor: Doctor;
  appointments: Appointment[];
  onBook: (doctor: Doctor) => void;
  /** How many other chambers this same-named consultant sits at. */
  otherChambers?: number;
}

/**
 * The doctor card patients browse and book from. It answers the four questions
 * a patient has, in order: who is this, are they good, where are they, and when
 * can I be seen — then puts the ₹50 booking one tap away.
 */
export default function DoctorCard({ doctor, appointments, onBook, otherChambers = 0 }: DoctorCardProps) {
  const { t, lang } = usePreferences();
  const next = nextAvailableSlot(doctor, appointments);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lift">
      <div className="relative">
        <DoctorAvatar doctor={doctor} className="h-52 w-full text-4xl" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/55 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
            <Building2 className="h-3 w-3 text-indigo-600" /> {t('common.inClinic')}
          </span>
          {doctor.videoEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
              <Video className="h-3 w-3 text-teal-600" /> {t('common.video')}
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[12px] font-bold text-amber-950">
            <Star className="h-3 w-3 fill-amber-950" />
            {doctor.rating > 0 ? doctor.rating.toFixed(1) : t('common.new')}
          </span>
          {doctor.experienceYears ? (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              {t('common.yrsExp', { n: doctor.experienceYears })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-[17px] font-bold leading-snug text-slate-900">
            {doctor.name}
            <BadgeCheck className="h-4 w-4 shrink-0 text-indigo-600" aria-label={t('common.verified')} />
          </h3>
          <p className="text-sm font-medium text-indigo-700">{doctor.specialty}</p>
        </div>

        <p className="flex items-start gap-1.5 text-[13px] leading-snug text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            {doctor.hospital}
            {doctor.area && doctor.hospital && !doctor.hospital.includes(doctor.area) ? `, ${doctor.area}` : ''}
            {otherChambers > 0 && (
              <span className="mt-0.5 block text-[12px] font-medium text-amber-700">
                {otherChambers === 1 ? t('common.alsoAtOne') : t('common.alsoAtMany', { n: otherChambers })}
              </span>
            )}
          </span>
        </p>

        <div className="mt-auto rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
            <Clock className="h-3.5 w-3.5 text-teal-600" />
            {t('common.nextAvailable')}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {next ? (
              <>
                {relativeDay(next.date, lang)}, <span className="font-mono">{next.slot}</span>
              </>
            ) : (
              t('common.noSlot')
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onBook(doctor)}
          disabled={!next}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-500 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-coral-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {t('common.bookFor', { fee: PLATFORM_FEE })}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <p className="-mt-1 text-center text-[11px] text-slate-500">{t('common.feeAtClinic')}</p>
      </div>
    </article>
  );
}
