/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  Users,
  Video,
  Repeat,
  Star,
  Activity,
  ArrowRight,
  MapPin,
  Stethoscope,
  Pill,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Appointment, Doctor, PatientHistory, LoggedInUser } from '../types';
import { todayLocal } from '../lib/appointments';

interface DoctorDashboardProps {
  appointments: Appointment[];
  doctors: Doctor[];
  patients: PatientHistory[];
  currentUser: LoggedInUser | null;
  onNavigate: (tab: string) => void;
  onJoinVideo?: (appt: Appointment) => void;
}

/** "09:00 AM" -> minutes since midnight, so a day sorts chronologically. */
function slotToMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((slot || '').trim());
  if (!m) return 9999;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

/**
 * The doctor's own console landing page.
 *
 * Every figure is scoped to the signed-in consultant and computed from the
 * appointment list already in memory — no extra endpoint, so the numbers can
 * never disagree with the queue the doctor is about to open. Consultation fees
 * are deliberately absent: they are settled at the clinic desk and this
 * application does not quote them anywhere.
 */
export default function DoctorDashboard({
  appointments,
  doctors,
  patients,
  currentUser,
  onNavigate,
  onJoinVideo,
}: DoctorDashboardProps) {
  // Local calendar day — a UTC key under-counts "today's OPD" before 05:30 IST.
  const today = todayLocal();

  // A doctor sees their own practice; other roles landing here see the first
  // consultant on file rather than an empty page.
  const doctorId = currentUser?.role === 'doctor' ? currentUser.id : doctors[0]?.id || '';
  const doctor = doctors.find(d => d.id === doctorId);

  const mine = useMemo(
    () => appointments.filter(a => a.doctorId === doctorId && a.status !== 'cancelled'),
    [appointments, doctorId],
  );

  const todays = useMemo(
    () => mine.filter(a => a.date === today).sort((a, b) => slotToMinutes(a.timeSlot) - slotToMinutes(b.timeSlot)),
    [mine, today],
  );

  const waiting = todays.filter(a => a.status !== 'completed');
  const completedToday = todays.filter(a => a.status === 'completed');
  const videoToday = todays.filter(a => a.type === 'video');
  const nextUp = waiting[0];

  /**
   * Follow-up vs first visit for today's list. `isRevisit` is unreliable on
   * seeded records, so the real question is asked instead: has this patient
   * been booked with this doctor before?
   */
  const followUpToday = useMemo(() => {
    return todays.filter(appt =>
      appointments.some(
        a =>
          a.patientId === appt.patientId &&
          a.doctorId === appt.doctorId &&
          a.id !== appt.id &&
          a.status !== 'cancelled' &&
          (a.date < appt.date ||
            (a.date === appt.date && slotToMinutes(a.timeSlot) < slotToMinutes(appt.timeSlot))),
      ),
    ).length;
  }, [todays, appointments]);

  const uniquePatients = useMemo(
    () => new Set(mine.map(a => a.patientId).filter(Boolean)).size,
    [mine],
  );

  const consultationsClosed = useMemo(() => mine.filter(a => a.consultation).length, [mine]);

  const prescriptionsIssued = useMemo(
    () => mine.filter(a => (a.consultation?.prescriptions?.length ?? 0) > 0).length,
    [mine],
  );

  /** Average of whatever feedback has actually been left. */
  const feedback = useMemo(() => {
    const rated = mine.filter(a => typeof a.feedbackRating === 'number');
    if (rated.length === 0) return null;
    const total = rated.reduce((sum, a) => sum + (a.feedbackRating || 0), 0);
    return { average: total / rated.length, count: rated.length };
  }, [mine]);

  /**
   * How full today is: booked slots against the chamber's own capacity
   * (slots × patients per slot). A doctor reads this as "can I still take a
   * walk-in?" more directly than a raw booking count.
   */
  const capacityToday = (doctor?.slots.length || 0) * (doctor?.maxSchedulesPerSlot || 0);
  const utilisation = capacityToday > 0 ? Math.round((todays.length / capacityToday) * 100) : 0;

  /** Bookings for the next seven days, for the load chart. */
  const weekAhead = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const onDay = mine.filter(a => a.date === iso);
      return {
        label: i === 0 ? 'Today' : weekday(iso),
        date: iso,
        booked: onDay.length,
        video: onDay.filter(a => a.type === 'video').length,
      };
    });
  }, [mine]);

  const recentConsultations = useMemo(
    () =>
      mine
        .filter(a => a.consultation)
        .sort((a, b) =>
          (b.consultation?.completedAt || b.date).localeCompare(a.consultation?.completedAt || a.date),
        )
        .slice(0, 4),
    [mine],
  );

  if (!doctor) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <Stethoscope className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        <p className="text-sm font-medium text-slate-800">No consultant profile found</p>
        <p className="text-sm text-slate-500">This dashboard needs a doctor record to report on.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting + chamber */}
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex min-w-0 items-start gap-4">
          {doctor.image ? (
            <img
              src={doctor.image}
              alt={doctor.name}
              className="h-16 w-16 shrink-0 rounded-xl bg-slate-100 object-cover object-top ring-1 ring-slate-200"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl font-semibold text-indigo-700 ring-1 ring-slate-200">
              {doctor.name.replace(/^Dr\.?\s*/i, '').charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-semibold text-slate-900">{doctor.name}</h2>
            <p className="text-sm text-indigo-700">{doctor.specialty}</p>
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-slate-500">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {doctor.hospital}
                {doctor.area && <span className="text-slate-400"> · {doctor.area}</span>}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('queue')}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Open today’s queue
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      {/* Primary KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={CalendarDays}
          tone="indigo"
          label="Booked today"
          value={todays.length}
          hint={`${capacityToday} slots available`}
        />
        <KpiTile
          icon={Clock}
          tone="amber"
          label="Still waiting"
          value={waiting.length}
          hint={nextUp ? `Next: ${nextUp.timeSlot} · ${nextUp.patientName}` : 'Queue cleared'}
        />
        <KpiTile
          icon={CheckCircle2}
          tone="emerald"
          label="Seen today"
          value={completedToday.length}
          hint={
            todays.length > 0
              ? `${Math.round((completedToday.length / todays.length) * 100)}% of today’s list`
              : 'Nothing booked today'
          }
        />
        <KpiTile
          icon={Activity}
          tone="sky"
          label="Chamber load"
          value={`${utilisation}%`}
          hint={capacityToday > 0 ? `${todays.length} of ${capacityToday} places taken` : 'No slots configured'}
        />
      </section>

      {/* Secondary KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile icon={Repeat} tone="amber" label="Follow-ups today" value={followUpToday}
          hint={`${todays.length - followUpToday} first visit${todays.length - followUpToday === 1 ? '' : 's'}`} />
        <KpiTile icon={Video} tone="sky" label="Video consults today" value={videoToday.length}
          hint={doctor.videoEnabled ? 'Telehealth enabled' : 'Telehealth off for this chamber'} />
        <KpiTile icon={Users} tone="indigo" label="Patients on your list" value={uniquePatients}
          hint={`${patients.length} in the clinic register`} />
        <KpiTile
          icon={Star}
          tone="emerald"
          label="Patient rating"
          value={feedback ? feedback.average.toFixed(1) : '—'}
          hint={feedback ? `${feedback.count} rating${feedback.count === 1 ? '' : 's'} left` : 'No ratings yet'}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Today's schedule */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Today’s schedule</h3>
            <span className="text-sm text-slate-400">
              {waiting.length} waiting · {completedToday.length} done
            </span>
          </div>

          {todays.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Nothing booked for today.
            </p>
          ) : (
            <ul className="space-y-2">
              {todays.slice(0, 6).map(appt => {
                const isDone = appt.status === 'completed';
                return (
                  <li
                    key={appt.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-semibold ${
                          isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {appt.timeSlot.replace(/:00\s*/, '').replace(/\s/g, '')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{appt.patientName}</p>
                        <p className="truncate text-[13px] text-slate-500">
                          {appt.patientAge} yrs · {appt.type === 'video' ? 'Video call' : 'OPD visit'}
                        </p>
                      </div>
                    </div>

                    {isDone ? (
                      <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                        Seen
                      </span>
                    ) : appt.type === 'video' && onJoinVideo ? (
                      <button
                        type="button"
                        onClick={() => onJoinVideo(appt)}
                        className="shrink-0 cursor-pointer rounded-md bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        Join room
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate('queue')}
                        className="shrink-0 cursor-pointer rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </button>
                    )}
                  </li>
                );
              })}
              {todays.length > 6 && (
                <li className="pt-1 text-center text-[13px] text-slate-400">
                  {todays.length - 6} more in the queue
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Week ahead */}
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Next seven days</h3>
            {/* Scoped to this chamber: a consultant who sits at several
                addresses has a separate doctor record — and so a separate
                queue and dashboard — for each one. */}
            <p className="text-sm text-slate-500">Bookings at {doctor.area || doctor.hospital}</p>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekAhead} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: '12px', borderRadius: '8px' }}
                  labelFormatter={(label, payload) => {
                    const iso = payload?.[0]?.payload?.date;
                    return iso ? `${label} · ${shortDate(iso)}` : String(label);
                  }}
                />
                <Bar dataKey="booked" name="Booked" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="video" name="Video" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Consultation output */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Recent consultations closed</h3>
          <span className="inline-flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {consultationsClosed} closed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Pill className="h-3.5 w-3.5 text-slate-400" />
              {prescriptionsIssued} with a prescription
            </span>
          </span>
        </div>

        {recentConsultations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No consultation has been closed yet. Completing one from your queue files it here and on the
            patient’s profile.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recentConsultations.map(appt => (
              <li key={appt.id} className="space-y-1 rounded-lg border border-slate-200 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-900">{appt.patientName}</p>
                  <span className="shrink-0 text-[13px] text-slate-400">{shortDate(appt.date)}</span>
                </div>
                {appt.consultation?.diagnosis && (
                  <p className="truncate text-[13px] text-slate-600">{appt.consultation.diagnosis}</p>
                )}
                {(appt.consultation?.prescriptions?.length ?? 0) > 0 && (
                  <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
                    <Pill className="h-3 w-3 shrink-0 text-slate-400" />
                    {appt.consultation!.prescriptions.length} medicine
                    {appt.consultation!.prescriptions.length === 1 ? '' : 's'} prescribed
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Building blocks
   ========================================================================== */

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
} as const;

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5">
      <span className={`rounded-lg p-2.5 ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-mono text-2xl font-semibold leading-tight text-slate-900">{value}</p>
        {hint && <p className="truncate text-[13px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
