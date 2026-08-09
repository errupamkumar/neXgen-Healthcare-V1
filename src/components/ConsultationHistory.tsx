/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Stethoscope, MapPin, Pill, ClipboardList, Lightbulb, CalendarCheck } from 'lucide-react';
import { Appointment, Doctor } from '../types';

/**
 * The patient's visit history: one card per consultation the doctor has closed.
 *
 * Reads `appointment.consultation`, the record written when "Review & complete"
 * is pressed in the doctor's queue. Appointments without one are still-upcoming
 * or legacy bookings, and are skipped — this is a record of what happened, not
 * a list of what is booked.
 */

function friendlyDate(value: string): string {
  if (!value) return '';
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getConsultationHistory(
  appointments: Appointment[],
  patientId: string,
): Appointment[] {
  return appointments
    .filter(a => a.patientId === patientId && a.consultation)
    .sort((a, b) =>
      (b.consultation?.completedAt || b.date).localeCompare(a.consultation?.completedAt || a.date),
    );
}

export default function ConsultationHistory({
  appointments,
  patientId,
  doctors = [],
  limit,
  className = '',
}: {
  appointments: Appointment[];
  patientId: string;
  doctors?: Doctor[];
  /** Cap the number of visits rendered; the rest are summarised in a footer. */
  limit?: number;
  className?: string;
}) {
  const history = getConsultationHistory(appointments, patientId);
  const shown = limit ? history.slice(0, limit) : history;
  const hidden = history.length - shown.length;

  if (history.length === 0) {
    return (
      <p className={`rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 ${className}`}>
        No consultation has been closed for this patient yet. Records appear here the moment a
        doctor completes a visit.
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {shown.map(appt => {
        const record = appt.consultation!;
        // Fall back to the live doctor record for chambers filed before the
        // address fields existed.
        const doctor = doctors.find(d => d.id === record.doctorId);
        const chamber = record.chamber || doctor?.hospital;
        const area = record.chamberArea || doctor?.area || doctor?.district;

        return (
          <article key={appt.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Stethoscope className="h-4 w-4 shrink-0 text-indigo-600" />
                  {record.doctorName || doctor?.name || 'Consultant'}
                </p>
                <p className="text-[13px] text-indigo-700">{record.specialty || doctor?.specialty}</p>
                {chamber && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-slate-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      {chamber}
                      {area && <span className="text-slate-400"> · {area}</span>}
                    </span>
                  </p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[13px] font-medium text-emerald-800">
                <CalendarCheck className="h-3.5 w-3.5" />
                {friendlyDate(record.completedAt || appt.date)}
              </span>
            </header>

            <dl className="space-y-2.5 text-sm">
              {/* A checkup can be closed without writing anything — the visit is
                  still a record, it simply has no clinical content. */}
              {!record.diagnosis && !record.notes && !record.advice && record.prescriptions.length === 0 && (
                <p className="text-slate-500">
                  Consultation completed. No prescription or notes were recorded for this visit.
                </p>
              )}

              {record.diagnosis && (
                <div className="flex gap-2">
                  <dt className="flex shrink-0 items-center gap-1.5 font-medium text-slate-500">
                    <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
                    Diagnosis
                  </dt>
                  <dd className="min-w-0 text-slate-900">{record.diagnosis}</dd>
                </div>
              )}

              {record.notes && (
                <div className="flex gap-2">
                  <dt className="shrink-0 font-medium text-slate-500">Notes</dt>
                  <dd className="min-w-0 text-slate-700">{record.notes}</dd>
                </div>
              )}

              {record.prescriptions.length > 0 && (
                <div>
                  <dt className="flex items-center gap-1.5 font-medium text-slate-500">
                    <Pill className="h-3.5 w-3.5 text-slate-400" />
                    Prescribed
                  </dt>
                  <dd>
                    <ul className="mt-1 space-y-1">
                      {record.prescriptions.map((line, i) => (
                        <li
                          key={`${appt.id}-rx-${i}`}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-800"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              )}

              {record.advice && (
                <div className="flex gap-2">
                  <dt className="flex shrink-0 items-center gap-1.5 font-medium text-slate-500">
                    <Lightbulb className="h-3.5 w-3.5 text-slate-400" />
                    Advice
                  </dt>
                  <dd className="min-w-0 text-slate-700">{record.advice}</dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}

      {hidden > 0 && (
        <p className="text-center text-[13px] text-slate-400">
          {hidden} earlier consultation{hidden === 1 ? '' : 's'} not shown.
        </p>
      )}
    </div>
  );
}
