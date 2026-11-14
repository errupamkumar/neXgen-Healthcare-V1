/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  MapPin,
  Clock,
  Video,
  BadgeCheck,
  Loader2,
  RefreshCw,
  Inbox,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react';
import type { Doctor, DoctorApplication } from '../../types';
import { formatFullAddress } from '../../lib/location';

interface DoctorApplicationsProps {
  doctors: Doctor[];
  /** Refresh the app's data after an approval adds a doctor. */
  onChanged: () => Promise<void> | void;
}

type Filter = 'pending' | 'approved' | 'rejected';

/**
 * Admin review queue for "Join as a doctor" applications.
 *
 * Approving verifies the registration offline (a phone call, the council
 * register) and then publishes the doctor to search in one click. There is no
 * fee to configure — by design the platform never touches a doctor's charge.
 */
export default function DoctorApplications({ doctors, onChanged }: DoctorApplicationsProps) {
  const [applications, setApplications] = useState<DoctorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/doctor-applications');
      if (res.ok) setApplications(await res.json());
    } catch {
      setError('Could not load applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (app: DoctorApplication, action: 'approve' | 'reject') => {
    let note = '';
    if (action === 'reject') {
      const input = window.prompt(`Reason for rejecting ${app.name}'s application (shared with the onboarding team):`, 'Registration could not be verified');
      if (input === null) return;
      note = input;
    }
    setBusyId(app.id);
    setError('');
    try {
      const res = await fetch(`/api/doctor-applications/${app.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'That did not work. Please try again.');
        return;
      }
      setNotice(
        action === 'approve'
          ? `${body.doctor?.name || app.name} is now live — patients can find and book them.`
          : `${app.name}'s application was rejected.`
      );
      window.setTimeout(() => setNotice(''), 6000);
      await load();
      if (action === 'approve') await onChanged();
    } finally {
      setBusyId('');
    }
  };

  const counts = {
    pending: applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };
  const shown = applications.filter(a => a.status === filter);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Doctors live', value: doctors.filter(d => d.isActive !== false).length, tone: 'text-indigo-700 bg-indigo-50', icon: BadgeCheck },
          { label: 'Awaiting review', value: counts.pending, tone: 'text-amber-700 bg-amber-50', icon: Clock },
          { label: 'Approved', value: counts.approved, tone: 'text-emerald-700 bg-emerald-50', icon: CheckCircle2 },
          { label: 'Rejected', value: counts.rejected, tone: 'text-rose-700 bg-rose-50', icon: XCircle },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-2xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-[13px] font-medium text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-soft">
          {(['pending', 'approved', 'rejected'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" /> {notice}
        </p>
      )}
      {error && (
        <p className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="h-5 w-5" /> {error}
        </p>
      )}

      {loading && applications.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">Loading applications…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Inbox className="h-7 w-7" />
          </span>
          <p className="text-lg font-bold text-slate-900">No {filter} applications</p>
          <p className="max-w-md text-sm text-slate-500">
            Doctors apply from the public website’s “Join as a doctor” form. New applications land here for verification.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {shown.map(app => (
            <li key={app.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-teal-50 text-indigo-700">
                    <UserPlus className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[17px] font-bold text-slate-900">{app.name}</p>
                    <p className="text-sm font-medium text-indigo-700">
                      {app.specialty}
                      {app.department && app.department !== app.specialty ? ` · ${app.department}` : ''}
                    </p>
                    {app.qualification && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-600">
                        <GraduationCap className="h-3.5 w-3.5" /> {app.qualification}
                        {app.experienceYears ? ` · ${app.experienceYears} yrs` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
                  Reg. {app.registrationNo}
                </span>
              </div>

              <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-700 sm:grid-cols-2">
                <a href={`tel:${app.phone}`} className="flex items-center gap-2 hover:text-indigo-700">
                  <Phone className="h-4 w-4 text-slate-400" /> {app.phone}
                </a>
                {app.email && (
                  <a href={`mailto:${app.email}`} className="flex items-center gap-2 truncate hover:text-indigo-700">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" /> {app.email}
                  </a>
                )}
                <p className="flex items-start gap-2 sm:col-span-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    <span className="font-semibold text-slate-900">{app.hospital}</span>
                    {formatFullAddress(app as unknown as Doctor) && <>, {formatFullAddress(app as unknown as Doctor)}</>}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {app.slots.map(s => (
                  <span key={s} className="rounded-md border border-slate-200 px-2 py-0.5 font-mono text-[12px] text-slate-600">
                    {s}
                  </span>
                ))}
                <span className="text-[12px] text-slate-500">· {app.maxSchedulesPerSlot}/slot</span>
                {app.videoEnabled && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[12px] font-semibold text-teal-800">
                    <Video className="h-3 w-3" /> Video
                  </span>
                )}
              </div>

              {app.bio && <p className="text-[13px] leading-relaxed text-slate-600">{app.bio}</p>}

              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="text-[12px] text-slate-500">
                  Applied {new Date(app.submittedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {app.reviewedAt && ` · reviewed ${new Date(app.reviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  {app.reviewNote && ` · “${app.reviewNote}”`}
                </p>
                {app.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === app.id}
                      onClick={() => act(app, 'reject')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === app.id}
                      onClick={() => act(app, 'approve')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === app.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve & publish
                    </button>
                  </div>
                )}
                {app.status === 'approved' && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Live in search
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
