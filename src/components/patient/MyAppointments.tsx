/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarX2,
  History,
  MapPin,
  Navigation,
  Video,
  Building2,
  Copy,
  Check,
  RefreshCw,
  XCircle,
  Receipt,
  CalendarPlus,
  Star,
  Phone,
  ArrowRight,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  QrCode,
  CreditCard,
  Printer,
  Stethoscope,
  Clock,
} from 'lucide-react';
import type { Appointment, Doctor, LoggedInUser, PatientHistory } from '../../types';
import { appointmentStart, byStartTimeAscending, isUpcomingAppointment } from '../../lib/appointments';
import { buildDirectionsLink, formatFullAddress } from '../../lib/location';
import { friendlyDate, relativeDay, timeUntil } from '../../lib/doctors';
import { PLATFORM_FEE } from '../../lib/pricing';
import { DoctorAvatar } from '../DoctorCard';
import DoctorBooking from '../DoctorBooking';
import type { BookIntent } from './PatientHome';
import { usePreferences } from '../../lib/preferences';
import type { StringKey } from '../../i18n/strings';

type Result = { error?: string } | any;

interface MyAppointmentsProps {
  currentUser: LoggedInUser;
  doctors: Doctor[];
  patients: PatientHistory[];
  appointments: Appointment[];
  onBook: (intent: BookIntent) => void;
  onJoinVideo: (appt: Appointment) => void;
  onCancel: (apptId: string, reason: string) => Promise<Result>;
  onReschedule: (apptId: string, data: { date: string; timeSlot: string; type: 'visiting' | 'video' }) => Promise<Result>;
  onPay: (apptId: string, method: string) => Promise<Result>;
  onFeedback: (apptId: string, rating: number, text: string) => Promise<Result>;
}

type Tab = 'upcoming' | 'past' | 'cancelled';

const FREE_CANCEL_HOURS = 2;

const CANCEL_REASON_KEYS: StringKey[] = ['appts.reason.1', 'appts.reason.2', 'appts.reason.3', 'appts.reason.4', 'appts.reason.5'];

/** Google Calendar wants local wall-clock "YYYYMMDDTHHMMSS" without a zone. */
function calendarStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export default function MyAppointments({
  currentUser,
  doctors,
  patients,
  appointments,
  onBook,
  onJoinVideo,
  onCancel,
  onReschedule,
  onPay,
  onFeedback,
}: MyAppointmentsProps) {
  const { t, lang } = usePreferences();
  const fee = PLATFORM_FEE;
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const [tab, setTab] = useState<Tab>('upcoming');
  const [copied, setCopied] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [payTarget, setPayTarget] = useState<Appointment | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Appointment | null>(null);
  const [rateTarget, setRateTarget] = useState<Appointment | null>(null);
  const [toast, setToast] = useState('');

  const mine = useMemo(() => appointments.filter(a => a.patientId === currentUser.id), [appointments, currentUser.id]);

  const lists = useMemo(() => {
    const now = new Date();
    const upcoming = mine
      .filter(a => isUpcomingAppointment(a, now) || a.status === 'active-video')
      .sort(byStartTimeAscending);
    const past = mine
      .filter(a => a.status === 'completed' || (a.status === 'scheduled' && !isUpcomingAppointment(a, now)))
      .sort((a, b) => appointmentStart(b).getTime() - appointmentStart(a).getTime());
    const cancelled = mine
      .filter(a => a.status === 'cancelled')
      .sort((a, b) => appointmentStart(b).getTime() - appointmentStart(a).getTime());
    return { upcoming, past, cancelled };
  }, [mine]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 5000);
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(text);
    window.setTimeout(() => setCopied(''), 1800);
  };

  const addToCalendar = (appt: Appointment, doctor?: Doctor) => {
    const start = appointmentStart(appt);
    const end = new Date(start.getTime() + 30 * 60000);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `Consultation with ${doctor?.name || 'doctor'}`,
      dates: `${calendarStamp(start)}/${calendarStamp(end)}`,
      details: `Booking ${appt.bookingNo || appt.id} · Token ${appt.tokenNo || '-'} · ${appt.type === 'video' ? 'Video consultation' : 'Clinic visit'}. Booked on neXgen Healthcare. Doctor's fee is paid at the clinic.`,
      location: doctor ? `${doctor.hospital}, ${formatFullAddress(doctor)}` : '',
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener');
  };

  const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count: number }> = [
    { id: 'upcoming', label: t('appts.tab.upcoming'), icon: CalendarCheck, count: lists.upcoming.length },
    { id: 'past', label: t('appts.tab.past'), icon: History, count: lists.past.length },
    { id: 'cancelled', label: t('appts.tab.cancelled'), icon: CalendarX2, count: lists.cancelled.length },
  ];

  const current = lists[tab];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {toast && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 animate-fade-up">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {toast}
          </span>
          <button type="button" onClick={() => setToast('')} aria-label="Dismiss" className="cursor-pointer text-emerald-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-soft">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              <span className={`rounded-full px-1.5 text-[11px] font-bold ${tab === t.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onBook({})}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-coral-600"
        >
          <CalendarCheck className="h-4 w-4" /> {t('appts.new')}
        </button>
      </div>

      {current.length === 0 ? (
        <EmptyState tab={tab} onBook={() => onBook({})} />
      ) : (
        <ul className="space-y-4">
          {current.map(appt => {
            const doctor = doctors.find(d => d.id === appt.doctorId);
            const start = appointmentStart(appt);
            const isUpcoming = tab === 'upcoming';
            const missed = appt.status === 'scheduled' && !isUpcoming;
            return (
              <li key={appt.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
                <div className="flex flex-col sm:flex-row">
                  {/* Date block */}
                  <div
                    className={`flex shrink-0 flex-row items-center justify-between gap-3 px-5 py-4 sm:w-32 sm:flex-col sm:justify-center sm:text-center ${
                      appt.status === 'cancelled'
                        ? 'bg-slate-100 text-slate-500'
                        : isUpcoming
                        ? 'bg-brand text-white'
                        : 'bg-teal-50 text-teal-900'
                    }`}
                  >
                    <div className="sm:space-y-0.5">
                      <p className="text-[12px] font-semibold uppercase tracking-wider opacity-80">
                        {start.toLocaleDateString(locale, { weekday: 'short' })}
                      </p>
                      <p className="text-3xl font-extrabold leading-none">{start.getDate()}</p>
                      <p className="text-[13px] font-semibold opacity-90">
                        {start.toLocaleDateString(locale, { month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <p className="rounded-lg bg-black/10 px-2 py-1 font-mono text-[13px] font-bold sm:mt-2">{appt.timeSlot}</p>
                  </div>

                  <div className="min-w-0 flex-1 space-y-4 p-5">
                    {/* Status chips */}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip appt={appt} missed={missed} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700">
                        {appt.type === 'video' ? <Video className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        {appt.type === 'video' ? t('appts.type.video') : t('appts.type.clinic')}
                      </span>
                      {appt.status !== 'cancelled' && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                            appt.feePaid ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {appt.feePaid ? t('appts.fee.paid', { fee }) : t('appts.fee.due', { fee })}
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="ml-auto text-[13px] font-semibold text-indigo-700">
                          {relativeDay(appt.date, lang)} · {timeUntil(start, new Date(), lang)}
                        </span>
                      )}
                    </div>

                    {/* Doctor */}
                    <div className="flex items-start gap-3">
                      {doctor && <DoctorAvatar doctor={doctor} className="h-14 w-14 rounded-xl text-base" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-bold text-slate-900">{doctor?.name || 'Doctor'}</p>
                        <p className="text-sm font-medium text-indigo-700">{doctor?.specialty}</p>
                        {appt.patientName && appt.patientName !== currentUser.name && (
                          <p className="text-[13px] text-slate-500">{t('appts.for', { name: appt.patientName })}</p>
                        )}
                      </div>
                      {appt.tokenNo && appt.status !== 'cancelled' && (
                        <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{t('common.token')}</p>
                          <p className="font-mono text-lg font-bold leading-tight text-emerald-800">{appt.tokenNo}</p>
                        </div>
                      )}
                    </div>

                    {/* Where */}
                    {doctor && appt.type !== 'video' && appt.status !== 'cancelled' && (
                      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-start sm:justify-between">
                        <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] text-slate-700">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-coral-500" />
                          <span>
                            <span className="block font-semibold text-slate-900">{doctor.hospital}</span>
                            {formatFullAddress(doctor)}
                            {doctor.landmark && <span className="block text-slate-500">{doctor.landmark}</span>}
                          </span>
                        </p>
                        <div className="flex shrink-0 gap-2">
                          {doctor.clinicPhone && (
                            <a
                              href={`tel:${doctor.clinicPhone.replace(/\s/g, '')}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Phone className="h-3.5 w-3.5" /> {t('common.call')}
                            </a>
                          )}
                          {isUpcoming && (
                            <a
                              href={buildDirectionsLink(doctor)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Navigation className="h-3.5 w-3.5" /> {t('common.directions')}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Consultation summary for completed visits */}
                    {appt.status === 'completed' && appt.consultation && (
                      <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-[13px] text-slate-700">
                        {appt.consultation.diagnosis && (
                          <p>
                            <span className="font-semibold text-slate-900">{t('appts.dx')}</span> {appt.consultation.diagnosis}
                          </p>
                        )}
                        {appt.consultation.prescriptions?.length > 0 && (
                          <p className="mt-1">
                            <span className="font-semibold text-slate-900">{t('appts.rx')}</span>{' '}
                            {appt.consultation.prescriptions.join(', ')}
                          </p>
                        )}
                        {appt.consultation.advice && (
                          <p className="mt-1">
                            <span className="font-semibold text-slate-900">{t('appts.advice')}</span> {appt.consultation.advice}
                          </p>
                        )}
                        {!appt.consultation.diagnosis && !appt.consultation.prescriptions?.length && !appt.consultation.advice && (
                          <p className="text-slate-500">{t('appts.closedByClinic')}</p>
                        )}
                      </div>
                    )}

                    {missed && (
                      <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                        <Clock className="h-4 w-4 shrink-0" /> {t('appts.missed')}
                      </p>
                    )}

                    {appt.status === 'cancelled' && (
                      <p className="text-[13px] text-slate-600">
                        {appt.cancelledAt
                          ? t('appts.cancelledOn', {
                              date: new Date(appt.cancelledAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
                            })
                          : t('appts.cancelled')}
                        {appt.cancelledBy && appt.cancelledBy !== 'patient' ? t('appts.byClinic') : ''}.{' '}
                        {appt.refundStatus ? (
                          <span className="font-semibold text-emerald-700">{t('appts.refund', { fee: appt.refundAmount || fee })}</span>
                        ) : appt.feePaid ? (
                          <span className="text-slate-500">{t('appts.noRefund')}</span>
                        ) : null}
                      </p>
                    )}

                    {(appt.rescheduleHistory?.length ?? 0) > 0 && appt.status !== 'cancelled' && (
                      <p className="text-[12px] text-slate-500">
                        {t('appts.rescheduledFrom', {
                          date: friendlyDate(appt.rescheduleHistory![appt.rescheduleHistory!.length - 1].date, lang),
                          slot: appt.rescheduleHistory![appt.rescheduleHistory!.length - 1].timeSlot,
                        })}
                      </p>
                    )}

                    {/* Footer: booking no + actions */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => copy(appt.bookingNo || appt.id)}
                        className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[12px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        title={t('appts.copy')}
                      >
                        {copied === (appt.bookingNo || appt.id) ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        {appt.bookingNo || appt.id}
                      </button>

                      {isUpcoming && appt.type === 'video' && (
                        <ActionButton tone="teal" icon={Video} onClick={() => onJoinVideo(appt)}>{t('appts.a.join')}</ActionButton>
                      )}
                      {isUpcoming && !appt.feePaid && appt.status === 'scheduled' && (
                        <ActionButton tone="coral" icon={CreditCard} onClick={() => setPayTarget(appt)}>{t('appts.a.pay', { fee })}</ActionButton>
                      )}
                      {isUpcoming && appt.status === 'scheduled' && (
                        <>
                          <ActionButton icon={CalendarPlus} onClick={() => addToCalendar(appt, doctor)}>{t('appts.a.calendar')}</ActionButton>
                          <ActionButton icon={RefreshCw} onClick={() => setRescheduleTarget(appt)}>{t('appts.a.reschedule')}</ActionButton>
                          <ActionButton tone="danger" icon={XCircle} onClick={() => setCancelTarget(appt)}>{t('appts.a.cancel')}</ActionButton>
                        </>
                      )}
                      {appt.status !== 'cancelled' && appt.feePaid && (
                        <ActionButton icon={Receipt} onClick={() => setReceiptTarget(appt)}>{t('appts.a.receipt')}</ActionButton>
                      )}
                      {appt.status === 'completed' && appt.feedbackRating == null && (
                        <ActionButton tone="amber" icon={Star} onClick={() => setRateTarget(appt)}>{t('appts.a.rate')}</ActionButton>
                      )}
                      {appt.status === 'completed' && appt.feedbackRating != null && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[13px] font-semibold text-amber-800">
                          {t('appts.a.rated', { n: appt.feedbackRating })} <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                        </span>
                      )}
                      {!isUpcoming && doctor && doctor.isActive !== false && (
                        <ActionButton tone="primary" icon={ArrowRight} onClick={() => onBook({ doctorId: doctor.id })}>{t('appts.a.again')}</ActionButton>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelTarget && (
        <CancelDialog
          appt={cancelTarget}
          doctor={doctors.find(d => d.id === cancelTarget.doctorId)}
          onClose={() => setCancelTarget(null)}
          onConfirm={async reason => {
            const res = await onCancel(cancelTarget.id, reason);
            if (res?.error) return res.error;
            setCancelTarget(null);
            showToast(
              res?.refundStatus
                ? t('appts.toast.cancelRefund', { fee })
                : t('appts.toast.cancel')
            );
            return '';
          }}
        />
      )}

      {payTarget && (
        <PayDialog
          appt={payTarget}
          onClose={() => setPayTarget(null)}
          onConfirm={async method => {
            const res = await onPay(payTarget.id, method);
            if (res?.error) return res.error;
            setPayTarget(null);
            showToast(t('appts.toast.paid', { fee }));
            return '';
          }}
        />
      )}

      {rateTarget && (
        <RateDialog
          appt={rateTarget}
          doctor={doctors.find(d => d.id === rateTarget.doctorId)}
          onClose={() => setRateTarget(null)}
          onConfirm={async (rating, text) => {
            const res = await onFeedback(rateTarget.id, rating, text);
            if (res?.error) return res.error;
            setRateTarget(null);
            showToast(t('appts.toast.rated'));
            return '';
          }}
        />
      )}

      {receiptTarget && (
        <ReceiptDialog appt={receiptTarget} doctor={doctors.find(d => d.id === receiptTarget.doctorId)} onClose={() => setReceiptTarget(null)} />
      )}

      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
          <div className="my-6 w-full max-w-5xl rounded-3xl bg-canvas p-4 shadow-2xl sm:p-6">
            <DoctorBooking
              doctors={doctors}
              patients={patients}
              currentUser={currentUser}
              initialAppointment={rescheduleTarget}
              onCloseModal={() => setRescheduleTarget(null)}
              onRescheduleAppointment={async (id, data) => {
                const res = await onReschedule(id, data);
                if (!res?.error) showToast(t('appts.toast.moved'));
                return res;
              }}
              onBookAppointment={async () => ({ error: 'Use the reschedule button to move this booking.' })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function StatusChip({ appt, missed }: { appt: Appointment; missed: boolean }) {
  const { t } = usePreferences();
  if (appt.status === 'cancelled')
    return <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[12px] font-bold text-rose-700">{t('appts.status.cancelled')}</span>;
  if (appt.status === 'completed')
    return <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[12px] font-bold text-teal-800">{t('appts.status.completed')}</span>;
  if (appt.status === 'active-video')
    return <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[12px] font-bold text-white">{t('appts.status.live')}</span>;
  if (missed)
    return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-800">{t('appts.status.passed')}</span>;
  return <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[12px] font-bold text-indigo-700">{t('appts.status.confirmed')}</span>;
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  tone = 'default',
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger' | 'coral' | 'teal' | 'amber';
}) {
  const tones = {
    default: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
    coral: 'bg-coral-500 text-white hover:bg-coral-600',
    teal: 'bg-teal-600 text-white hover:bg-teal-700',
    amber: 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${tones[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function EmptyState({ tab, onBook }: { tab: Tab; onBook: () => void }) {
  const { t } = usePreferences();
  const copy = {
    upcoming: { title: t('appts.empty.upcoming.t'), text: t('appts.empty.upcoming.d', { fee: PLATFORM_FEE }) },
    past: { title: t('appts.empty.past.t'), text: t('appts.empty.past.d') },
    cancelled: { title: t('appts.empty.cancelled.t'), text: t('appts.empty.cancelled.d') },
  }[tab];
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Stethoscope className="h-8 w-8" />
      </span>
      <p className="text-lg font-bold text-slate-900">{copy.title}</p>
      <p className="max-w-sm text-sm text-slate-500">{copy.text}</p>
      {tab === 'upcoming' && (
        <button
          type="button"
          onClick={onBook}
          className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-coral-600"
        >
          {t('home.next.bookCta')} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = usePreferences();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </p>
  );
}

function CancelDialog({
  appt,
  doctor,
  onClose,
  onConfirm,
}: {
  appt: Appointment;
  doctor?: Doctor;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<string>;
}) {
  const { t, lang } = usePreferences();
  const [reason, setReason] = useState(t(CANCEL_REASON_KEYS[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hoursAhead = (appointmentStart(appt).getTime() - Date.now()) / 3_600_000;
  const refundable = appt.feePaid && hoursAhead >= FREE_CANCEL_HOURS;

  return (
    <Dialog title={t('appts.cancel.title')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {doctor?.name} · {friendlyDate(appt.date, lang)}, {appt.timeSlot}
        </p>
        <div className={`rounded-xl p-3 text-sm ${refundable ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          {refundable
            ? t('appts.cancel.refundYes', { fee: PLATFORM_FEE })
            : appt.feePaid
            ? t('appts.cancel.refundNo', { fee: PLATFORM_FEE })
            : t('appts.cancel.unpaid')}
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-700">{t('appts.cancel.reason')}</span>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          >
            {CANCEL_REASON_KEYS.map(k => (
              <option key={k}>{t(k)}</option>
            ))}
          </select>
        </label>
        <ErrorLine message={error} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 cursor-pointer rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t('appts.cancel.keep')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(await onConfirm(reason));
              setBusy(false);
            }}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('appts.cancel.confirm')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function PayDialog({ appt, onClose, onConfirm }: { appt: Appointment; onClose: () => void; onConfirm: (method: string) => Promise<string> }) {
  const { t, lang } = usePreferences();
  const [method, setMethod] = useState<'UPI' | 'Card'>('UPI');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title={t('appts.pay.title', { fee: PLATFORM_FEE })} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {t('appts.pay.text', { no: appt.bookingNo || '', date: friendlyDate(appt.date, lang), slot: appt.timeSlot })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'UPI', icon: QrCode, label: 'UPI' },
            { id: 'Card', icon: CreditCard, label: t('book.pay.card') },
          ] as const).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              aria-pressed={method === m.id}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-sm font-semibold ${
                method === m.id ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-700'
              }`}
            >
              <m.icon className="h-5 w-5" /> {m.label}
            </button>
          ))}
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500">{t('appts.pay.sandbox')}</p>
        <ErrorLine message={error} />
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onConfirm(method === 'UPI' ? 'UPI Instant' : 'Credit/Debit Card'));
            setBusy(false);
          }}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-500 py-3 text-sm font-bold text-white hover:bg-coral-600 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('appts.pay.btn', { fee: PLATFORM_FEE })}
        </button>
      </div>
    </Dialog>
  );
}

function RateDialog({
  appt,
  doctor,
  onClose,
  onConfirm,
}: {
  appt: Appointment;
  doctor?: Doctor;
  onClose: () => void;
  onConfirm: (rating: number, text: string) => Promise<string>;
}) {
  const { t, lang } = usePreferences();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title={t('appts.rate.title')} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {doctor?.name} · {friendlyDate(appt.date, lang)}
        </p>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="cursor-pointer p-1">
              <Star className={`h-9 w-9 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
        <textarea
          rows={3}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('appts.rate.ph')}
          className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500"
        />
        <ErrorLine message={error} />
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onConfirm(rating, text));
            setBusy(false);
          }}
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('appts.rate.submit')}
        </button>
      </div>
    </Dialog>
  );
}

function ReceiptDialog({ appt, doctor, onClose }: { appt: Appointment; doctor?: Doctor; onClose: () => void }) {
  const { t, lang } = usePreferences();
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const paidOn = appt.paymentDate ? new Date(appt.paymentDate) : null;
  return (
    <Dialog title={t('appts.receipt.title')} onClose={onClose}>
      <div className="print-target space-y-4 text-sm">
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <p className="text-base font-extrabold text-slate-900">neXgen Healthcare</p>
            <p className="text-[12px] text-slate-500">{t('appts.receipt.platform')}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('appts.receipt.label')}</p>
            <p className="font-mono text-[13px] font-semibold">INV-{appt.bookingNo}</p>
            {paidOn && <p className="text-[12px] text-slate-500">{paidOn.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('appts.receipt.patient')}</p>
            <p className="font-semibold text-slate-900">{appt.patientName}</p>
            <p className="text-slate-600">{appt.patientContact}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('appts.receipt.appointment')}</p>
            <p className="font-semibold text-slate-900">
              {friendlyDate(appt.date, lang)}, {appt.timeSlot}
            </p>
            <p className="text-slate-600">
              {t('common.token')} {appt.tokenNo || '—'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('appts.receipt.doctor')}</p>
            <p className="font-semibold text-slate-900">{doctor?.name}</p>
            <p className="text-slate-600">{doctor?.hospital}</p>
          </div>
        </div>
        <table className="w-full">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-2">{t('appts.receipt.fee')}</td>
              <td className="py-2 text-right font-mono">₹{PLATFORM_FEE}</td>
            </tr>
            <tr>
              <td className="py-2">{t('appts.receipt.gst')}</td>
              <td className="py-2 text-right font-mono">₹0</td>
            </tr>
            <tr className="font-bold">
              <td className="py-2">{t('appts.receipt.paid', { method: appt.paymentMethod || 'Online' })}</td>
              <td className="py-2 text-right font-mono">₹{appt.amountPaid || PLATFORM_FEE}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[12px] text-slate-500">{t('appts.receipt.note')}</p>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Printer className="h-4 w-4" /> {t('appts.receipt.print')}
      </button>
    </Dialog>
  );
}
