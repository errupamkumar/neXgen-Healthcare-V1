/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  CalendarCheck,
  Ticket,
  MapPin,
  Navigation,
  Video,
  ArrowRight,
  Clock,
  FileText,
  History,
  UserRound,
  Sparkles,
  IndianRupee,
  Stethoscope,
  BellRing,
} from 'lucide-react';
import type { Appointment, Doctor, LoggedInUser, MedicalDocument, PatientHistory } from '../../types';
import { appointmentStart, byStartTimeAscending, isUpcomingAppointment } from '../../lib/appointments';
import { bookableDoctors, departmentIcon, departmentsOf, nextAvailableSlot, relativeDay, timeUntil } from '../../lib/doctors';
import { buildDirectionsLink, formatFullAddress } from '../../lib/location';
import { PLATFORM_FEE } from '../../lib/pricing';
import { DoctorAvatar } from '../DoctorCard';
import { usePreferences } from '../../lib/preferences';
import type { StringKey } from '../../i18n/strings';

export interface BookIntent {
  doctorId?: string;
  search?: string;
  department?: string;
}

interface PatientHomeProps {
  currentUser: LoggedInUser;
  patients: PatientHistory[];
  doctors: Doctor[];
  appointments: Appointment[];
  documents: MedicalDocument[];
  onNavigate: (tab: string) => void;
  onBook: (intent: BookIntent) => void;
  onJoinVideo: (appt: Appointment) => void;
}

function greetingKey(now = new Date()): StringKey {
  const h = now.getHours();
  if (h < 12) return 'home.greet.morning';
  if (h < 17) return 'home.greet.afternoon';
  return 'home.greet.evening';
}

/**
 * The patient's front door: what is next, and the fastest way to book.
 * Everything a patient does most — see their next visit, get directions, book
 * again with a doctor they trust — is one tap from here.
 */
export default function PatientHome({
  currentUser,
  patients,
  doctors,
  appointments,
  documents,
  onNavigate,
  onBook,
  onJoinVideo,
}: PatientHomeProps) {
  const { t, lang } = usePreferences();
  const fee = PLATFORM_FEE;
  const [query, setQuery] = useState('');
  const me = patients.find(p => p.id === currentUser.id);
  const mine = useMemo(() => appointments.filter(a => a.patientId === currentUser.id), [appointments, currentUser.id]);

  const upcoming = useMemo(() => mine.filter(a => isUpcomingAppointment(a)).sort(byStartTimeAscending), [mine]);
  const next = upcoming[0];
  const nextDoctor = next ? doctors.find(d => d.id === next.doctorId) : undefined;
  const completed = mine.filter(a => a.status === 'completed');
  const unpaid = upcoming.filter(a => !a.feePaid);
  const myDocs = documents.filter(d => d.patientId === currentUser.id);

  /** Doctors this patient has booked before — "book again" is the most common repeat action. */
  const myDoctors = useMemo(() => {
    const seen = new Set<string>();
    const list: Doctor[] = [];
    [...mine].sort((a, b) => appointmentStart(b).getTime() - appointmentStart(a).getTime()).forEach(a => {
      const d = doctors.find(doc => doc.id === a.doctorId);
      if (d && d.isActive !== false && !seen.has(d.id)) {
        seen.add(d.id);
        list.push(d);
      }
    });
    return list.slice(0, 4);
  }, [mine, doctors]);

  const departments = useMemo(() => departmentsOf(bookableDoctors(doctors)), [doctors]);

  const missing = me
    ? ([
        !me.age && t('home.field.age'),
        !me.gender && t('home.field.gender'),
        !me.bloodGroup && t('home.field.blood'),
        !me.address && t('home.field.address'),
      ].filter(Boolean) as string[])
    : [];

  const firstName = (me?.name || currentUser.name).split(' ')[0];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onBook({ search: query.trim() });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Greeting + search */}
      <section className="bg-brand relative overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8">
        <div className="bg-crosses absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative max-w-2xl space-y-4">
          <p className="text-sm font-semibold text-white/80">{t(greetingKey())},</p>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{t('home.title', { name: firstName })}</h2>
          <form onSubmit={submitSearch} className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl sm:flex-row">
            <label className="flex flex-1 items-center gap-2.5 px-3">
              <Search className="h-5 w-5 shrink-0 text-indigo-600" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('home.search.ph')}
                aria-label={t('home.search.ph')}
                className="w-full bg-transparent py-2.5 text-[15px] text-slate-900 placeholder-slate-400 outline-none"
              />
            </label>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-500 px-5 py-3 text-sm font-bold text-white hover:bg-coral-600"
            >
              {t('home.search.btn')} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="flex items-center gap-2 text-[13px] text-white/80">
            <IndianRupee className="h-4 w-4 shrink-0" /> {t('home.feeLine', { fee })}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Next appointment */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <CalendarCheck className="h-5 w-5 text-indigo-600" /> {t('home.next.title')}
            </h3>
            {upcoming.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('upcoming')}
                className="cursor-pointer text-sm font-semibold text-indigo-700 hover:text-indigo-900"
              >
                {upcoming.length > 1 ? t('home.next.all', { n: upcoming.length }) : t('home.next.manage')}
              </button>
            )}
          </div>

          {next && nextDoctor ? (
            <div className="mt-4 space-y-4">
              <div className="flex gap-4">
                <DoctorAvatar doctor={nextDoctor} className="h-20 w-20 rounded-2xl text-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold text-slate-900">{nextDoctor.name}</p>
                  <p className="text-sm font-medium text-indigo-700">{nextDoctor.specialty}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[12px] font-semibold text-teal-800">
                    <Clock className="h-3.5 w-3.5" />
                    {relativeDay(next.date, lang)}, {next.timeSlot} · {timeUntil(appointmentStart(next), new Date(), lang)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('common.token')}</p>
                  <p className="font-mono text-xl font-bold text-emerald-700">{next.tokenNo || '—'}</p>
                </div>
                <div className="border-x border-slate-200">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('common.booking')}</p>
                  <p className="truncate font-mono text-[13px] font-semibold text-slate-800">{next.bookingNo || next.id.slice(-6)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">₹{PLATFORM_FEE} fee</p>
                  <p className={`text-[13px] font-bold ${next.feePaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {next.feePaid ? t('common.paid') : t('common.dueAtClinic')}
                  </p>
                </div>
              </div>

              {next.type === 'video' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
                  <p className="flex items-center gap-2 text-sm text-teal-900">
                    <Video className="h-4 w-4 shrink-0" /> {t('home.next.videoText')}
                  </p>
                  <button
                    type="button"
                    onClick={() => onJoinVideo(next)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700"
                  >
                    <Video className="h-4 w-4" /> {t('home.next.join')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-slate-700">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-coral-500" />
                    <span>
                      <span className="block font-semibold text-slate-900">{nextDoctor.hospital}</span>
                      {formatFullAddress(nextDoctor)}
                      {nextDoctor.landmark && <span className="block text-[13px] text-slate-500">{nextDoctor.landmark}</span>}
                    </span>
                  </p>
                  <a
                    href={buildDirectionsLink(nextDoctor)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Navigation className="h-4 w-4" /> {t('common.directions')}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <CalendarCheck className="h-7 w-7" />
              </span>
              <p className="text-base font-bold text-slate-900">{t('home.next.none')}</p>
              <p className="max-w-sm text-sm text-slate-500">{t('home.next.noneText', { fee })}</p>
              <button
                type="button"
                onClick={() => onBook({})}
                className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-coral-600"
              >
                {t('home.next.bookCta')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        {/* At a glance */}
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: CalendarCheck, label: t('home.stat.upcoming'), value: upcoming.length, tab: 'upcoming', tone: 'text-indigo-600 bg-indigo-50' },
              { icon: History, label: t('home.stat.past'), value: completed.length, tab: 'appt-history', tone: 'text-teal-600 bg-teal-50' },
              { icon: FileText, label: t('home.stat.docs'), value: myDocs.length, tab: 'documents', tone: 'text-sky-600 bg-sky-50' },
              { icon: BellRing, label: t('home.stat.feeDue'), value: unpaid.length, tab: 'upcoming', tone: 'text-amber-600 bg-amber-50' },
            ].map(s => (
              <button
                key={s.label}
                type="button"
                onClick={() => onNavigate(s.tab)}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-indigo-200"
              >
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-2xl font-extrabold text-slate-900">{s.value}</p>
                <p className="text-[13px] font-medium text-slate-500">{s.label}</p>
              </button>
            ))}
          </div>

          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('portal')}
              className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100/70"
            >
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <span>
                <span className="block text-sm font-bold text-amber-900">{t('home.profile.title')}</span>
                <span className="block text-[13px] text-amber-800">{t('home.profile.text', { fields: missing.join(', ') })}</span>
              </span>
            </button>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-coral-500" /> {t('home.tips.title')}
            </p>
            <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600">
              <li>• {t('home.tips.1')}</li>
              <li>• {t('home.tips.2', { fee })}</li>
              <li>• {t('home.tips.3')}</li>
            </ul>
          </div>
        </section>
      </div>

      {/* Book again */}
      {myDoctors.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-slate-900">{t('home.again.title')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {myDoctors.map(d => {
              const slot = nextAvailableSlot(d, appointments);
              return (
                <div key={d.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                  <div className="flex items-center gap-3">
                    <DoctorAvatar doctor={d} className="h-12 w-12 rounded-xl text-sm" />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">{d.name}</p>
                      <p className="truncate text-[13px] text-indigo-700">{d.specialty}</p>
                    </div>
                  </div>
                  <p className="text-[12px] text-slate-500">
                    {slot ? (
                      <>
                        {t('home.again.next')}{' '}
                        <span className="font-semibold text-slate-800">
                          {relativeDay(slot.date, lang)}, {slot.slot}
                        </span>
                      </>
                    ) : (
                      t('home.again.none')
                    )}
                  </p>
                  <button
                    type="button"
                    disabled={!slot}
                    onClick={() => onBook({ doctorId: d.id })}
                    className="mt-auto cursor-pointer rounded-xl border border-indigo-200 bg-indigo-50 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('home.again.btn')}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Specialities */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{t('home.spec.title')}</h3>
          <button type="button" onClick={() => onBook({})} className="cursor-pointer text-sm font-semibold text-indigo-700 hover:text-indigo-900">
            {t('home.spec.all')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {departments.map(dept => {
            const Icon = departmentIcon(dept);
            return (
              <button
                key={dept}
                type="button"
                onClick={() => onBook({ department: dept })}
                className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-indigo-200"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-teal-50 text-indigo-600 group-hover:from-indigo-600 group-hover:to-teal-500 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-bold text-slate-800">{dept}</span>
              </button>
            );
          })}
          {departments.length === 0 && (
            <p className="col-span-full flex items-center gap-2 text-sm text-slate-500">
              <Stethoscope className="h-4 w-4" /> {t('home.spec.empty')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
