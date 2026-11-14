/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, CheckCircle2, Loader2, ShieldCheck, IndianRupee, Stethoscope, Video, AlertCircle } from 'lucide-react';
import { INDIAN_STATES_DISTRICTS, STANDARD_DEPARTMENTS } from '../DoctorFilterBar';
import { LogoMark } from '../brand/Logo';
import { useT } from '../../lib/preferences';

/** Every department a clinician might practise in — the directory list plus the common extras. */
const DEPARTMENTS = Array.from(
  new Set([
    ...STANDARD_DEPARTMENTS,
    'Urology',
    'Ophthalmology',
    'Dentistry',
    'Gastroenterology',
    'Pulmonology',
    'Nephrology',
    'Oncology',
    'Physiotherapy',
    'Homeopathy',
    'Ayurveda',
    'General Surgery',
  ])
).sort();

const TIME_OPTIONS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM',
  '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM',
];

interface DoctorJoinFormProps {
  onClose: () => void;
}

const EMPTY = {
  name: '', specialty: '', department: '', qualification: '', registrationNo: '',
  experienceYears: '', phone: '', email: '', hospital: '', addressLine: '', area: '',
  landmark: '', district: 'Purnea', state: 'Bihar', pincode: '', bio: '',
  maxSchedulesPerSlot: '4', videoEnabled: true,
};

/**
 * "Join as a doctor" — the public application form.
 *
 * It asks for what verification needs (registration number, chamber address,
 * OPD timings) and pointedly NOT for a consultation fee: the platform never
 * sets or touches a doctor's charge. Submitting creates a pending application
 * an administrator approves before the doctor appears in search.
 */
export default function DoctorJoinForm({ onClose }: DoctorJoinFormProps) {
  const t = useT();
  const [form, setForm] = useState(EMPTY);
  const [slots, setSlots] = useState<string[]>(['10:00 AM', '11:00 AM', '12:00 PM', '05:00 PM', '06:00 PM']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const toggleSlot = (slot: string) =>
    setSlots(prev => (prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (slots.length === 0) {
      setError(t('join.err.slots'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/doctor-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          department: form.department || form.specialty,
          experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
          maxSchedulesPerSlot: Number(form.maxSchedulesPerSlot) || 4,
          slots: TIME_OPTIONS.filter(t => slots.includes(t)),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t('join.err.generic'));
        return;
      }
      setDone(true);
    } catch {
      setError(t('join.err.network'));
    } finally {
      setSubmitting(false);
    }
  };

  const input =
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="relative my-auto w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-fade-up">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute right-4 top-4 z-10 cursor-pointer rounded-full bg-white/90 p-2 text-slate-500 shadow-sm transition-colors hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="bg-brand relative overflow-hidden px-6 py-7 text-white sm:px-8">
          <div className="bg-crosses absolute inset-0 opacity-60" />
          <div className="relative flex items-start gap-4">
            <LogoMark size={48} role="doctor" />
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">{t('join.title')}</h2>
              <p className="mt-1 max-w-xl text-sm text-white/85">
                {t('join.text')}
              </p>
            </div>
          </div>
          <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
            {[
              { icon: IndianRupee, text: t('join.b1') },
              { icon: Stethoscope, text: t('join.b2') },
              { icon: Video, text: t('join.b3') },
            ].map(item => (
              <span key={item.text} className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-[13px] font-semibold backdrop-blur">
                <item.icon className="h-4 w-4 shrink-0" />
                {item.text}
              </span>
            ))}
          </div>
        </div>

        {done ? (
          <div className="space-y-4 px-6 py-12 text-center sm:px-8">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h3 className="text-xl font-bold text-slate-900">{t('join.doneTitle', { name: form.name.split(' ')[0] || 'Doctor' })}</h3>
            <p className="mx-auto max-w-md text-sm text-slate-600">
              {t('join.doneText', { phone: form.phone })}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-700"
            >
              {t('common.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6 sm:px-8">
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{t('join.about')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('join.f.name')}>
                  <input required className={input} value={form.name} onChange={set('name')} placeholder={t('join.ph.name')} />
                </Field>
                <Field label={t('join.f.speciality')}>
                  <input required className={input} value={form.specialty} onChange={set('specialty')} placeholder={t('join.ph.speciality')} />
                </Field>
                <Field label={t('join.f.department')}>
                  <select className={input} value={form.department} onChange={set('department')}>
                    <option value="">{t('join.f.chooseDept')}</option>
                    {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label={t('join.f.qualification')}>
                  <input className={input} value={form.qualification} onChange={set('qualification')} placeholder={t('join.ph.qualification')} />
                </Field>
                <Field label={t('join.f.reg')}>
                  <input required className={input} value={form.registrationNo} onChange={set('registrationNo')} placeholder={t('join.ph.reg')} />
                </Field>
                <Field label={t('join.f.exp')}>
                  <input type="number" min={0} max={70} className={input} value={form.experienceYears} onChange={set('experienceYears')} placeholder="e.g. 8" />
                </Field>
                <Field label={t('join.f.mobile')}>
                  <input required type="tel" inputMode="tel" className={input} value={form.phone} onChange={set('phone')} placeholder={t('join.ph.mobile')} />
                </Field>
                <Field label={t('join.f.email')}>
                  <input type="email" className={input} value={form.email} onChange={set('email')} placeholder="you@example.com" />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{t('join.chamber')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('join.f.clinic')}>
                  <input required className={input} value={form.hospital} onChange={set('hospital')} placeholder={t('join.ph.clinic')} />
                </Field>
                <Field label={t('join.f.address')}>
                  <input className={input} value={form.addressLine} onChange={set('addressLine')} placeholder={t('join.ph.address')} />
                </Field>
                <Field label={t('join.f.area')}>
                  <input className={input} value={form.area} onChange={set('area')} placeholder={t('join.ph.area')} />
                </Field>
                <Field label={t('join.f.landmark')}>
                  <input className={input} value={form.landmark} onChange={set('landmark')} placeholder={t('join.ph.landmark')} />
                </Field>
                <Field label={t('join.f.state')}>
                  <select
                    className={input}
                    value={form.state}
                    onChange={e => setForm(prev => ({ ...prev, state: e.target.value, district: INDIAN_STATES_DISTRICTS[e.target.value]?.[0] || '' }))}
                  >
                    {Object.keys(INDIAN_STATES_DISTRICTS).map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('join.f.district')}>
                    <select className={input} value={form.district} onChange={set('district')}>
                      {(INDIAN_STATES_DISTRICTS[form.state] || []).map(d => <option key={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label={t('join.f.pin')}>
                    <input inputMode="numeric" maxLength={6} className={input} value={form.pincode} onChange={set('pincode')} placeholder="854301" />
                  </Field>
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">{t('join.timings')}</legend>
              <div className="flex flex-wrap gap-2">
                {TIME_OPTIONS.map(t => {
                  const on = slots.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleSlot(t)}
                      aria-pressed={on}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[13px] transition-colors ${
                        on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-300'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('join.f.perSlot')}>
                  <select className={input} value={form.maxSchedulesPerSlot} onChange={set('maxSchedulesPerSlot')}>
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <label className="flex cursor-pointer items-center gap-3 self-end rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.videoEnabled}
                    onChange={e => setForm(prev => ({ ...prev, videoEnabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-slate-700">{t('join.f.video')}</span>
                </label>
              </div>
              <Field label={t('join.f.bio')}>
                <textarea
                  rows={3}
                  className={input}
                  value={form.bio}
                  onChange={set('bio')}
                  placeholder={t('join.ph.bio')}
                />
              </Field>
            </fieldset>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-[12px] text-slate-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                {t('join.verify')}
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-coral-600 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('join.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
