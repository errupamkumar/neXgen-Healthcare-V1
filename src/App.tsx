/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  History,
  Users,
  FileText,
  Video,
  LayoutDashboard,
  UserCheck,
  LogOut,
  Menu,
  X,
  RefreshCw,
  Stethoscope,
  CheckCircle2,
  MessageSquare,
  Home,
  UserPlus,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import { Doctor, PatientHistory, MedicalDocument, Appointment, LoggedInUser, DeskMessage } from './types';
import { buildPrescriptionText } from './lib/prescription';
import { todayLocal } from './lib/appointments';
import DoctorQueue from './components/DoctorQueue';
import Dashboard from './components/Dashboard';
import DoctorDashboard from './components/DoctorDashboard';
import { doctorPortalConfig } from './config';
import DoctorBooking from './components/DoctorBooking';
import PatientRecords from './components/PatientRecords';
import DocumentManager from './components/DocumentManager';
import TelehealthCabin from './components/TelehealthCabin';
import PersonaConsole from './components/PersonaConsole';
import MessageCenter, { SendMessagePayload } from './components/MessageCenter';
import Login from './components/Login';
import Logo, { LogoMark, ROLE_THEME } from './components/brand/Logo';
import LandingPage from './components/public/LandingPage';
import PatientHome, { BookIntent } from './components/patient/PatientHome';
import MyAppointments from './components/patient/MyAppointments';
import DoctorApplications from './components/admin/DoctorApplications';
import { PreferenceToggles, usePreferences, useT } from './lib/preferences';
import type { StringKey } from './i18n/strings';

type Role = LoggedInUser['role'];
type TabId =
  | 'home'
  | 'portal'
  | 'upcoming'
  | 'appt-history'
  | 'queue'
  | 'completed'
  | 'dashboard'
  | 'book'
  | 'patients'
  | 'documents'
  | 'messages'
  | 'telehealth'
  | 'onboarding';

interface NavItem {
  id: TabId;
  labelKey: StringKey;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Which roles may see this destination. Omitted = everyone. */
  visibleTo?: Role[];
  /** Same destination, a clearer name for one role. */
  labelFor?: Partial<Record<Role, StringKey>>;
}

interface NavGroup {
  id: string;
  labelKey: StringKey;
  items: NavItem[];
}

/** A nav item after role filtering and translation. */
interface ResolvedNavItem {
  id: TabId;
  label: string;
  icon: NavItem['icon'];
}

/**
 * Navigation is declared as data rather than hand-written buttons so role
 * gating, the mobile drawer and the page header all read from one source.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    labelKey: 'nav.group.overview',
    items: [
      // A patient's front door: next visit + fastest way to book.
      { id: 'home', labelKey: 'nav.home', icon: Home, visibleTo: ['patient'] },
      // Doctors land on their own KPI dashboard — see renderContent().
      { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, visibleTo: ['doctor', 'admin', 'hospital'] },
      // For the desk and admin the persona console IS the workspace.
      {
        id: 'portal',
        labelKey: 'nav.deskWorkspace',
        icon: Settings,
        visibleTo: ['hospital', 'admin'],
        labelFor: { admin: 'nav.adminWorkspace' },
      },
    ],
  },
  {
    id: 'appointments',
    labelKey: 'nav.group.appointments',
    items: [
      { id: 'book', labelKey: 'nav.book', icon: CalendarPlus, visibleTo: ['patient', 'hospital', 'admin'] },
      { id: 'upcoming', labelKey: 'nav.myAppointments', icon: CalendarCheck, visibleTo: ['patient'] },
      { id: 'appt-history', labelKey: 'nav.visitHistory', icon: History, visibleTo: ['patient'] },
      // The working list — who is still to be seen.
      {
        id: 'queue',
        labelKey: 'nav.appointments',
        icon: Stethoscope,
        visibleTo: ['doctor', 'hospital', 'admin'],
        labelFor: { doctor: 'nav.myQueue' },
      },
      // Closed consultations live behind their own destination.
      { id: 'completed', labelKey: 'nav.completed', icon: CheckCircle2, visibleTo: ['doctor', 'hospital', 'admin'] },
    ],
  },
  {
    // The desk composes here, a patient reads here. Not shown to doctors:
    // clinic-wide announcements are a front desk function.
    id: 'communication',
    labelKey: 'nav.group.communication',
    items: [{ id: 'messages', labelKey: 'nav.messages', icon: MessageSquare, visibleTo: ['patient', 'hospital', 'admin'] }],
  },
  {
    id: 'records',
    labelKey: 'nav.group.records',
    items: [
      { id: 'patients', labelKey: 'nav.clinicalPatients', icon: Users, visibleTo: ['doctor', 'hospital', 'admin'] },
      { id: 'documents', labelKey: 'nav.documentVault', icon: FileText, labelFor: { patient: 'nav.healthVault' } },
    ],
  },
  {
    id: 'network',
    labelKey: 'nav.group.network',
    items: [{ id: 'onboarding', labelKey: 'nav.doctorOnboarding', icon: UserPlus, visibleTo: ['admin'] }],
  },
  {
    id: 'account',
    labelKey: 'nav.group.account',
    items: [{ id: 'portal', labelKey: 'nav.profile', icon: UserCheck, visibleTo: ['patient', 'doctor'] }],
  },
];

/** Page header title + subtitle keys, per destination. */
const PAGE_META: Record<TabId, { title: StringKey; subtitle: StringKey }> = {
  home: { title: 'page.home.title', subtitle: 'page.home.sub' },
  portal: { title: 'page.profile.title', subtitle: 'page.profile.subPatient' },
  upcoming: { title: 'page.upcoming.title', subtitle: 'page.upcoming.sub' },
  'appt-history': { title: 'page.history.title', subtitle: 'page.history.sub' },
  queue: { title: 'page.queue.title', subtitle: 'page.queue.sub' },
  completed: { title: 'page.completed.title', subtitle: 'page.completed.sub' },
  dashboard: { title: 'page.dashboard.title', subtitle: 'page.dashboard.sub' },
  book: { title: 'page.book.title', subtitle: 'page.book.sub' },
  patients: { title: 'page.patients.title', subtitle: 'page.patients.sub' },
  documents: { title: 'page.documents.title', subtitle: 'page.documents.sub' },
  messages: { title: 'page.messages.title', subtitle: 'page.messages.subPatient' },
  telehealth: { title: 'page.telehealth.title', subtitle: 'page.telehealth.sub' },
  onboarding: { title: 'page.onboarding.title', subtitle: 'page.onboarding.sub' },
};

/**
 * The Profile destination is shared by every role but means something different
 * to each: a patient's own record, a doctor's practice profile, or — for front
 * desk and admin — their full persona workspace.
 */
const PORTAL_META: Record<Role, { title: StringKey; subtitle: StringKey }> = {
  patient: { title: 'page.profile.title', subtitle: 'page.profile.subPatient' },
  doctor: { title: 'page.profile.title', subtitle: 'page.profile.subDoctor' },
  hospital: { title: 'page.desk.title', subtitle: 'page.desk.sub' },
  admin: { title: 'page.admin.title', subtitle: 'page.admin.sub' },
};

/** Same rail entry, opposite ends of the conversation. */
const MESSAGES_SUBTITLE: Record<Role, StringKey> = {
  patient: 'page.messages.subPatient',
  doctor: 'page.messages.subDoctor',
  hospital: 'page.messages.subStaff',
  admin: 'page.messages.subStaff',
};

/* -------------------------------------------------------------------------
   Session persistence — a refresh used to sign everyone out mid-task.
   ------------------------------------------------------------------------- */
const SESSION_KEY = 'nexgen.session.v1';

interface StoredSession {
  user: LoggedInUser;
  tab: TabId;
}

function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.user?.id || !parsed.user.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

function landingTabFor(role: Role): TabId {
  if (role === 'patient') return 'home';
  if (role === 'doctor') return doctorPortalConfig.landOnDashboard ? 'dashboard' : 'portal';
  return 'portal';
}

interface ActiveBookIntent extends BookIntent {
  /** Remounts the booking wizard so a new intent starts it fresh. */
  nonce: number;
}

export default function App() {
  const { t } = usePreferences();
  const restored = useMemo(readSession, []);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(restored?.user ?? null);
  const [activeTab, setActiveTab] = useState<TabId>(restored?.tab ?? 'home');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<PatientHistory[]>([]);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<DeskMessage[]>([]);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isNavOpen, setIsNavOpen] = useState<boolean>(false);

  // Signed-out: the public website, or the sign-in screen.
  const [publicView, setPublicView] = useState<'landing' | 'login'>('landing');
  /** What the visitor was doing when we asked them to sign in. */
  const [pendingIntent, setPendingIntent] = useState<BookIntent | null>(null);
  const [loginMessage, setLoginMessage] = useState<string>('');
  /** What the booking wizard should open with. */
  const [bookIntent, setBookIntent] = useState<ActiveBookIntent>({ nonce: 0 });

  // Persist the session (never the transient telehealth room).
  useEffect(() => {
    try {
      if (currentUser) {
        const tab = activeTab === 'telehealth' ? landingTabFor(currentUser.role) : activeTab;
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ user: currentUser, tab }));
      } else {
        window.localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* private mode / storage full — the session simply won't survive a refresh */
    }
  }, [currentUser, activeTab]);

  // Close the mobile drawer on Escape and lock the page behind it while open.
  useEffect(() => {
    if (!isNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isNavOpen]);

  // Fetch all initial data
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [docsRes, patsRes, docsVaultRes, apptsRes, msgsRes] = await Promise.all([
        fetch('/api/doctors'),
        fetch('/api/patients'),
        fetch('/api/documents'),
        fetch('/api/appointments'),
        fetch('/api/messages'),
      ]);

      if (docsRes.ok && patsRes.ok && docsVaultRes.ok && apptsRes.ok) {
        const docs = await docsRes.json();
        const pats = await patsRes.json();
        const docsVault = await docsVaultRes.json();
        const appts = await apptsRes.json();

        setDoctors(docs);
        setPatients(pats);
        setDocuments(docsVault);
        setAppointments(appts);
        // Messaging is additive — an older server without /api/messages should
        // still boot the rest of the console rather than fail the whole load.
        setMessages(msgsRes.ok ? await msgsRes.json() : []);
        setError('');
        setHasLoadedOnce(true);
      } else {
        setError('Clinical systems loading failure. Attempting dynamic retry...');
      }
    } catch (err) {
      console.error('Error fetching clinical state:', err);
      setError('Connection to clinic server is offline. Check backend status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  /**
   * A restored session must still point at a real record — after a data reset
   * the stored patient or doctor may be gone, and every page would then render
   * someone else's (or nobody's) data.
   */
  useEffect(() => {
    if (!hasLoadedOnce || !currentUser) return;
    const exists =
      currentUser.role === 'patient'
        ? patients.some(p => p.id === currentUser.id)
        : currentUser.role === 'doctor'
        ? doctors.some(d => d.id === currentUser.id)
        : true;
    if (!exists) {
      setCurrentUser(null);
      setPublicView('login');
    }
  }, [hasLoadedOnce, currentUser, patients, doctors]);

  const goToTab = useCallback((tab: TabId, opts?: { keepConsultation?: boolean }) => {
    setActiveTab(tab);
    if (!opts?.keepConsultation) setActiveAppointment(null);
    setIsNavOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  /** Open the booking wizard with a doctor, search or speciality already chosen. */
  const startBooking = useCallback(
    (intent: BookIntent = {}) => {
      setBookIntent({ ...intent, nonce: Date.now() });
      goToTab('book');
    },
    [goToTab]
  );

  /** Public site → "Book": remember the choice, sign in, then carry on. */
  const handlePublicBook = (doctor: Doctor | null, search?: string) => {
    setPendingIntent({ doctorId: doctor?.id, search });
    setLoginMessage(doctor ? `Sign in to book ${doctor.name}` : 'Sign in to book your appointment');
    setPublicView('login');
    window.scrollTo({ top: 0 });
  };

  const handleLoginSuccess = (u: LoggedInUser) => {
    setCurrentUser(u);
    setPublicView('landing');
    setLoginMessage('');
    if (pendingIntent && u.role !== 'doctor') {
      setBookIntent({ ...pendingIntent, nonce: Date.now() });
      setActiveTab('book');
    } else {
      setActiveTab(landingTabFor(u.role));
    }
    setPendingIntent(null);
    window.scrollTo({ top: 0 });
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setActiveTab('home');
    setActiveAppointment(null);
    setIsNavOpen(false);
    setPublicView('landing');
  };

  /** POST helper that always resolves to the JSON body, with `error` on failure. */
  const postJson = async (url: string, body: unknown) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json.error || 'Something went wrong. Please try again.' };
      return json;
    } catch {
      return { error: 'Network communication failure.' };
    }
  };

  // Action Handlers
  const handleBookAppointment = async (bookingData: any) => {
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      });

      const result = await response.json();
      if (response.ok) {
        // Refresh all states (gets updated slots, appointments and patient profiles)
        await loadAllData();
        return result;
      } else {
        return { error: result.error || 'Failed to book slot' };
      }
    } catch (err) {
      console.error(err);
      return { error: 'Network communication failure.' };
    }
  };

  const handleSavePatient = async (patientData: any) => {
    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData),
      });

      if (response.ok) {
        const saved = await response.json();
        await loadAllData();
        return saved;
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUploadDocument = async (docData: any) => {
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
      });

      if (response.ok) {
        const saved = await response.json();
        await loadAllData();
        return saved;
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnalyzeDocument = async (docId: string) => {
    const response = await fetch(`/api/documents/${docId}/analyze`, {
      method: 'POST',
    });
    const result = await response.json();
    if (response.ok) {
      await loadAllData();
      return result;
    } else {
      return { error: result.error || 'Failed to analyze' };
    }
  };

  /**
   * Front desk → patients.
   *
   * The server resolves the audience itself and returns a per-channel delivery
   * summary, which the composer shows as its confirmation. Sender identity is
   * attached here rather than in the component so the outbox always attributes
   * a send to the signed-in staff member.
   */
  const handleSendMessage = async (payload: SendMessagePayload) => {
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          senderId: currentUser?.id,
          senderName: currentUser?.name,
          senderRole: currentUser?.role,
        }),
      });

      const result = await response.json();
      if (!response.ok) return { error: result.error || 'Failed to send the message' };

      await loadAllData();
      return result;
    } catch (err) {
      console.error('Error sending message:', err);
      return { error: 'Network communication failure.' };
    }
  };

  /** Read state is per recipient, so the patient identifies themselves. */
  const handleMarkMessageRead = async (messageId: string) => {
    if (!currentUser) return;
    try {
      await fetch(`/api/messages/${messageId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: currentUser.id }),
      });
      // Patch locally rather than refetching everything — opening a message is
      // a read, and a full reload would collapse the disclosure the patient
      // just expanded.
      setMessages(prev =>
        prev.map(m =>
          m.id !== messageId
            ? m
            : {
                ...m,
                recipients: m.recipients.map(r =>
                  r.patientId === currentUser.id && !r.readAt
                    ? { ...r, readAt: new Date().toISOString() }
                    : r
                ),
              }
        )
      );
    } catch (err) {
      console.error('Error marking message read:', err);
    }
  };

  const handleCompleteConsultation = async (apptId: string, patientId: string, data: any) => {
    try {
      // 1. Set appointment as completed, and file the consultation record
      //    against it. The record is what the patient profile renders as a
      //    dated visit — including WHICH chamber the doctor saw them at, since
      //    one consultant may hold OPD at several addresses.
      const appointmentBeingClosed = appointments.find(a => a.id === apptId);
      const attendingDoctor = doctors.find(d => d.id === appointmentBeingClosed?.doctorId);

      /**
       * Prescribing authority.
       *
       * The front desk may close a visit administratively — the patient was
       * seen and has gone home — but a diagnosis, advice or prescription is a
       * clinical act reserved for the consultant. `actorRole` travels with the
       * request so the server can enforce that; the same flag gates the
       * clinical side effects below, which would otherwise write an empty
       * "[Dr. Note - …]:" line into the patient record on every desk close.
       */
      const isClinician = currentUser?.role === 'doctor' || currentUser?.role === 'admin';

      const statusRes = await fetch(`/api/appointments/${apptId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          actorRole: currentUser?.role,
          actorName: currentUser?.name,
          consultation: {
            doctorName: attendingDoctor?.name,
            specialty: attendingDoctor?.specialty,
            chamber: attendingDoctor?.hospital,
            chamberArea: attendingDoctor?.area || attendingDoctor?.district,
            diagnosis: data.diagnosis,
            notes: data.notes,
            advice: data.advice,
            prescriptions: data.prescriptions || [],
          },
        }),
      });

      // A refusal (403 from the prescribing guard) has to reach the caller —
      // swallowing it would leave the queue showing a success it never got.
      if (!statusRes.ok) {
        const failure = await statusRes.json().catch(() => ({}));
        return { error: failure.error || 'Could not close this appointment.' };
      }

      // Everything below writes CLINICAL data — medications onto the patient
      // record and a prescription into the vault. A desk close has none of it
      // to write, and must not touch either.
      if (isClinician) {
        // 2. Fetch existing patient clinical details
        const patient = patients.find(p => p.id === patientId);
        if (patient) {
          const updatedAllergies = [...(patient.allergies || [])];
          const updatedMedications = [...(patient.medications || [])];

          // Append new prescriptions
          if (data.prescriptions && Array.isArray(data.prescriptions)) {
            data.prescriptions.forEach((med: string) => {
              if (med.trim() && !updatedMedications.includes(med.trim())) {
                updatedMedications.push(med.trim());
              }
            });
          }

          // Save doctor notes in general logs
          const summary = [
            data.diagnosis && `Diagnosis: ${data.diagnosis}`,
            data.notes,
            data.advice && `Advice: ${data.advice}`,
          ]
            .filter(Boolean)
            .join(' — ');
          // Local calendar day — a note written at 1am IST must not be dated
          // yesterday in the patient's record.
          const updatedNotes = `${patient.notes || ''}\n\n[Dr. Note - ${todayLocal()}]: ${summary}`.trim();

          // 3. Update patient profile on server
          await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: patientId,
              name: patient.name,
              email: patient.email,
              age: patient.age,
              gender: patient.gender,
              contact: patient.contact,
              allergies: updatedAllergies,
              medications: updatedMedications,
              medicalConditions: patient.medicalConditions,
              notes: updatedNotes,
            }),
          });
        }

        // 4. File the prescription in the vault so it lands on the patient's
        //    profile and they can download it. Previously the medicines were
        //    only appended to patient.medications, leaving nothing to hand over.
        const appt = appointments.find(a => a.id === apptId);
        const hasContent =
          (data.prescriptions && data.prescriptions.length > 0) || data.diagnosis || data.advice;

        if (appt && hasContent) {
          const doctor = doctors.find(d => d.id === appt.doctorId);
          const patient = patients.find(p => p.id === patientId);
          const text = buildPrescriptionText(appt, doctor, patient, data);
          const dateLabel = todayLocal();

          await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patientId,
              title: `Prescription — ${doctor?.name || 'Consultant'} — ${dateLabel}`,
              category: data.prescriptions?.length ? 'Prescription' : 'Other',
              fileContentText: text,
              fileName: `prescription_${dateLabel}.txt`,
              fileSize: `${(text.length / 1024).toFixed(1)} KB`,
            }),
          });
        }
      }

      // The queue changes either way — an administrative close moves the
      // patient off the pending list exactly as a clinical one does.
      await loadAllData();
      setActiveAppointment(null);
      return { success: true };
    } catch (err) {
      console.error('Error completing consultation:', err);
      return { error: 'Could not close this appointment. Please try again.' };
    }
  };

  const handleJoinVideoRoom = async (appt: Appointment) => {
    // Change appointment status to active-video
    try {
      await fetch(`/api/appointments/${appt.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active-video' }),
      });
      await loadAllData();
      setActiveAppointment(appt);
      setActiveTab('telehealth');
      setIsNavOpen(false);
    } catch (err) {
      console.error(err);
    }
  };


  /**
   * Staff cancel (dashboard, queue): confirm in the browser, then cancel as
   * that role so the server applies staff rules (refund in full, allowed after
   * the slot has started).
   */
  const handleCancelAppointment = async (apptId: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled appointment?')) {
      return;
    }
    const result = await postJson(`/api/appointments/${apptId}/cancel`, { actorRole: currentUser?.role });
    if (result?.error) {
      window.alert(result.error);
      return;
    }
    await loadAllData();
  };

  /** Patient cancel from My Appointments — the page shows its own confirmation. */
  const handlePatientCancel = async (apptId: string, reason: string) => {
    const result = await postJson(`/api/appointments/${apptId}/cancel`, { actorRole: 'patient', reason });
    if (!result?.error) await loadAllData();
    return result;
  };

  /** Move a booking in place — same booking number, fee carried over. */
  const handleRescheduleAppointment = async (
    apptId: string,
    data: { date: string; timeSlot: string; type: 'visiting' | 'video' }
  ) => {
    const result = await postJson(`/api/appointments/${apptId}/reschedule`, data);
    if (!result?.error) await loadAllData();
    return result;
  };

  const handlePayPlatformFee = async (apptId: string, method: string) => {
    const result = await postJson(`/api/appointments/${apptId}/pay`, { paymentMethod: method });
    if (!result?.error) await loadAllData();
    return result;
  };

  const handleFeedback = async (apptId: string, rating: number, text: string) => {
    const result = await postJson(`/api/appointments/${apptId}/feedback`, { rating, text });
    if (!result?.error) await loadAllData();
    return result;
  };

  /** Role-filtered navigation, with the live consultation appended when one is running. */
  const visibleGroups = useMemo<Array<{ id: string; label: string; items: ResolvedNavItem[] }>>(() => {
    if (!currentUser) return [];

    // A doctor's standalone Records pages are withdrawn by default: everything
    // in them is already shown in context inside their appointment queue.
    const hideRecords = currentUser.role === 'doctor' && doctorPortalConfig.hideRecordsMenu;

    const groups = NAV_GROUPS.filter(group => !(hideRecords && group.id === 'records'))
      .map(group => ({
        id: group.id,
        label: t(group.labelKey),
        items: group.items
          .filter(item => !item.visibleTo || item.visibleTo.includes(currentUser.role))
          .map(item => ({ id: item.id, icon: item.icon, label: t(item.labelFor?.[currentUser.role] ?? item.labelKey) })),
      }))
      .filter(group => group.items.length > 0);

    if (activeAppointment) {
      groups.push({
        id: 'in-session',
        label: t('nav.group.inSession'),
        items: [{ id: 'telehealth', label: t('nav.telehealth'), icon: Video }],
      });
    }
    return groups;
  }, [currentUser, activeAppointment, t]);

  /** Unread desk messages, for the rail badge (patients only). */
  const unreadMessageCount = useMemo(() => {
    if (currentUser?.role !== 'patient') return 0;
    return messages.filter(m => m.recipients.some(r => r.patientId === currentUser.id && !r.readAt)).length;
  }, [messages, currentUser]);

  /** Upcoming bookings still owing the ₹50, for the patient's rail badge. */
  const feeDueCount = useMemo(() => {
    if (currentUser?.role !== 'patient') return 0;
    return appointments.filter(a => a.patientId === currentUser.id && a.status === 'scheduled' && !a.feePaid).length;
  }, [appointments, currentUser]);

  /**
   * Never leave a role parked on a destination its rail no longer offers.
   */
  useEffect(() => {
    if (!currentUser || activeTab === 'telehealth') return;
    const reachable = visibleGroups.some(group => group.items.some(item => item.id === activeTab));
    if (!reachable) setActiveTab(landingTabFor(currentUser.role));
  }, [currentUser, visibleGroups, activeTab]);

  const navigate = (tab: string) => goToTab(tab as TabId);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return currentUser ? (
          <PatientHome
            currentUser={currentUser}
            patients={patients}
            doctors={doctors}
            appointments={appointments}
            documents={documents}
            onNavigate={navigate}
            onBook={startBooking}
            onJoinVideo={handleJoinVideoRoom}
          />
        ) : null;
      case 'upcoming':
        // A patient's appointments get a dedicated page; staff never reach it.
        return currentUser ? (
          <MyAppointments
            currentUser={currentUser}
            doctors={doctors}
            patients={patients}
            appointments={appointments}
            onBook={startBooking}
            onJoinVideo={handleJoinVideoRoom}
            onCancel={handlePatientCancel}
            onReschedule={handleRescheduleAppointment}
            onPay={handlePayPlatformFee}
            onFeedback={handleFeedback}
          />
        ) : null;
      /**
       * One console, several destinations. Patients and doctors get a trimmed
       * profile page; front desk and admin keep the full persona console.
       */
      case 'portal':
      case 'appt-history': {
        const consoleView =
          activeTab === 'appt-history'
            ? 'history'
            : currentUser?.role === 'patient' || currentUser?.role === 'doctor'
            ? 'profile'
            : 'full';

        return (
          <PersonaConsole
            doctors={doctors}
            patients={patients}
            documents={documents}
            appointments={appointments}
            loadAllData={loadAllData}
            onJoinVideo={handleJoinVideoRoom}
            onCancelAppointment={handleCancelAppointment}
            onBookAppointment={handleBookAppointment}
            onSavePatient={handleSavePatient}
            onUploadDocument={handleUploadDocument}
            onAnalyzeDocument={handleAnalyzeDocument}
            currentUser={currentUser}
            view={consoleView}
            onOpenHistory={() => goToTab('appt-history')}
          />
        );
      }
      case 'queue':
      case 'completed':
        return (
          <DoctorQueue
            appointments={appointments}
            doctors={doctors}
            patients={patients}
            documents={documents}
            currentUser={currentUser}
            view={activeTab === 'completed' ? 'completed' : 'pending'}
            onJoinVideo={handleJoinVideoRoom}
            onCompleteConsultation={handleCompleteConsultation}
            onCollectFee={
              currentUser?.role === 'hospital' || currentUser?.role === 'admin'
                ? async id => {
                    const res = await handlePayPlatformFee(id, 'Cash at counter');
                    if (res?.error) window.alert(res.error);
                  }
                : undefined
            }
          />
        );
      case 'dashboard':
        if (currentUser?.role === 'doctor') {
          return (
            <DoctorDashboard
              appointments={appointments}
              doctors={doctors}
              patients={patients}
              currentUser={currentUser}
              onNavigate={navigate}
              onJoinVideo={handleJoinVideoRoom}
            />
          );
        }
        return (
          <Dashboard
            appointments={appointments}
            doctors={doctors}
            patients={patients}
            documents={documents}
            onNavigate={navigate}
            onJoinVideo={handleJoinVideoRoom}
            onCancelAppointment={handleCancelAppointment}
            onBookAppointment={handleBookAppointment}
            onRescheduleAppointment={handleRescheduleAppointment}
          />
        );
      case 'book':
        return (
          // Keyed by the intent so "Book again" / a speciality tile always
          // opens a fresh wizard with its own preselection.
          <React.Fragment key={bookIntent.nonce}>
            <DoctorBooking
              doctors={doctors}
              patients={patients}
              onBookAppointment={handleBookAppointment}
              currentUser={currentUser}
              preselectedDoctorId={bookIntent.doctorId}
              initialSearch={bookIntent.search}
              initialDepartment={bookIntent.department}
              onViewAppointments={currentUser?.role === 'patient' ? () => goToTab('upcoming') : undefined}
            />
          </React.Fragment>
        );
      case 'patients':
        return (
          <PatientRecords
            patients={patients}
            appointments={appointments}
            documents={documents}
            onSavePatient={handleSavePatient}
          />
        );
      case 'messages':
        return (
          <MessageCenter
            messages={messages}
            patients={patients}
            doctors={doctors}
            appointments={appointments}
            currentUser={currentUser}
            onSendMessage={handleSendMessage}
            onMarkRead={handleMarkMessageRead}
          />
        );
      case 'documents':
        return (
          <DocumentManager
            documents={documents}
            patients={patients}
            onUploadDocument={handleUploadDocument}
            onAnalyzeDocument={handleAnalyzeDocument}
          />
        );
      case 'onboarding':
        return <DoctorApplications doctors={doctors} onChanged={loadAllData} />;
      case 'telehealth':
        if (!activeAppointment) return <NoActiveConsultation onDismiss={() => goToTab(currentUser ? landingTabFor(currentUser.role) : 'home')} />;
        return (
          <TelehealthCabin
            appointment={activeAppointment}
            doctors={doctors}
            patients={patients}
            onCompleteConsultation={handleCompleteConsultation}
            onExitCabin={() => goToTab(currentUser ? landingTabFor(currentUser.role) : 'home')}
          />
        );
      default:
        return null;
    }
  };

  /**
   * Only the very first load is allowed to replace the screen. Every mutation
   * calls loadAllData() to refresh; gating the content on `isLoading` would
   * unmount whatever screen was open. Later failures surface as a banner.
   */
  const body = !hasLoadedOnce
    ? isLoading
      ? <LoadingState />
      : error
      ? <ErrorState message={error} onRetry={loadAllData} />
      : null
    : null;

  const refreshBanner =
    hasLoadedOnce && error ? <RefreshBanner message={error} onRetry={loadAllData} /> : null;

  /* ---------------------------------------------------------------------
     Signed out — the public website, or the sign-in screen.
     --------------------------------------------------------------------- */
  if (!currentUser) {
    if (publicView === 'landing') {
      return (
        <>
          {!hasLoadedOnce && error && (
            <div className="fixed inset-x-0 top-0 z-[70] p-3">
              <RefreshBanner message={error} onRetry={loadAllData} />
            </div>
          )}
          <LandingPage
            doctors={doctors}
            appointments={appointments}
            onSignIn={() => {
              setPendingIntent(null);
              setLoginMessage('');
              setPublicView('login');
              window.scrollTo({ top: 0 });
            }}
            onBook={handlePublicBook}
          />
        </>
      );
    }

    return (
      <div className="screen-scale min-h-screen bg-canvas text-ink font-sans antialiased flex flex-col">
        <header className="border-b border-hairline bg-surface">
          <div className="flex h-16 w-full items-center gap-4 px-5 lg:px-8">
            <button
              type="button"
              onClick={() => setPublicView('landing')}
              className="cursor-pointer"
              aria-label="Back to the neXgen website"
            >
              <Logo size="sm" />
            </button>
            {/* Role portal switcher lands here (Login renders into this slot). */}
            <div id="auth-header-slot" className="ml-auto flex min-w-0 items-center" />
            <div className="hidden shrink-0 sm:block">
              <PreferenceToggles />
            </div>
          </div>
        </header>
        <main className="flex-1">
          {body ?? (
            <Login
              doctors={doctors}
              patients={patients}
              onRegisterPatient={handleSavePatient}
              onLoginSuccess={handleLoginSuccess}
              intentMessage={loginMessage}
              onBackToSite={() => setPublicView('landing')}
            />
          )}
        </main>
      </div>
    );
  }

  let metaKeys = PAGE_META[activeTab];
  if (activeTab === 'portal') {
    metaKeys = PORTAL_META[currentUser.role];
  } else if (activeTab === 'messages') {
    metaKeys = { ...PAGE_META.messages, subtitle: MESSAGES_SUBTITLE[currentUser.role] };
  } else if (activeTab === 'dashboard' && currentUser.role === 'doctor') {
    metaKeys = { title: 'page.myDashboard.title', subtitle: 'page.myDashboard.sub' };
  } else if (activeTab === 'queue' && currentUser.role === 'doctor') {
    metaKeys = { title: 'page.myQueue.title', subtitle: 'page.myQueue.sub' };
  } else if (activeTab === 'book' && currentUser.role !== 'patient') {
    metaKeys = { title: 'page.book.title', subtitle: 'page.bookStaff.sub' };
  } else if (activeTab === 'documents' && currentUser.role === 'patient') {
    metaKeys = { title: 'page.healthVault.title', subtitle: 'page.healthVault.sub' };
  }
  const meta = { title: t(metaKeys.title), subtitle: t(metaKeys.subtitle) };

  const theme = ROLE_THEME[currentUser.role];
  const canBook = currentUser.role !== 'doctor';
  const showPatientTabBar = currentUser.role === 'patient' && activeTab !== 'book' && activeTab !== 'telehealth';

  /* ---------------------------------------------------------------------
     Signed in — fixed left rail + content column.
     --------------------------------------------------------------------- */
  return (
    <div className="screen-scale min-h-screen bg-canvas text-ink font-sans antialiased">
      {/* Scrim for the mobile drawer */}
      <div
        onClick={() => setIsNavOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${
          isNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* ---------------------------- Left rail ---------------------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col overflow-hidden bg-slate-950 transition-transform duration-300 ease-out lg:translate-x-0 ${
          isNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Role glow — each console carries its own colour */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: theme.soft }}
        />

        <div className="relative flex h-[72px] shrink-0 items-center justify-between border-b border-white/10 px-5">
          <Logo role={currentUser.role} tone="dark" size="sm" showRoleLabel />
          <button
            onClick={() => setIsNavOpen(false)}
            className="-mr-1 rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={t('shell.closeNav')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {canBook && (
          <div className="relative px-4 pt-4">
            <button
              type="button"
              onClick={() => startBooking({})}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-coral-500 py-2.5 text-[13px] font-bold text-white shadow-lg shadow-coral-500/20 transition-colors hover:bg-coral-600"
            >
              <CalendarPlus className="h-4 w-4" />
              {currentUser.role === 'patient' ? t('nav.bookCtaPatient') : t('nav.bookCtaStaff')}
            </button>
          </div>
        )}

        <nav aria-label="Primary" className="rail-scroll relative flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.id} className={groupIndex > 0 ? 'mt-5' : ''}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const isLive = item.id === 'telehealth';
                  const badge =
                    item.id === 'messages' ? unreadMessageCount : item.id === 'upcoming' ? feeDueCount : 0;
                  return (
                    <li key={`${group.id}-${item.id}`}>
                      <button
                        onClick={() =>
                          item.id === 'book' ? startBooking({}) : goToTab(item.id, { keepConsultation: true })
                        }
                        aria-current={isActive ? 'page' : undefined}
                        className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors ${
                          isActive ? 'bg-white/[0.09] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90'
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                            style={{ background: theme.accent }}
                          />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? '' : 'text-white/40 group-hover:text-white/70'}`}
                          style={isActive ? { color: theme.accent } : undefined}
                        />
                        <span className="truncate">{item.label}</span>
                        {badge > 0 && (
                          <span
                            className="ml-auto rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-950"
                            style={{ background: theme.accent }}
                          >
                            {badge}
                          </span>
                        )}
                        {isLive && (
                          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-rose-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                            {t('nav.live')}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Session footer */}
        <div className="relative shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] p-2.5">
            <LogoMark size={34} role={currentUser.role} showBadge={false} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-white">{currentUser.name}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.accent }}>
                {t(`role.${currentUser.role}` as StringKey)}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title={t('common.signOut')}
              aria-label={t('common.signOut')}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-white/40 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/25">
            Powered by SRM ECO TECH
          </p>
        </div>
      </aside>

      {/* --------------------------- Content column -------------------------- */}
      <div className="lg:pl-[268px]">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-5 lg:px-8">
            <button
              onClick={() => setIsNavOpen(true)}
              aria-label={t('shell.openNav')}
              aria-expanded={isNavOpen}
              className="-ml-1.5 cursor-pointer rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-ink">{meta.title}</h1>
              <p className="hidden truncate text-[12px] text-ink-soft sm:block">{meta.subtitle}</p>
            </div>

            {canBook && activeTab !== 'book' && (
              <button
                type="button"
                onClick={() => startBooking({})}
                className="hidden cursor-pointer items-center gap-2 rounded-xl bg-coral-500 px-3.5 py-2 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-coral-600 md:inline-flex"
              >
                <CalendarPlus className="h-4 w-4" /> {t('common.bookAppointment')}
              </button>
            )}

            <PreferenceToggles compact />

            <span className="hidden items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-soft 2xl:inline-flex">
              <Calendar className="h-3.5 w-3.5" />
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </header>

        <main key={activeTab} className={`page-enter px-4 py-6 sm:px-5 lg:px-8 lg:py-8 ${showPatientTabBar ? 'pb-28 lg:pb-8' : ''}`}>
          {refreshBanner}
          {body ?? renderContent()}
        </main>
      </div>

      {/* Mobile tab bar — the five things a patient does, one thumb away. */}
      {showPatientTabBar && (
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-1.5 backdrop-blur lg:hidden"
        >
          <ul className="grid grid-cols-5">
            {([
              { id: 'home', label: t('tab.home'), icon: Home },
              { id: 'upcoming', label: t('tab.visits'), icon: CalendarCheck },
              { id: 'book', label: t('tab.book'), icon: CalendarPlus },
              { id: 'documents', label: t('tab.vault'), icon: FileText },
              { id: 'portal', label: t('tab.profile'), icon: UserCheck },
            ] as Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }>).map(item => {
              const active = activeTab === item.id;
              const isBook = item.id === 'book';
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => (isBook ? startBooking({}) : goToTab(item.id))}
                    className={`flex w-full cursor-pointer flex-col items-center gap-0.5 py-1 text-[11px] font-semibold ${
                      active ? 'text-indigo-700' : 'text-slate-500'
                    }`}
                  >
                    {isBook ? (
                      <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-coral-500 text-white shadow-lg shadow-coral-500/30">
                        <item.icon className="h-6 w-6" />
                      </span>
                    ) : (
                      <item.icon className="h-5 w-5" />
                    )}
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

/* ========================================================================
   Shell primitives
   ======================================================================== */

function LoadingState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <LogoMark size={52} />
      <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
      </div>
      <p className="text-xs font-medium text-ink-soft">{t('shell.loading')}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto my-12 max-w-md space-y-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
      <Activity className="mx-auto h-7 w-7 text-rose-600" />
      <div className="space-y-1.5">
        <p className="text-sm font-bold text-ink">{t('shell.offlineTitle')}</p>
        <p className="text-[12px] leading-relaxed text-ink-soft">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('shell.tryAgain')}
      </button>
    </div>
  );
}

/** Non-blocking notice for a background refresh that failed. */
function RefreshBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <span className="flex-1">{message}</span>
      <button
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t('shell.retry')}
      </button>
    </div>
  );
}

function NoActiveConsultation({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto my-12 max-w-md space-y-4 rounded-2xl border border-hairline bg-surface p-6 text-center">
      <Video className="mx-auto h-7 w-7 text-ink-soft" />
      <div className="space-y-1.5">
        <p className="text-sm font-bold text-ink">{t('shell.noSession')}</p>
        <p className="text-[12px] leading-relaxed text-ink-soft">{t('shell.noSessionText')}</p>
      </div>
      <button
        onClick={onDismiss}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-hairline px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t('shell.goBack')}
      </button>
    </div>
  );
}
