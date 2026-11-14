/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Phone,
  Mail,
  Clock,
  Search,
  MapPin,
  Stethoscope,
  ArrowRight,
  Menu,
  X,
  Ticket,
  Video,
  FileText,
  BellRing,
  IndianRupee,
  ShieldCheck,
  CalendarCheck,
  CheckCircle2,
  Star,
  ChevronDown,
  Users,
  Building2,
  HeartHandshake,
  Quote,
  Siren,
  UserRound,
  PlayCircle,
  MonitorPlay,
} from 'lucide-react';
import type { Appointment, Doctor } from '../../types';
import Logo, { LogoMark } from '../brand/Logo';
import DoctorCard, { DoctorAvatar } from '../DoctorCard';
import DoctorJoinForm from './DoctorJoinForm';
import { PLATFORM_FEE } from '../../lib/pricing';
import { bookableDoctors, departmentIcon, departmentsOf } from '../../lib/doctors';
import { filterDoctors } from '../DoctorFilterBar';
import { PreferenceToggles, usePreferences } from '../../lib/preferences';
import type { StringKey } from '../../i18n/strings';

interface LandingPageProps {
  doctors: Doctor[];
  appointments: Appointment[];
  /** Open the sign-in screen. */
  onSignIn: () => void;
  /** Start booking — with a doctor already chosen, or just a search. */
  onBook: (doctor: Doctor | null, search?: string) => void;
}

interface ClinicInfo {
  phone?: string;
  emergencyContact?: string;
  address?: string;
}

/** Where the recorded presentation for doctors lives (built by scripts/doctor-video). */
export const DOCTOR_VIDEO_SRC = '/media/nexgen-for-doctors.mp4';

const NAV: Array<{ href: string; key: StringKey }> = [
  { href: '#doctors', key: 'landing.nav.find' },
  { href: '#specialities', key: 'landing.nav.specialities' },
  { href: '#how', key: 'landing.nav.how' },
  { href: '#for-doctors', key: 'landing.nav.forDoctors' },
  { href: '#faq', key: 'landing.nav.faq' },
];

const FAQ_KEYS: Array<[StringKey, StringKey]> = [
  ['landing.faq.q1', 'landing.faq.a1'],
  ['landing.faq.q2', 'landing.faq.a2'],
  ['landing.faq.q3', 'landing.faq.a3'],
  ['landing.faq.q4', 'landing.faq.a4'],
  ['landing.faq.q5', 'landing.faq.a5'],
  ['landing.faq.q6', 'landing.faq.a6'],
];

/** One container width for every section — wide on big screens, never cramped. */
const WRAP = 'mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-12 2xl:max-w-[1680px]';

export default function LandingPage({ doctors, appointments, onSignIn, onBook }: LandingPageProps) {
  const { t, lang } = usePreferences();
  const fee = PLATFORM_FEE;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [clinic, setClinic] = useState<ClinicInfo>({});
  const [department, setDepartment] = useState('ALL');
  const [location, setLocation] = useState('ALL');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const doctorsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/hospital/config')
      .then(r => (r.ok ? r.json() : {}))
      .then(setClinic)
      .catch(() => {});
  }, []);

  const live = useMemo(() => bookableDoctors(doctors), [doctors]);
  const departments = useMemo(() => departmentsOf(live), [live]);
  const locations = useMemo(
    () => Array.from(new Set(live.map(d => d.area || d.district).filter(Boolean) as string[])).sort(),
    [live]
  );
  const chambersByName = useMemo(() => {
    const m = new Map<string, number>();
    live.forEach(d => m.set(d.name, (m.get(d.name) ?? 0) + 1));
    return m;
  }, [live]);

  const results = useMemo(() => {
    const filtered = filterDoctors(live, {
      state: 'ALL',
      district: 'ALL',
      searchName: query,
      department,
      availability: 'ALL',
    }).filter(d => location === 'ALL' || d.area === location || d.district === location);
    return filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [live, query, department, location]);

  // Two full rows on very wide screens (5 per row), 2½ on desktop.
  const visible = showAll ? results : results.slice(0, 10);

  const stats = useMemo(
    () => ({
      doctors: new Set(live.map(d => d.name)).size,
      chambers: live.length,
      specialities: departments.length,
      bookings: appointments.filter(a => a.status !== 'cancelled').length,
    }),
    [live, departments, appointments]
  );

  /** Genuine patient feedback only — first names, never invented reviews. */
  const reviews = useMemo(
    () =>
      appointments
        .filter(a => (a.feedbackRating ?? 0) >= 4 && (a.feedbackText || '').trim().length > 12)
        .slice(-3)
        .reverse()
        .map(a => ({
          text: a.feedbackText!.trim(),
          rating: a.feedbackRating!,
          name: (a.patientName || 'Patient').split(' ')[0],
          doctor: doctors.find(d => d.id === a.doctorId)?.name,
        })),
    [appointments, doctors]
  );

  const heroDoctors = useMemo(() => live.filter(d => d.image?.trim()).slice(0, 3), [live]);

  const scrollToDoctors = () => doctorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const runSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setShowAll(false);
    scrollToDoctors();
  };

  const pickDepartment = (dept: string) => {
    setDepartment(dept);
    setShowAll(false);
    scrollToDoctors();
  };

  const phone = clinic.phone || '+91 6454 240 100';
  const emergency = clinic.emergencyContact || '102';

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      {/* ------------------------------------------------------------ Top bar */}
      <div className="hidden bg-slate-950 text-[13px] text-white/75 md:block">
        <div className={`${WRAP} flex items-center justify-between gap-6 py-2`}>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-teal-300" /> {phone}
            </span>
            <span className="hidden items-center gap-2 lg:flex">
              <Mail className="h-3.5 w-3.5 text-teal-300" /> care@nexgenhealth.in
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-teal-300" /> {t('landing.topbar.online')}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2 font-semibold text-coral-300">
              <Siren className="h-3.5 w-3.5" /> {t('landing.topbar.emergency', { phone: emergency })}
            </span>
            <button type="button" onClick={() => setShowJoin(true)} className="cursor-pointer font-semibold text-white hover:text-teal-300">
              {t('landing.topbar.joinFree')}
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- Header */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className={`${WRAP} flex h-[72px] items-center gap-4`}>
          <a href="#top" aria-label="neXgen Healthcare" className="shrink-0">
            <Logo size="md" />
          </a>
          <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 xl:flex">
            {NAV.map(item => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[14px] font-semibold text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                {t(item.key)}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 xl:ml-3">
            <div className="hidden md:block">
              <PreferenceToggles />
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="hidden cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:inline-flex"
            >
              <UserRound className="h-4 w-4" /> {t('common.signIn')}
            </button>
            <button
              type="button"
              onClick={() => onBook(null)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-4 py-2.5 text-[14px] font-bold text-white shadow-sm transition-colors hover:bg-coral-600"
            >
              <CalendarCheck className="h-4 w-4" />
              <span className="hidden sm:inline">{t('common.bookAppointment')}</span>
              <span className="sm:hidden">{t('common.book')}</span>
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={t('common.menu')}
              aria-expanded={menuOpen}
              className="cursor-pointer rounded-lg p-2 text-slate-700 hover:bg-slate-100 xl:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white xl:hidden">
            <div className={`${WRAP} py-3`}>
              {NAV.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-[15px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t(item.key)}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignIn();
                }}
                className="mt-1 block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                {t('common.signIn')}
              </button>
              <div className="mt-2 border-t border-slate-100 px-3 pt-3 md:hidden">
                <PreferenceToggles />
              </div>
            </div>
          </nav>
        )}
      </header>

      <main id="top">
        {/* ------------------------------------------------------------ Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white">
          <div className="bg-dots pointer-events-none absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
          <div className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-teal-200/40 blur-3xl 2xl:h-[720px] 2xl:w-[720px]" />
          <div className="pointer-events-none absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-indigo-200/40 blur-3xl" />

          <div
            className={`${WRAP} relative grid items-center gap-12 pb-28 pt-10 sm:pt-14 lg:min-h-[calc(100svh-110px)] lg:grid-cols-[1.05fr_1fr] lg:pb-36 lg:pt-10 2xl:gap-20`}
          >
            <div className="animate-fade-up min-w-0 space-y-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-indigo-700 shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                {t('landing.hero.badge', { doctors: stats.doctors, specialities: stats.specialities })}
              </span>
              <h1
                className={`font-extrabold tracking-tight text-slate-950 ${
                  lang === 'hi'
                    ? 'text-[34px] leading-[1.25] sm:text-5xl sm:leading-[1.2] lg:text-[54px] 2xl:text-[66px]'
                    : 'text-[40px] leading-[1.06] sm:text-5xl lg:text-[60px] 2xl:text-[76px]'
                }`}
              >
                {t('landing.hero.title1')}
                <br />
                <span className="text-brand-gradient">{t('landing.hero.title2')}</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-slate-600 2xl:max-w-2xl 2xl:text-xl">
                {t('landing.hero.text', { fee })}
              </p>

              {/* Search */}
              <form
                onSubmit={runSearch}
                className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift sm:grid-cols-[1.1fr_1fr_auto] 2xl:max-w-3xl"
              >
                <label className="flex items-center gap-2.5 rounded-xl px-3 py-2 sm:border-r sm:border-slate-100">
                  <Stethoscope className="h-5 w-5 shrink-0 text-indigo-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {t('landing.search.speciality')}
                    </span>
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full cursor-pointer bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                    >
                      <option value="ALL">{t('landing.search.anySpeciality')}</option>
                      {departments.map(d => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </span>
                </label>
                <label className="flex items-center gap-2.5 rounded-xl px-3 py-2">
                  <MapPin className="h-5 w-5 shrink-0 text-teal-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {t('landing.search.location')}
                    </span>
                    <select
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      className="w-full cursor-pointer bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                    >
                      <option value="ALL">{t('landing.search.anywhere')}</option>
                      {locations.map(l => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </span>
                </label>
                <button
                  type="submit"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-indigo-700"
                >
                  <Search className="h-5 w-5" /> {t('landing.search.find')}
                </button>
                <div className="relative sm:col-span-3">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('landing.search.placeholder')}
                    aria-label={t('landing.search.find')}
                    className="w-full rounded-xl bg-slate-50 py-3 pl-10 pr-3 text-[14px] text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </form>

              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] font-semibold text-slate-700">
                {(['landing.hero.chip1', 'landing.hero.chip2', 'landing.hero.chip3', 'landing.hero.chip4'] as StringKey[]).map(k => (
                  <li key={k} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" /> {t(k, { fee })}
                  </li>
                ))}
              </ul>
            </div>

            {/* Hero visual — real doctors from the directory */}
            <div className="relative mx-auto hidden w-full max-w-md md:block lg:max-w-lg 2xl:max-w-xl">
              <div className="bg-brand absolute inset-6 -rotate-6 rounded-[40px] opacity-90" />
              <div className="relative overflow-hidden rounded-[36px] border-8 border-white bg-white shadow-2xl">
                {heroDoctors[0] ? (
                  <DoctorAvatar doctor={heroDoctors[0]} className="h-[420px] w-full text-6xl lg:h-[460px] 2xl:h-[560px]" />
                ) : (
                  <div className="bg-brand flex h-[440px] items-center justify-center">
                    <LogoMark size={120} />
                  </div>
                )}
                {heroDoctors[0] && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-6 pb-12 pt-20 text-white">
                    <p className="text-lg font-bold">{heroDoctors[0].name}</p>
                    <p className="text-sm text-white/80">{heroDoctors[0].specialty}</p>
                  </div>
                )}
              </div>

              <div className="animate-float absolute -left-6 top-16 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl lg:-left-14">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <Ticket className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[12px] font-medium text-slate-500">{t('landing.hero.bookingConfirmed')}</p>
                    <p className="font-mono text-lg font-bold text-slate-900">{t('common.token')} T-08</p>
                  </div>
                </div>
              </div>

              <div className="animate-float absolute -right-4 bottom-24 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl [animation-delay:1.2s] lg:-right-10">
                <p className="text-[12px] font-medium text-slate-500">{t('landing.hero.youPay')}</p>
                <p className="text-3xl font-extrabold text-coral-500">₹{fee}</p>
                <p className="text-[11px] text-slate-500">{t('landing.hero.feeAtClinic')}</p>
              </div>

              {heroDoctors.length > 1 && (
                <div className="absolute -bottom-7 right-8 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl">
                  <div className="flex -space-x-3">
                    {heroDoctors.map(d => (
                      <React.Fragment key={d.id}>
                        <DoctorAvatar doctor={d} className="h-10 w-10 rounded-full border-2 border-white text-xs" />
                      </React.Fragment>
                    ))}
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-sm font-bold text-slate-900">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {t('landing.hero.topRated')}
                    </p>
                    <p className="text-[12px] text-slate-500">{t('landing.hero.verifiedReviewed')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* -------------------------------------------- Feature boxes (overlap) */}
        <section className="relative z-10 -mt-20">
          <div className={`${WRAP} grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-6`}>
            {[
              { icon: Ticket, title: 'landing.feat.token.t', text: 'landing.feat.token.d', tone: 'bg-indigo-600' },
              { icon: Video, title: 'landing.feat.video.t', text: 'landing.feat.video.d', tone: 'bg-teal-600' },
              { icon: FileText, title: 'landing.feat.rx.t', text: 'landing.feat.rx.d', tone: 'bg-sky-600' },
              { icon: BellRing, title: 'landing.feat.alerts.t', text: 'landing.feat.alerts.d', tone: 'bg-coral-500' },
            ].map((f, i) => (
              <div
                key={f.title}
                className="animate-fade-up rounded-2xl border border-slate-100 bg-white p-6 shadow-lift 2xl:p-8"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${f.tone}`}>
                  <f.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-slate-900">{t(f.title as StringKey)}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{t(f.text as StringKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------- Specialities */}
        <section id="specialities" className="scroll-mt-24 py-20 lg:py-24">
          <div className={WRAP}>
            <SectionHeading eyebrow={t('landing.spec.eyebrow')} title={t('landing.spec.title')} text={t('landing.spec.text')} />
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6 2xl:gap-4">
              {departments.map(dept => {
                const Icon = departmentIcon(dept);
                const count = live.filter(d => d.department === dept).length;
                const active = department === dept;
                return (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => pickDepartment(dept)}
                    className={`group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all hover:-translate-y-0.5 hover:shadow-lift ${
                      active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-teal-50 text-indigo-600 transition-colors group-hover:from-indigo-600 group-hover:to-teal-500 group-hover:text-white">
                      <Icon className="h-7 w-7" />
                    </span>
                    <span>
                      <span className="block text-[15px] font-bold text-slate-900">{dept}</span>
                      <span className="text-[12px] text-slate-500">
                        {count} {count === 1 ? t('common.chamber') : t('common.chambers')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Doctors */}
        <section id="doctors" ref={doctorsRef} className="scroll-mt-20 bg-slate-50 py-20 lg:py-24">
          <div className={WRAP}>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHeading
                align="left"
                eyebrow={t('landing.docs.eyebrow')}
                title={department === 'ALL' ? t('landing.docs.titleAll') : t('landing.docs.titleDept', { dept: department })}
                text={
                  location !== 'ALL'
                    ? t('landing.docs.countIn', { n: results.length, loc: location, fee })
                    : t('landing.docs.count', { n: results.length, fee })
                }
              />
              {(department !== 'ALL' || location !== 'ALL' || query) && (
                <button
                  type="button"
                  onClick={() => {
                    setDepartment('ALL');
                    setLocation('ALL');
                    setQuery('');
                  }}
                  className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {t('common.clearFilters')}
                </button>
              )}
            </div>

            <div className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {['ALL', ...departments].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepartment(d)}
                  className={`shrink-0 cursor-pointer rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                    department === d
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                  }`}
                >
                  {d === 'ALL' ? t('landing.docs.all') : d}
                </button>
              ))}
            </div>

            {results.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <p className="text-lg font-bold text-slate-900">{t('landing.docs.none')}</p>
                <p className="mt-1 text-sm text-slate-500">{t('landing.docs.noneText')}</p>
              </div>
            ) : (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 2xl:gap-6">
                {visible.map(doc => (
                  <React.Fragment key={doc.id}>
                    <DoctorCard
                      doctor={doc}
                      appointments={appointments}
                      onBook={onBook}
                      otherChambers={(chambersByName.get(doc.name) ?? 1) - 1}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}

            {results.length > visible.length && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="cursor-pointer rounded-xl border border-indigo-200 bg-white px-6 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  {t('landing.docs.showAll', { n: results.length })}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- How it works */}
        <section id="how" className="scroll-mt-24 py-20 lg:py-24">
          <div className={`${WRAP} grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] 2xl:gap-20`}>
            <div>
              <SectionHeading align="left" eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} text={t('landing.how.text')} />
              <ol className="mt-10 space-y-6">
                {[
                  { icon: Search, title: 'landing.how.s1.t', text: 'landing.how.s1.d' },
                  { icon: CalendarCheck, title: 'landing.how.s2.t', text: 'landing.how.s2.d' },
                  { icon: Ticket, title: 'landing.how.s3.t', text: 'landing.how.s3.d' },
                ].map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lift">
                      <step.icon className="h-6 w-6" />
                      <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-coral-500 text-[12px] font-bold text-white ring-2 ring-white">
                        {i + 1}
                      </span>
                    </span>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{t(step.title as StringKey, { fee })}</h3>
                      <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{t(step.text as StringKey)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={() => onBook(null)}
                className="mt-10 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-6 py-3.5 text-[15px] font-bold text-white shadow-sm hover:bg-coral-600"
              >
                {t('landing.how.cta')} <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Pricing explainer */}
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-lift 2xl:p-10">
              <p className="text-sm font-bold uppercase tracking-wider text-indigo-600">{t('landing.price.eyebrow')}</p>
              <h3 className="mt-2 text-2xl font-extrabold text-slate-900">{t('landing.price.title')}</h3>
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-coral-50 p-5">
                  <div>
                    <p className="font-bold text-slate-900">{t('landing.price.online')}</p>
                    <p className="text-[13px] text-slate-600">{t('landing.price.onlineD')}</p>
                  </div>
                  <p className="text-3xl font-extrabold text-coral-600">₹{fee}</p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-teal-50 p-5">
                  <div>
                    <p className="font-bold text-slate-900">{t('landing.price.doctor')}</p>
                    <p className="text-[13px] text-slate-600">{t('landing.price.doctorD')}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-bold text-teal-700">{t('landing.price.atClinic')}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-2.5 text-[14px] text-slate-700">
                {(['landing.price.p1', 'landing.price.p2', 'landing.price.p3'] as StringKey[]).map(k => (
                  <li key={k} className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t(k, { fee })}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Stats */}
        <section className="bg-brand relative overflow-hidden py-16 text-white lg:py-20">
          <div className="bg-crosses absolute inset-0" />
          <div className={`${WRAP} relative grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4`}>
            {[
              { icon: Stethoscope, value: stats.doctors, key: 'landing.stats.doctors' },
              { icon: Building2, value: stats.chambers, key: 'landing.stats.chambers' },
              { icon: HeartHandshake, value: stats.specialities, key: 'landing.stats.specialities' },
              { icon: Users, value: stats.bookings, key: 'landing.stats.bookings' },
            ].map(s => (
              <div key={s.key}>
                <s.icon className="mx-auto h-8 w-8 text-white/80" />
                <p className="mt-3 text-4xl font-extrabold tracking-tight 2xl:text-5xl">{s.value.toLocaleString('en-IN')}+</p>
                <p className="mt-1 text-sm font-medium text-white/80">{t(s.key as StringKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------ For doctors */}
        <section id="for-doctors" className="scroll-mt-24 py-20 lg:py-24">
          <div className={WRAP}>
            <div className="overflow-hidden rounded-[32px] bg-slate-950 text-white ring-1 ring-white/5">
              <div className="grid gap-10 p-7 sm:p-12 lg:grid-cols-[1.15fr_1fr] lg:p-14 2xl:p-20">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-teal-300">
                    <Stethoscope className="h-4 w-4" /> {t('landing.fd.badge')}
                  </span>
                  <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl 2xl:text-5xl">
                    {t('landing.fd.title1')} <span className="text-teal-300">{t('landing.fd.title2')}</span>
                  </h2>
                  <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/75">{t('landing.fd.text', { fee })}</p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setShowJoin(true)}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-6 py-3.5 text-[15px] font-bold text-white hover:bg-coral-600"
                    >
                      {t('landing.fd.join')} <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-[15px] font-bold text-white hover:bg-white/10"
                    >
                      {t('landing.fd.signin')}
                    </button>
                  </div>

                  {/* Video teaser */}
                  <button
                    type="button"
                    onClick={() => setShowVideo(true)}
                    className="group relative mt-8 block w-full max-w-xl cursor-pointer overflow-hidden rounded-2xl text-left ring-1 ring-white/10"
                    aria-label={t('landing.fd.watch')}
                  >
                    <img
                      src="/media/nexgen-for-doctors-poster.jpg"
                      alt=""
                      className="aspect-video w-full object-cover opacity-60 transition-opacity group-hover:opacity-75"
                      onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/90 via-slate-950/40 to-transparent" />
                    <div className="absolute inset-0 flex items-end gap-5 p-6">
                      <span className="flex h-16 w-16 shrink-0 animate-pulse-ring items-center justify-center rounded-full bg-white text-coral-500 shadow-xl transition-transform group-hover:scale-110">
                        <PlayCircle className="h-9 w-9" />
                      </span>
                      <span>
                        <span className="block text-xl font-extrabold">{t('landing.video.title')}</span>
                        <span className="mt-1 block text-[14px] text-white/85">{t('landing.video.sub')}</span>
                      </span>
                    </div>
                  </button>
                </div>
                <ul className="grid gap-3 self-center">
                  {[
                    { icon: IndianRupee, t: 'landing.fd.b1.t', d: 'landing.fd.b1.d' },
                    { icon: CalendarCheck, t: 'landing.fd.b2.t', d: 'landing.fd.b2.d' },
                    { icon: Video, t: 'landing.fd.b3.t', d: 'landing.fd.b3.d' },
                    { icon: FileText, t: 'landing.fd.b4.t', d: 'landing.fd.b4.d' },
                  ].map(b => (
                    <li key={b.t} className="flex gap-4 rounded-2xl bg-white/5 p-4 2xl:p-5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300">
                        <b.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold">{t(b.t as StringKey)}</p>
                        <p className="text-[14px] text-white/65">{t(b.d as StringKey)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Reviews */}
        {reviews.length > 0 && (
          <section className="bg-slate-50 py-20">
            <div className={WRAP}>
              <SectionHeading eyebrow={t('landing.reviews.eyebrow')} title={t('landing.reviews.title')} />
              <div className="mt-10 grid gap-5 md:grid-cols-3">
                {reviews.map((r, i) => (
                  <figure key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
                    <Quote className="h-8 w-8 text-indigo-200" />
                    <blockquote className="mt-3 text-[15px] leading-relaxed text-slate-700">“{r.text}”</blockquote>
                    <figcaption className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span>
                        <span className="block font-bold text-slate-900">{r.name}</span>
                        {r.doctor && <span className="text-[13px] text-slate-500">{t('landing.reviews.visited', { doctor: r.doctor })}</span>}
                      </span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: r.rating }).map((_, s) => (
                          <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-24 py-20 lg:py-24">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <SectionHeading eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} />
            <div className="mt-10 space-y-3">
              {FAQ_KEYS.map(([q, a], i) => {
                const open = openFaq === i;
                return (
                  <div
                    key={q}
                    className={`rounded-2xl border bg-white transition-colors ${open ? 'border-indigo-200 shadow-soft' : 'border-slate-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
                    >
                      <span className="text-[16px] font-bold text-slate-900">{t(q, { fee })}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-indigo-600 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="px-5 pb-5 text-[15px] leading-relaxed text-slate-600">{t(a, { fee })}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ CTA banner */}
        <section className="pb-20">
          <div className={WRAP}>
            <div className="bg-brand relative overflow-hidden rounded-[32px] px-7 py-12 text-white sm:px-12 2xl:px-16 2xl:py-16">
              <div className="bg-crosses absolute inset-0" />
              <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight 2xl:text-4xl">{t('landing.cta.title')}</h2>
                  <p className="mt-2 text-white/85">{t('landing.cta.text', { fee })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onBook(null)}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-bold text-indigo-700 shadow-lg hover:bg-indigo-50"
                >
                  <CalendarCheck className="h-5 w-5" /> {t('landing.cta.button')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ------------------------------------------------------------ Footer */}
      <footer className="bg-slate-950 pt-16 text-white/70">
        <div className={`${WRAP} grid gap-10 pb-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]`}>
          <div>
            <Logo tone="dark" size="md" />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed">{t('landing.footer.about', { fee })}</p>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">{t('landing.footer.patients')}</p>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a href="#doctors" className="hover:text-white">
                  {t('landing.footer.find')}
                </a>
              </li>
              <li>
                <button type="button" onClick={() => onBook(null)} className="cursor-pointer hover:text-white">
                  {t('common.bookAppointment')}
                </button>
              </li>
              <li>
                <button type="button" onClick={onSignIn} className="cursor-pointer hover:text-white">
                  {t('landing.footer.myAppts')}
                </button>
              </li>
              <li>
                <a href="#faq" className="hover:text-white">
                  {t('landing.footer.help')}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">{t('landing.footer.specialities')}</p>
            <ul className="space-y-2.5 text-[14px]">
              {departments.slice(0, 6).map(d => (
                <li key={d}>
                  <button type="button" onClick={() => pickDepartment(d)} className="cursor-pointer hover:text-white">
                    {d}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-wider text-white">{t('landing.footer.contact')}</p>
            <ul className="space-y-3 text-[14px]">
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /> {clinic.address || 'Purnea, Bihar'}
              </li>
              <li className="flex gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /> {phone}
              </li>
              <li className="flex gap-2.5">
                <Siren className="mt-0.5 h-4 w-4 shrink-0 text-coral-300" /> {t('landing.topbar.emergency', { phone: emergency })}
              </li>
              <li>
                <button type="button" onClick={() => setShowJoin(true)} className="cursor-pointer font-semibold text-teal-300 hover:text-teal-200">
                  {t('landing.footer.join')}
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className={`${WRAP} flex flex-col items-center justify-between gap-2 border-t border-white/10 py-6 text-[13px] sm:flex-row`}>
          <span>{t('landing.footer.rights', { year: new Date().getFullYear() })}</span>
          <span className="font-semibold tracking-wide text-white/50">Powered by SRM ECO TECH</span>
        </div>
      </footer>

      {showJoin && <DoctorJoinForm onClose={() => setShowJoin(false)} />}
      {showVideo && <DoctorVideoModal onClose={() => setShowVideo(false)} />}
    </div>
  );
}

/**
 * The recorded presentation for doctors, with English and Hindi subtitle
 * tracks — the track matching the site language is switched on by default.
 */
function DoctorVideoModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = usePreferences();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={t('landing.video.title')}
      onClick={onClose}
    >
      <div className="w-full max-w-6xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3 text-white">
          <p className="text-lg font-bold">{t('landing.video.title')}</p>
          <div className="flex items-center gap-2">
            <a
              href="/doctors-video"
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 sm:inline-flex"
            >
              <MonitorPlay className="h-4 w-4" /> {t('landing.video.open')}
            </a>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="cursor-pointer rounded-lg bg-white/10 p-2 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <video
          className="aspect-video w-full rounded-2xl bg-black shadow-2xl"
          src={DOCTOR_VIDEO_SRC}
          controls
          autoPlay
          playsInline
          preload="metadata"
          poster="/media/nexgen-for-doctors-poster.jpg"
        >
          <track kind="subtitles" srcLang="en" label="English" src="/media/nexgen-for-doctors.en.vtt" default={lang === 'en'} />
          <track kind="subtitles" srcLang="hi" label="हिन्दी" src="/media/nexgen-for-doctors.hi.vtt" default={lang === 'hi'} />
        </video>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  align = 'center',
}: {
  eyebrow: string;
  title: string;
  text?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center 2xl:max-w-3xl' : 'max-w-2xl 2xl:max-w-3xl'}>
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-600">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl 2xl:text-5xl">{title}</h2>
      {text && <p className="mt-3 text-[16px] leading-relaxed text-slate-600 2xl:text-lg">{text}</p>}
    </div>
  );
}
