/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Lock, 
  Mail, 
  User, 
  Stethoscope, 
  Building, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  BadgeCheck,
  Zap, 
  Key, 
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Smartphone,
  UserPlus,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { LoggedInUser, Doctor, PatientHistory } from '../types';
import { authConfig } from '../config';
import { useT } from '../lib/preferences';
import type { StringKey } from '../i18n/strings';

/**
 * Compare phone numbers on their last ten digits.
 *
 * Records store contacts as "+91 98201 45678" while a patient signing in types
 * "9820145678" — without normalising, every OTP login would fail against a
 * number that is on file.
 */
const phoneKey = (value: string) => (value || '').replace(/\D/g, '').slice(-10);

/** Which way the visitor is getting in. */
type AuthMode = 'password' | 'otp' | 'register';

/** One sandbox sign-in. */
interface DemoAccount {
  name: string;
  email: string;
  password: string;
  id: string;
  role: LoggedInUser['role'];
  desc: string;
}

/** How each role is labelled and tinted wherever accounts are listed. */
const ROLE_STYLES: Record<LoggedInUser['role'], { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  patient: { label: 'Patient', icon: User, color: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' },
  doctor: { label: 'Doctor', icon: Stethoscope, color: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100' },
  hospital: { label: 'Front Desk', icon: Building, color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
  admin: { label: 'Admin', icon: ShieldCheck, color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100' },
};

/** The four portals, in the order they appear in the header switcher. */
const ROLE_OPTIONS = [
  { id: 'patient' as const, label: 'Patient', icon: User },
  { id: 'doctor' as const, label: 'Doctor', icon: Stethoscope },
  { id: 'hospital' as const, label: 'Front Desk', icon: Building },
  { id: 'admin' as const, label: 'Admin', icon: ShieldCheck },
];

/**
 * Renders its children into the app header's `#auth-header-slot`.
 *
 * The role switcher belongs visually to the header bar but logically to this
 * form — it drives which demo account is prefilled and which portal is signed
 * into. A portal keeps that state here instead of lifting it into App just to
 * relocate four buttons. `useLayoutEffect` resolves the host before paint, so
 * the tabs never flash in the wrong place; if the slot is absent (Login used
 * standalone) they simply render inline.
 */
function HeaderSlot({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [resolved, setResolved] = useState(false);

  useLayoutEffect(() => {
    setHost(document.getElementById('auth-header-slot'));
    setResolved(true);
  }, []);

  if (!resolved) return null;
  return host ? createPortal(children, host) : <>{children}</>;
}

interface LoginProps {
  doctors: Doctor[];
  patients: PatientHistory[];
  onLoginSuccess: (user: LoggedInUser) => void;
  /**
   * Creates the patient record behind self-registration and refreshes the app's
   * directory, so the new profile exists by the time they land on it. Omit to
   * disable registration for a screen.
   */
  onRegisterPatient?: (data: { name: string; contact: string }) => Promise<any>;
  /**
   * Why the visitor is here — e.g. "Sign in to book Dr. Priya Sundaram". When
   * set, the screen opens on the patient Mobile & OTP route, the fastest way
   * in for someone who just wants to finish a booking.
   */
  intentMessage?: string;
  /** Return to the public website. */
  onBackToSite?: () => void;
}

export default function Login({ doctors, patients, onLoginSuccess, onRegisterPatient, intentMessage, onBackToSite }: LoginProps) {
  const t = useT();
  const roleLabel = (role: LoggedInUser['role']) => t(`role.${role}` as StringKey);
  // Tabs for standard login: 'patient' | 'doctor' | 'hospital' | 'admin'
  const [selectedRole, setSelectedRole] = useState<'patient' | 'doctor' | 'hospital' | 'admin'>('patient');

  const [authMode, setAuthMode] = useState<AuthMode>(
    intentMessage && authConfig.otpLoginEnabled ? 'otp' : 'password'
  );

  // Input fields
  // Prefilled with the default patient account (see demoAccounts below).
  const [email, setEmail] = useState('rupam.kumar@gmail.com');
  const [password, setPassword] = useState('patient123');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Mobile + OTP sign-in
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Self-registration
  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [regOtpSent, setRegOtpSent] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Toggle for Demo Credentials on demand
  const [showDemoCredentials, setShowDemoCredentials] = useState(false);

  /** Clear anything left over from the previous route into the app. */
  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrorMsg('');
    setSuccessMsg('');
    setOtp('');
    setOtpSent(false);
    setRegOtp('');
    setRegOtpSent(false);
  };

  // Define Demo Credential Mappings — one default account per role tab.
  const demoAccounts = {
    patient: {
      name: "Rupam Kumar",
      email: "rupam.kumar@gmail.com",
      password: "patient123",
      id: "patient-5",
      role: "patient" as const,
      desc: "Online slot reservation, medical records, e-prescriptions & OPD tracking."
    },
    doctor: {
      name: "Dr. Santosh Kumar",
      email: "dr.santosh.kumar@nexgenhealth.in",
      password: "doctor123",
      id: "doc-13",
      role: "doctor" as const,
      desc: "Manage patient queues, issue digital Rx, and conduct telehealth video consultations."
    },
    hospital: {
      name: "Priya Ananth (Front Desk)",
      email: "frontdesk@nexgenhealth.in",
      password: "frontdesk123",
      id: "desk-1",
      role: "hospital" as const,
      desc: "Collect offline doctor consultation fees, print OPD tokens & process invoices."
    },
    admin: {
      name: "System Admin (neXgen India)",
      email: "admin@nexgenhealth.in",
      password: "admin123",
      id: "admin-1",
      role: "admin" as const,
      desc: "System administration, clinician onboarding, and health stack management."
    }
  };

  /**
   * Sign-ins that do not fit the one-account-per-role shape above.
   *
   * `demoAccounts` is keyed by role because the role tabs index into it to
   * prefill the form, so a second consultant has nowhere to live there. These
   * are matched on email + password like any other account, and the role tab
   * they belong to still prefills the primary account for that role.
   */
  const additionalAccounts: DemoAccount[] = [
    {
      // Kept as a sign-in because this is the profile carrying the seeded
      // appointment history, documents and prescriptions — the one to use when
      // demonstrating a populated patient portal.
      name: "Aarav Patel",
      email: "aarav.patel@gmail.com",
      password: "patient123",
      id: "patient-1",
      role: "patient",
      desc: "Seeded patient with appointment history, documents and prescriptions."
    },
    {
      name: "Dr. Rajesh Sharma",
      email: "dr.rajesh.sharma@nexgenhealth.in",
      password: "doctor123",
      id: "doc-1",
      role: "doctor",
      desc: "Senior consultant cardiologist with a seeded patient queue."
    },
    {
      name: "Dr. Amit Ranjan",
      email: "dr.amit.ranjan@nexgenhealth.in",
      password: "doctor123",
      id: "doc-amit",
      role: "doctor",
      desc: "Newly onboarded consultant doctor."
    }
  ];

  /** Every account the password form will accept. */
  const allAccounts: DemoAccount[] = [...Object.values(demoAccounts), ...additionalAccounts];

  // Helper to switch tab and pre-fill credentials
  const handleRoleTabChange = (role: 'patient' | 'doctor' | 'hospital' | 'admin') => {
    setSelectedRole(role);
    setErrorMsg('');
    setEmail(demoAccounts[role].email);
    setPassword(demoAccounts[role].password);
  };

  // Handle Standard Login Form Submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Check against demo accounts
    const targetDemo = demoAccounts[selectedRole];
    if (email.trim().toLowerCase() === targetDemo.email.toLowerCase() && password === targetDemo.password) {
      triggerLoginSuccess(targetDemo);
    } else {
      // Any other account whose email and password match — other roles, and the
      // extra consultants that have no role tab of their own.
      const match = allAccounts.find(
        acc => acc.email.toLowerCase() === email.trim().toLowerCase() && acc.password === password
      );
      if (match) {
        triggerLoginSuccess(match);
      } else {
        setErrorMsg(t('login.err.invalid'));
      }
    }
  };

  const triggerLoginSuccess = (account: DemoAccount) => {
    let resolvedId = account.id;
    let resolvedName = account.name;

    if (account.role === 'patient' && patients.length > 0) {
      const matchPatient = patients.find(p => p.email.toLowerCase() === account.email.toLowerCase()) || patients[0];
      resolvedId = matchPatient.id;
      resolvedName = matchPatient.name;
    } else if (account.role === 'doctor' && doctors.length > 0) {
      /**
       * Resolve on the account's own id first.
       *
       * This used to match on the name containing "sharma" or "rajesh", which
       * was fine while there was exactly one demo consultant — with a second,
       * it would have signed Dr. Santosh Kumar in as Dr. Sharma and shown him
       * another doctor's queue. Name is kept only as a fallback for a record
       * whose id has changed.
       */
      const matchDoc =
        doctors.find(d => d.id === account.id) ||
        doctors.find(d => d.name.toLowerCase() === account.name.toLowerCase()) ||
        doctors[0];
      resolvedId = matchDoc.id;
      resolvedName = matchDoc.name;
    }

    setSuccessMsg(`Welcome Back, ${resolvedName}! Accessing neXgen-HealthCare portal...`);
    setTimeout(() => {
      onLoginSuccess({
        role: account.role,
        id: resolvedId,
        name: resolvedName,
        email: account.email
      });
    }, 800);
  };

  // One-click quick login bypass
  const handleQuickLogin = (role: 'patient' | 'doctor' | 'hospital' | 'admin') => {
    handleRoleTabChange(role);
    triggerLoginSuccess(demoAccounts[role]);
  };

  /* ---------------------------------------------------------------------
     Mobile + OTP sign-in.

     No gateway sends anything: "Send OTP" only checks the number is on file
     and reveals the fixed demo code. Verification is a string comparison in
     the browser, which is fine for a sandbox and is exactly what must move
     server-side before this faces real patients.
     --------------------------------------------------------------------- */

  /** The patient record behind a typed mobile number, if there is one. */
  const findPatientByMobile = (value: string) => {
    const key = phoneKey(value);
    if (key.length < 10) return undefined;
    return patients.find(p => phoneKey(p.contact) === key);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (phoneKey(mobile).length < 10) {
      setErrorMsg(t('login.err.mobile10'));
      return;
    }
    if (!findPatientByMobile(mobile)) {
      setErrorMsg(t('login.err.noPatient'));
      return;
    }

    setOtpSent(true);
    setSuccessMsg(t('login.ok.otpSent', { mobile, otp: authConfig.demoOtp }));
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (otp.trim() !== authConfig.demoOtp) {
      setErrorMsg(t('login.err.otp'));
      return;
    }

    const patient = findPatientByMobile(mobile);
    if (!patient) {
      setErrorMsg('That mobile number is no longer on file. Please register again.');
      return;
    }

    setSuccessMsg(`Welcome back, ${patient.name}! Accessing neXgen-HealthCare portal...`);
    setTimeout(() => {
      onLoginSuccess({ role: 'patient', id: patient.id, name: patient.name, email: patient.email || '' });
    }, 800);
  };

  /* ---------------------------------------------------------------------
     Self-registration — name and mobile only. Everything else is filled in
     by the patient on their Profile page once they are inside.
     --------------------------------------------------------------------- */

  const handleSendRegistrationOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!regName.trim()) {
      setErrorMsg(t('login.err.name'));
      return;
    }
    if (phoneKey(regMobile).length < 10) {
      setErrorMsg(t('login.err.mobile10'));
      return;
    }
    if (findPatientByMobile(regMobile)) {
      setErrorMsg(t('login.err.exists'));
      return;
    }

    setRegOtpSent(true);
    setSuccessMsg(t('login.ok.otpSent', { mobile: regMobile, otp: authConfig.demoOtp }));
  };

  const handleConfirmRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (regOtp.trim() !== authConfig.demoOtp) {
      setErrorMsg(t('login.err.otp'));
      return;
    }
    if (!onRegisterPatient) {
      setErrorMsg('Registration is unavailable on this screen.');
      return;
    }

    setIsRegistering(true);
    try {
      const created = await onRegisterPatient({ name: regName.trim(), contact: regMobile.trim() });
      if (!created?.id) {
        setErrorMsg('Could not create your profile. Please try again.');
        return;
      }

      setSuccessMsg(`Welcome, ${created.name}! Taking you to your profile to complete the details...`);
      setTimeout(() => {
        onLoginSuccess({ role: 'patient', id: created.id, name: created.name, email: created.email || '' });
      }, 900);
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not reach the clinic server. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-[calc(100svh-4rem)] w-full flex flex-col lg:flex-row bg-slate-50 font-sans">

      {/* ========================================================= */}
      {/* ROLE PORTAL SWITCHER — rendered into the app header bar    */}
      {/* ========================================================= */}
      {/* Password sign-in only: OTP resolves the role from the mobile number
          itself, and self-registration is always a patient. */}
      {authMode === 'password' && (
        <HeaderSlot>
          <nav aria-label="Select role portal" className="flex min-w-0 items-center gap-2">
            <span className="hidden shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 xl:inline">
              {t('login.rolePortal')}
            </span>
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100 p-1">
              {ROLE_OPTIONS.map(role => {
                const isSelected = selectedRole === role.id;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleRoleTabChange(role.id)}
                    aria-pressed={isSelected}
                    // The label is dropped on narrow screens so four tabs still
                    // fit a phone header; the icon keeps its accessible name.
                    aria-label={`${role.label} portal`}
                    title={roleLabel(role.id)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    <role.icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{roleLabel(role.id)}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </HeaderSlot>
      )}


      {/* ========================================================= */}
      {/* LEFT SIDE: BRANDING, HERO IMAGE & TAGLINE                 */}
      {/* ========================================================= */}
      <div className="w-full lg:w-3/5 bg-gradient-to-br from-indigo-100 via-white to-teal-100 text-slate-900 relative flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden min-h-[380px] lg:min-h-[calc(100svh-4rem)] border-b lg:border-b-0 lg:border-r border-indigo-100">
        
        {/* Background Image with Light Blue Gradient Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-multiply transform scale-105 transition-transform duration-1000"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&q=80&w=1600')` 
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-100/90 via-white/70 to-teal-50/80" />

        {/* Top status strip — the wordmark now lives in the app shell header. */}
        <div className="relative z-10 flex items-center justify-end">
          <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md border border-sky-200 text-xs font-bold text-slate-700 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('login.live')}</span>
          </div>
        </div>

        {/* Hero Middle Content */}
        <div className="relative z-10 my-auto py-8 space-y-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-200/70 border border-sky-300 text-sky-900 text-xs font-extrabold backdrop-blur-md shadow-2xs">
            <BadgeCheck className="h-4 w-4 text-sky-700" />
            <span>{t('login.hero.badge')}</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              {t('login.hero.title1')} <span className="text-brand-gradient">{t('login.hero.title2')}</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium">
              {t('login.hero.text')}
            </p>
          </div>

          {/* Key Feature Cards */}
          {/* 3-up only when the hero is full width or the screen is genuinely wide.
              Between lg and xl the hero is just 60% of the viewport, where three
              columns squeeze each card to one word per line. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-white/80 border border-sky-200/90 backdrop-blur-md space-y-1 shadow-2xs">
              <div className="flex items-center gap-2 text-sky-800 font-black text-xs">
                <CreditCard className="h-4 w-4 shrink-0 text-sky-600" />
                <span>{t('login.f1.t')}</span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium leading-snug">{t('login.f1.d')}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 border border-sky-200/90 backdrop-blur-md space-y-1 shadow-2xs">
              <div className="flex items-center gap-2 text-teal-800 font-black text-xs">
                <Building className="h-4 w-4 shrink-0 text-teal-600" />
                <span>{t('login.f2.t')}</span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium leading-snug">{t('login.f2.d')}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 border border-sky-200/90 backdrop-blur-md space-y-1 shadow-2xs">
              <div className="flex items-center gap-2 text-blue-800 font-black text-xs">
                <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                <span>{t('login.f3.t')}</span>
              </div>
              <p className="text-[11px] text-slate-600 font-medium leading-snug">{t('login.f3.d')}</p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-6 border-t border-sky-200/80 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <span>© 2026 neXgen-HealthCare India</span>
          <span className="text-sky-900 font-bold">256-Bit Encrypted Healthcare Network</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT SIDE: LOGIN FORM & ON-DEMAND DEMO CREDENTIALS       */}
      {/* ========================================================= */}
      <div className="w-full lg:w-2/5 flex flex-col justify-center p-6 sm:p-10 lg:p-12 bg-white lg:border-l border-slate-200/80">
        <div className="max-w-md w-full mx-auto space-y-6">
          
          {onBackToSite && (
            <button
              type="button"
              onClick={onBackToSite}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-indigo-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t('login.back')}
            </button>
          )}

          {intentMessage && (
            <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-bold text-indigo-950">{intentMessage}</p>
                <p className="mt-0.5 text-[12px] text-indigo-900/75">{t('login.intentHint')}</p>
              </div>
            </div>
          )}

          {/* Header Title */}
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {authMode === 'register' ? t('login.titleRegister') : t('login.title')}
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              {authMode === 'register' ? t('login.subRegister') : t('login.sub')}
            </p>
          </div>

          {/* Sign-in method switch. Hidden while registering — that flow has its
              own OTP step and its own way back. */}
          {authConfig.otpLoginEnabled && authMode !== 'register' && (
            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                {t('login.method')}
              </label>
              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
                {[
                  { id: 'password' as const, label: t('login.method.password'), icon: Lock },
                  { id: 'otp' as const, label: t('login.method.otp'), icon: Smartphone },
                ].map(option => {
                  const isSelected = authMode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => switchMode(option.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      <option.icon className="h-4 w-4 shrink-0" />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No role panel here — the switcher in the header bar is the only
              place the portal is chosen or shown. */}

          {/* Status banners, shared by all three flows. */}
          {errorMsg && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 font-bold flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 font-bold flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 animate-bounce" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ---------------- Mobile & OTP sign-in ---------------- */}
          {authMode === 'otp' && (
            <form className="space-y-4" onSubmit={otpSent ? handleVerifyOtp : handleSendOtp}>
              <div className="space-y-1.5">
                <label htmlFor="mobile" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  {t('login.mobile')}
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Smartphone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="mobile"
                    type="tel"
                    inputMode="tel"
                    required
                    value={mobile}
                    onChange={e => { setMobile(e.target.value); setOtpSent(false); setSuccessMsg(''); }}
                    className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    placeholder="e.g. 98201 45678"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-medium px-1">
                  {t('login.mobileHint')}
                </p>
              </div>

              {otpSent && (
                <div className="space-y-1.5">
                  <label htmlFor="otp" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    {t('login.otp')}
                  </label>
                  <div className="relative rounded-xl">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Key className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black tracking-[0.3em] text-slate-800 placeholder-slate-300 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                      placeholder="••••••"
                    />
                  </div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-bold">
                    {t('login.sandbox')} <span className="font-mono">{authConfig.demoOtp}</span>.
                  </p>
                </div>
              )}

              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md shadow-indigo-200 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer"
              >
                <span>{otpSent ? t('login.verify') : t('login.sendOtp')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              {otpSent && (
                <button
                  type="button"
                  onClick={() => { setOtpSent(false); setOtp(''); setSuccessMsg(''); }}
                  className="w-full text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {t('login.changeMobile')}
                </button>
              )}
            </form>
          )}

          {/* ---------------- New patient registration ---------------- */}
          {authMode === 'register' && (
            <form className="space-y-4" onSubmit={regOtpSent ? handleConfirmRegistration : handleSendRegistrationOtp}>
              <div className="space-y-1.5">
                <label htmlFor="regName" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  {t('login.fullName')}
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="regName"
                    type="text"
                    required
                    value={regName}
                    onChange={e => { setRegName(e.target.value); setRegOtpSent(false); }}
                    className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    placeholder="e.g. Golu Kumar"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="regMobile" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                  {t('login.mobileNumber')}
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Smartphone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="regMobile"
                    type="tel"
                    inputMode="tel"
                    required
                    value={regMobile}
                    onChange={e => { setRegMobile(e.target.value); setRegOtpSent(false); }}
                    className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    placeholder="e.g. 77820 58185"
                  />
                </div>
              </div>

              {regOtpSent && (
                <div className="space-y-1.5">
                  <label htmlFor="regOtp" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    {t('login.confirmOtp')}
                  </label>
                  <div className="relative rounded-xl">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Key className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      id="regOtp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={regOtp}
                      onChange={e => setRegOtp(e.target.value)}
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black tracking-[0.3em] text-slate-800 placeholder-slate-300 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                      placeholder="••••••"
                    />
                  </div>
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-bold">
                    {t('login.sandbox')} <span className="font-mono">{authConfig.demoOtp}</span>.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md shadow-indigo-200 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-60"
              >
                {isRegistering && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{regOtpSent ? t('login.create') : t('login.sendOtp')}</span>
                {!isRegistering && <ArrowRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => switchMode('password')}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('login.backToSignIn')}
              </button>
            </form>
          )}

          {/* ---------------- User ID & password ---------------- */}
          {authMode === 'password' && (
          <form className="space-y-4" onSubmit={handleFormSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                {t('login.email')}
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="Enter email address"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                {t('login.password')}
              </label>
              <div className="relative rounded-xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md shadow-indigo-200 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <span>{t('login.submit')}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          )}

          {/* New-patient route in. Kept out of the register flow itself, which
              already offers its own way back. */}
          {authConfig.selfRegistrationEnabled && onRegisterPatient && authMode !== 'register' && (
            <button
              type="button"
              onClick={() => switchMode('register')}
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200/80 px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4 text-indigo-600" />
              <span>{t('login.register')}</span>
            </button>
          )}

          {/* On-Demand Demo Credentials Toggle Link */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <button
              type="button"
              onClick={() => setShowDemoCredentials(!showDemoCredentials)}
              className="w-full flex items-center justify-between text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200/80 px-4 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Key className="h-4 w-4 text-indigo-600" />
                <span>{t('login.demo')}</span>
              </span>
              {showDemoCredentials ? (
                <ChevronUp className="h-4 w-4 text-indigo-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-indigo-600" />
              )}
            </button>

            {/* Expandable Demo Credentials Box */}
            {showDemoCredentials && (
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Instant Demo Accounts & One-Click Login
                  </span>
                  <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-extrabold">
                    Sandbox
                  </span>
                </div>

                {/* 1-Click Quick Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Rendered from the account data, not a parallel hand-written
                      list — the names here used to drift the moment a default
                      account changed. */}
                  {allAccounts.map(acc => {
                    const style = ROLE_STYLES[acc.role];
                    const isRoleDefault = demoAccounts[acc.role]?.email === acc.email;
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() =>
                          isRoleDefault ? handleQuickLogin(acc.role) : triggerLoginSuccess(acc)
                        }
                        className={`text-left p-2.5 border rounded-xl transition-all cursor-pointer ${style.color} flex items-center gap-2`}
                      >
                        <style.icon className="h-4 w-4 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black truncate">{style.label}</p>
                          <p className="text-[10px] opacity-80 truncate">{acc.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Password Table */}
                <div className="space-y-1.5 text-[11px] pt-1">
                  {allAccounts.map(acc => (
                    <div key={acc.email} className="flex items-center justify-between border-b border-slate-200/80 pb-1 last:border-b-0">
                      <span className="text-slate-600 font-medium">
                        {ROLE_STYLES[acc.role].label}: <strong className="text-slate-800">{acc.email}</strong>
                      </span>
                      <span className="font-mono font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                        {acc.password}
                      </span>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </div>

          {/* Attribution — last element in the sign-in column, so it sits at the
              foot of the page on mobile and under the card on desktop. */}
          <p className="border-t border-slate-100 pt-4 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Powered by SRM ECO TECH
          </p>

        </div>
      </div>

    </div>
  );
}
