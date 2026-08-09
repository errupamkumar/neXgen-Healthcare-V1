/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  Search,
  Send,
  Smartphone,
  Stethoscope,
  UserRound,
  Users,
} from 'lucide-react';
import {
  Appointment,
  DeskMessage,
  Doctor,
  LoggedInUser,
  MessageAudience,
  MessageCategory,
  MessageChannel,
  PatientHistory,
} from '../types';
import { todayLocal } from '../lib/appointments';

/* ==========================================================================
   Channel and category metadata
   ========================================================================== */

/**
 * Only `portal` actually delivers anything in this build — it drops the message
 * into the patient's Messages inbox. The other three are simulated end to end:
 * the send is recorded with the address it would have gone to, but nothing
 * leaves the server. The labels say so, so nobody on the desk believes an SMS
 * really went out.
 */
const CHANNELS: {
  id: MessageChannel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** What has to be on the patient record for this channel to reach them. */
  needs: 'none' | 'email' | 'contact';
  hint: string;
}[] = [
  { id: 'portal', label: 'Portal', icon: Bell, needs: 'none', hint: 'Lands in the patient Messages inbox' },
  { id: 'email', label: 'Email', icon: Mail, needs: 'email', hint: 'Simulated — needs an email on file' },
  { id: 'sms', label: 'SMS', icon: Smartphone, needs: 'contact', hint: 'Simulated — needs a mobile number' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, needs: 'contact', hint: 'Simulated — needs a mobile number' },
];

const CHANNEL_BY_ID = Object.fromEntries(CHANNELS.map(c => [c.id, c])) as Record<
  MessageChannel,
  (typeof CHANNELS)[number]
>;

/**
 * Categories carry a starter subject and body.
 *
 * A delay notice is written under pressure — the queue is backing up and the
 * phone is ringing. Pre-filled wording that the desk edits down beats a blank
 * box, and it keeps the clinic's tone consistent across whoever is on shift.
 */
const CATEGORIES: {
  id: MessageCategory;
  label: string;
  chip: string;
  subject: string;
  body: string;
}[] = [
  {
    id: 'delay',
    label: 'Running late',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    subject: 'Your appointment is running late',
    body:
      'We are sorry — the consultant is running behind schedule today, so your appointment may start later than the booked time.\n\n' +
      'Please plan for a short wait. You will be seen as soon as the consultant is free, and your place in the queue is unchanged.',
  },
  {
    id: 'reschedule',
    label: 'Reschedule',
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    subject: 'We need to move your appointment',
    body:
      'We are very sorry, but your appointment needs to be rescheduled.\n\n' +
      'Please call the front desk to pick a new slot, or book again from the portal at a time that suits you. There is no charge for the change.',
  },
  {
    id: 'closure',
    label: 'Clinic closed',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    subject: 'Clinic closed — please do not travel',
    body:
      'The clinic is closed today due to an unforeseen circumstance. Please do not travel to the chamber.\n\n' +
      'The front desk will contact you shortly to rebook your appointment at no charge. We apologise for the disruption.',
  },
  {
    id: 'general',
    label: 'General notice',
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
    subject: '',
    body: '',
  },
];

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<
  MessageCategory,
  (typeof CATEGORIES)[number]
>;

/* ==========================================================================
   Props
   ========================================================================== */

export interface SendMessagePayload {
  audience: MessageAudience;
  patientIds?: string[];
  doctorId?: string;
  date?: string;
  category: MessageCategory;
  subject: string;
  body: string;
  channels: MessageChannel[];
}

interface MessageCenterProps {
  messages: DeskMessage[];
  patients: PatientHistory[];
  doctors: Doctor[];
  appointments: Appointment[];
  currentUser: LoggedInUser | null;
  onSendMessage: (payload: SendMessagePayload) => Promise<any>;
  onMarkRead: (messageId: string) => Promise<any>;
}

/* ==========================================================================
   Shared bits
   ========================================================================== */

function friendlyTimestamp(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;

  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hr ago`;
  return then.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChannelPill({ channel, muted = false }: { channel: MessageChannel; muted?: boolean }) {
  const meta = CHANNEL_BY_ID[channel];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
        muted ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-indigo-200 bg-indigo-50 text-indigo-700'
      }`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

/**
 * A row of channel pills.
 *
 * Rendering the list inside the component rather than mapping `<ChannelPill>`
 * at each call site keeps React's `key` on an intrinsic element. This project
 * has no `@types/react` installed, so JSX falls back to a structural check that
 * rejects `key` on a custom component's props.
 */
function ChannelPills({ channels, muted = false }: { channels: MessageChannel[]; muted?: boolean }) {
  return (
    <>
      {channels.map(c => (
        <span key={c} className="contents">
          <ChannelPill channel={c} muted={muted} />
        </span>
      ))}
    </>
  );
}

function CategoryBadge({ category }: { category: MessageCategory }) {
  const meta = CATEGORY_BY_ID[category] || CATEGORY_BY_ID.general;
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

/* ==========================================================================
   Root — one destination, two entirely different jobs
   ========================================================================== */

export default function MessageCenter(props: MessageCenterProps) {
  const isStaff = props.currentUser?.role === 'hospital' || props.currentUser?.role === 'admin';
  return isStaff ? <DeskComposer {...props} /> : <PatientInbox {...props} />;
}

/* ==========================================================================
   Front desk — compose and outbox
   ========================================================================== */

function DeskComposer({
  messages,
  patients,
  doctors,
  appointments,
  onSendMessage,
}: MessageCenterProps) {
  // Local calendar day — a UTC key would default the "doctor's day" audience to
  // yesterday's clinic, sending a delay notice to entirely the wrong patients.
  const today = todayLocal();

  const [audience, setAudience] = useState<MessageAudience>('doctor-day');
  const [doctorId, setDoctorId] = useState<string>(doctors[0]?.id || '');
  const [date, setDate] = useState<string>(today);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [patientSearch, setPatientSearch] = useState('');

  const [category, setCategory] = useState<MessageCategory>('delay');
  const [subject, setSubject] = useState<string>(CATEGORY_BY_ID.delay.subject);
  const [body, setBody] = useState<string>(CATEGORY_BY_ID.delay.body);
  const [channels, setChannels] = useState<MessageChannel[]>(['portal', 'sms']);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [sentSummary, setSentSummary] = useState<{
    recipientCount: number;
    summary: { channel: MessageChannel; label: string; sent: number; skipped: number }[];
  } | null>(null);

  useEffect(() => {
    if (!doctorId && doctors.length > 0) setDoctorId(doctors[0].id);
  }, [doctors, doctorId]);

  /**
   * Applying a category overwrites whatever is in the boxes.
   *
   * That is the intended behaviour — the chips are templates, and a half-edited
   * delay notice should not survive a switch to "clinic closed". "General
   * notice" clears to blank rather than leaving the last template behind.
   */
  const applyCategory = (next: MessageCategory) => {
    setCategory(next);
    setSubject(CATEGORY_BY_ID[next].subject);
    setBody(CATEGORY_BY_ID[next].body);
  };

  /**
   * Who this send will reach, resolved live so the desk sees the count before
   * committing. This mirrors `resolveRecipients` in server.ts — the SERVER copy
   * is authoritative and re-resolves at send time; this one exists purely to
   * render a preview, so the two are allowed to drift for one render without
   * anything going wrong.
   */
  const recipients = useMemo(() => {
    if (audience === 'all') return patients;
    if (audience === 'doctor-day') {
      const ids = new Set(
        appointments
          .filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled')
          .map(a => a.patientId)
      );
      return patients.filter(p => ids.has(p.id));
    }
    return patients.filter(p => selectedIds.includes(p.id));
  }, [audience, patients, appointments, doctorId, date, selectedIds]);

  /** Per-channel reachability — the "2 have no mobile number" warning. */
  const reach = useMemo(
    () =>
      channels.map(id => {
        const meta = CHANNEL_BY_ID[id];
        const reachable = recipients.filter(p =>
          meta.needs === 'none' ? true : meta.needs === 'email' ? Boolean(p.email) : Boolean(p.contact)
        ).length;
        return { id, label: meta.label, reachable, unreachable: recipients.length - reachable };
      }),
    [channels, recipients]
  );

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.contact || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  const toggleChannel = (id: MessageChannel) =>
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

  const togglePatient = (id: string) =>
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));

  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    channels.length > 0 &&
    recipients.length > 0 &&
    !isSending;

  const handleSend = async () => {
    setError('');
    setSentSummary(null);
    setIsSending(true);
    try {
      const result = await onSendMessage({
        audience,
        patientIds: audience === 'selected' ? selectedIds : undefined,
        doctorId: audience === 'doctor-day' ? doctorId : undefined,
        date: audience === 'doctor-day' ? date : undefined,
        category,
        subject: subject.trim(),
        body: body.trim(),
        channels,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      // The audience, channels and wording all stay put — a desk that has just
      // sent a delay notice usually sends another twenty minutes later to the
      // same group, and retyping it under pressure is how mistakes happen.
      setSentSummary({ recipientCount: result.recipientCount, summary: result.summary });
    } catch (err: any) {
      setError(err?.message || 'Could not send the message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {sentSummary && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-sm font-semibold text-emerald-900">
              Sent to {sentSummary.recipientCount} patient{sentSummary.recipientCount === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              {sentSummary.summary.map(row => (
                <span
                  key={row.channel}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800"
                >
                  {row.label}: {row.sent} sent
                  {row.skipped > 0 && (
                    <span className="text-amber-700">· {row.skipped} unreachable</span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-emerald-800/80">
              Portal messages are live in each patient&apos;s inbox. Email, SMS and WhatsApp are simulated
              in this build — nothing left the server.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSentSummary(null)}
            className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ------------------------------ Composer ------------------------------ */}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
          <header className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Megaphone className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Message patients</h2>
              <p className="text-[11px] text-slate-500">
                Delay notices, closures and general announcements
              </p>
            </div>
          </header>

          {/* --- 1. Audience --- */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              1 · Who is this for
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  { id: 'doctor-day', label: "A doctor's day", icon: Stethoscope, hint: 'Everyone booked in' },
                  { id: 'selected', label: 'Pick patients', icon: UserRound, hint: 'One or a few' },
                  { id: 'all', label: 'Everyone', icon: Users, hint: 'Whole directory' },
                ] as const
              ).map(opt => {
                const Icon = opt.icon;
                const active = audience === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudience(opt.id)}
                    className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="text-[13px] font-semibold text-slate-900">{opt.label}</span>
                    <span className="text-[11px] text-slate-500">{opt.hint}</span>
                  </button>
                );
              })}
            </div>

            {audience === 'doctor-day' && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600">Consultant</span>
                  <select
                    value={doctorId}
                    onChange={e => setDoctorId(e.target.value)}
                    className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-indigo-500"
                  >
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.specialty}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600">Clinic date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-indigo-500"
                  />
                </label>
              </div>
            )}

            {audience === 'selected' && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    placeholder="Search by name, mobile or email"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  />
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {filteredPatients.length === 0 && (
                    <li className="px-2 py-4 text-center text-[12px] text-slate-500">
                      No patient matches “{patientSearch}”.
                    </li>
                  )}
                  {filteredPatients.map(p => {
                    const checked = selectedIds.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => togglePatient(p.id)}
                          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            checked ? 'border-indigo-300 bg-indigo-50' : 'border-transparent bg-white hover:bg-slate-100'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-slate-900">{p.name}</span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {p.contact || 'No mobile'} · {p.email || 'No email'}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* --- 2. What to say --- */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              2 · What to say
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyCategory(c.id)}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    category === c.id ? c.chip + ' ring-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject — e.g. Dr Sharma is running 40 minutes late"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-500"
            />
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={6}
              placeholder="Message to the patient…"
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
            />
          </div>

          {/* --- 3. Channels --- */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              3 · How to send it
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHANNELS.map(c => {
                const Icon = c.icon;
                const active = channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChannel(c.id)}
                    title={c.hint}
                    className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span className="text-[12px] font-semibold text-slate-900">{c.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">
              Portal is the only live channel. Email, SMS and WhatsApp are simulated — the send is logged
              against each patient with the address it would have used.
            </p>
          </div>

          {/* --- Preview + send --- */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[13px] font-semibold text-slate-900">
                {recipients.length} patient{recipients.length === 1 ? '' : 's'} will be written to
              </p>
              {recipients.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-700">
                  Nobody matches this audience yet — pick a different doctor, date or patient.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {reach.map(r => (
                    <li key={r.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                      <ChannelPill channel={r.id} />
                      <span>{r.reachable} reachable</span>
                      {r.unreachable > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertCircle className="h-3 w-3" />
                          {r.unreachable} with no address on file
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!canSend}
              onClick={handleSend}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSending ? 'Sending…' : `Send to ${recipients.length} patient${recipients.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>

        {/* ------------------------------- Outbox ------------------------------- */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Sent messages</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
              {messages.length}
            </span>
          </header>

          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Inbox className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-[13px] font-medium text-slate-700">Nothing sent yet</p>
              <p className="text-[11px] text-slate-500">
                Delay notices and announcements you send will be listed here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {messages.map(m => (
                <li key={m.id}>
                  <OutboxRow message={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** One sent message, with the per-recipient delivery log behind a disclosure. */
function OutboxRow({ message }: { message: DeskMessage }) {
  const [open, setOpen] = useState(false);

  const readCount = message.recipients.filter(r => r.readAt).length;
  const skipped = message.recipients.reduce(
    (n, r) => n + r.deliveries.filter(d => d.status === 'skipped').length,
    0
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={message.category} />
            <span className="text-[11px] text-slate-400">{friendlyTimestamp(message.sentAt)}</span>
          </div>
          <p className="truncate text-[13px] font-semibold text-slate-900">{message.subject}</p>
          <p className="text-[11px] text-slate-500">
            {message.audienceLabel} · read by {readCount}/{message.recipients.length}
          </p>
          <div className="flex flex-wrap gap-1">
            <ChannelPills channels={message.channels} muted />
            {skipped > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                <AlertCircle className="h-3 w-3" />
                {skipped} unreachable
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{message.body}</p>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Delivery log
            </p>
            <ul className="space-y-1.5">
              {message.recipients.map(r => (
                <li key={r.patientId} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-slate-900">{r.patientName}</span>
                    <span
                      className={`shrink-0 text-[10px] font-medium ${
                        r.readAt ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {r.readAt ? `Read ${friendlyTimestamp(r.readAt)}` : 'Unread'}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {r.deliveries.map(d => (
                      <li
                        key={d.channel}
                        className={`text-[11px] ${d.status === 'sent' ? 'text-slate-500' : 'text-amber-700'}`}
                      >
                        {CHANNEL_BY_ID[d.channel]?.label ?? d.channel}: {d.detail}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Patient — the inbox side of the portal channel
   ========================================================================== */

function PatientInbox({ messages, currentUser, onMarkRead }: MessageCenterProps) {
  const [openId, setOpenId] = useState<string>('');

  /**
   * Only messages this patient is a recipient of, newest first, each paired
   * with their own delivery row — read state is per recipient, so one patient
   * opening a broadcast must not mark it read for everybody else.
   */
  const mine = useMemo(() => {
    if (!currentUser) return [];
    return messages
      .map(m => ({ message: m, me: m.recipients.find(r => r.patientId === currentUser.id) }))
      .filter((row): row is { message: DeskMessage; me: DeskMessage['recipients'][number] } =>
        Boolean(row.me)
      )
      .sort((a, b) => (b.message.sentAt || '').localeCompare(a.message.sentAt || ''));
  }, [messages, currentUser]);

  const unreadCount = mine.filter(row => !row.me.readAt).length;

  const open = async (row: (typeof mine)[number]) => {
    const next = openId === row.message.id ? '' : row.message.id;
    setOpenId(next);
    if (next && !row.me.readAt) await onMarkRead(row.message.id);
  };

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Inbox className="mx-auto h-7 w-7 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-900">No messages</p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          When the clinic needs to tell you about a delay, a closure or a change to your appointment,
          it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-600">
          {mine.length} message{mine.length === 1 ? '' : 's'} from the clinic
        </p>
        {unreadCount > 0 && (
          <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            {unreadCount} unread
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {mine.map(row => {
          const { message, me } = row;
          const isOpen = openId === message.id;
          const isUnread = !me.readAt;

          return (
            <li
              key={message.id}
              className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                isUnread ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => open(row)}
                className="flex w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50"
              >
                {isUnread && (
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={message.category} />
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      {friendlyTimestamp(message.sentAt)}
                    </span>
                  </div>
                  <p
                    className={`text-[14px] ${
                      isUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
                    }`}
                  >
                    {message.subject}
                  </p>
                  {!isOpen && (
                    <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-500">
                      {message.body}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">From {message.senderName} · Front desk</p>
                </div>
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                    {message.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Also sent via
                    </span>
                    <ChannelPills channels={message.channels} muted />
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(message.sentAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
