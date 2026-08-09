/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  Calendar,
  CalendarCheck,
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

type Role = LoggedInUser['role'];
type TabId =
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
  | 'telehealth';

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Which roles may see this destination. Omitted = everyone. */
  visibleTo?: Role[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Navigation is declared as data rather than hand-written buttons so role
 * gating, the mobile drawer and the page header all read from one source.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Care',
    items: [
      // Renamed from "Persona Portal" — for a patient this destination now
      // carries profile details only; appointments moved to their own pages.
      // { id: 'portal', label: 'Persona Portal', icon: UserCheck },
      { id: 'portal', label: 'Profile', icon: UserCheck },
      // Renamed from "Consultations" — the page leads with who is booked in,
      // and the consultation form opens from that list.
      // { id: 'queue', label: 'Consultations', icon: Stethoscope, visibleTo: ['doctor', 'hospital', 'admin'] },
      { id: 'queue', label: 'Appointments', icon: Stethoscope, visibleTo: ['doctor', 'hospital', 'admin'] },
      // Closed consultations live behind their own destination — the working
      // list stays strictly "who is still to be seen".
      { id: 'completed', label: 'Completed', icon: CheckCircle2, visibleTo: ['doctor', 'hospital', 'admin'] },
      // Doctors land here too, but on their own KPI dashboard — see
      // DoctorDashboard, chosen by role in renderContent().
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visibleTo: ['doctor', 'admin', 'hospital'] },
    ],
  },
  {
    label: 'Scheduling',
    items: [
      // Patient-only destinations lifted out of the old portal's inner tabs.
      { id: 'upcoming', label: 'Upcoming Appointment', icon: CalendarCheck, visibleTo: ['patient'] },
      { id: 'book', label: 'Book Appointment', icon: Calendar, visibleTo: ['patient', 'hospital', 'admin'] },
      { id: 'appt-history', label: 'Appointment History', icon: History, visibleTo: ['patient'] },
    ],
  },
  {
    // One destination, two jobs — the desk composes here, a patient reads here.
    // Deliberately NOT shown to doctors: clinic-wide announcements are a front
    // desk function, and a consultant reaches their patients through the queue.
    label: 'Communication',
    items: [
      { id: 'messages', label: 'Messages', icon: MessageSquare, visibleTo: ['patient', 'hospital', 'admin'] },
    ],
  },
  {
    label: 'Records',
    items: [
      { id: 'patients', label: 'Clinical Patients', icon: Users, visibleTo: ['doctor', 'hospital', 'admin'] },
      { id: 'documents', label: 'Document Vault', icon: FileText },
    ],
  },
];

const PAGE_META: Record<TabId, { title: string; subtitle: string }> = {
  // portal: { title: 'Persona Portal', subtitle: 'Your role-based clinical workspace' },
  portal: { title: 'Profile', subtitle: 'Your personal, contact and medical profile details' },
  upcoming: { title: 'Upcoming Appointment', subtitle: 'Your confirmed consultation and its reminders' },
  'appt-history': { title: 'Appointment History', subtitle: 'Previous visits, prescriptions and tax invoices' },
  // queue: { title: 'Consultations', subtitle: 'Your patient queue, history and prescriptions' },
  queue: { title: 'Appointments', subtitle: 'Patients still to be seen — follow-ups and new visits' },
  completed: { title: 'Completed', subtitle: 'Closed consultations, prescriptions and case records' },
  dashboard: { title: 'Care Dashboard', subtitle: 'OPD load, telehealth activity and collections' },
  book: { title: 'Book Appointment', subtitle: 'Search consultants and reserve an OPD or video slot' },
  patients: { title: 'Clinical Patients', subtitle: 'Longitudinal history, conditions and case notes' },
  documents: { title: 'Document Vault', subtitle: 'Reports, prescriptions and AI clinical summaries' },
  // Overridden per role below — the desk writes here, a patient reads here.
  messages: { title: 'Messages', subtitle: 'Notices from the clinic' },
  telehealth: { title: 'Telehealth Room', subtitle: 'Live video consultation cabin' },
};

/**
 * The Profile destination is shared by every role but means something different
 * to each: a patient's own record, a doctor's practice profile, or — for front
 * desk and admin — their full persona workspace, which still lives there.
 */
const PORTAL_SUBTITLE: Record<Role, string> = {
  patient: 'Your personal, contact and medical profile details',
  doctor: 'Your practice profile, chamber and consulting details',
  hospital: 'Your role-based clinical workspace',
  admin: 'Your role-based clinical workspace',
};

/** Same rail entry, opposite ends of the conversation. */
const MESSAGES_SUBTITLE: Record<Role, string> = {
  patient: 'Delay notices and announcements from the clinic',
  doctor: 'Notices from the clinic',
  hospital: 'Send delay notices and announcements to patients',
  admin: 'Send delay notices and announcements to patients',
};

const ROLE_LABEL: Record<Role, string> = {
  patient: 'Patient',
  doctor: 'Consultant',
  hospital: 'Front Desk',
  admin: 'Administrator',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('portal');
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

  const goToTab = useCallback((tab: TabId, opts?: { keepConsultation?: boolean }) => {
    setActiveTab(tab);
    if (!opts?.keepConsultation) setActiveAppointment(null);
    setIsNavOpen(false);
  }, []);

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

  const handleCancelAppointment = async (apptId: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled appointment?')) {
      return;
    }
    try {
      const response = await fetch(`/api/appointments/${apptId}/cancel`, {
        method: 'POST',
      });
      if (response.ok) {
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
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

  /** Role-filtered navigation, with the live consultation appended when one is running. */
  const visibleGroups = useMemo<NavGroup[]>(() => {
    if (!currentUser) return [];

    // A doctor's standalone Records pages are withdrawn by default: everything
    // in them — patient history, documents, past visits — is already shown in
    // context inside their appointment queue. See VITE_DOCTOR_HIDE_RECORDS_MENU.
    const hideRecords = currentUser.role === 'doctor' && doctorPortalConfig.hideRecordsMenu;

    const groups = NAV_GROUPS.filter(group => !(hideRecords && group.label === 'Records'))
      .map(group => ({
        ...group,
        items: group.items.filter(item => !item.visibleTo || item.visibleTo.includes(currentUser.role)),
      }))
      .filter(group => group.items.length > 0);

    if (activeAppointment) {
      groups.push({
        label: 'In Session',
        items: [{ id: 'telehealth', label: 'Telehealth Room', icon: Video }],
      });
    }
    return groups;
  }, [currentUser, activeAppointment]);

  /**
   * Unread desk messages, for the rail badge.
   *
   * Patients only: a delay notice is worthless if it sits behind an unmarked
   * menu item. Staff see their own outbox on that page, which has no unread
   * concept — they wrote it.
   */
  const unreadMessageCount = useMemo(() => {
    if (currentUser?.role !== 'patient') return 0;
    return messages.filter(m =>
      m.recipients.some(r => r.patientId === currentUser.id && !r.readAt)
    ).length;
  }, [messages, currentUser]);

  /**
   * Never leave a role parked on a destination its rail no longer offers — a
   * doctor with the Records group withdrawn must not keep rendering it because
   * an earlier link put them there.
   */
  useEffect(() => {
    if (!currentUser || activeTab === 'telehealth') return;
    const reachable = visibleGroups.some(group => group.items.some(item => item.id === activeTab));
    if (!reachable) setActiveTab(visibleGroups[0]?.items[0]?.id ?? 'portal');
  }, [currentUser, visibleGroups, activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      /**
       * One console, several destinations. Patients and doctors get a trimmed
       * profile page — their appointment work lives on its own rail entry
       * ("Upcoming Appointment" / "Appointments"). Front desk and admin keep
       * the full persona console here, because for them that view *is* the
       * whole workspace.
       */
      case 'portal':
      case 'upcoming':
      case 'appt-history': {
        const consoleView =
          activeTab === 'upcoming'
            ? 'upcoming'
            : activeTab === 'appt-history'
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
      // One component, two destinations: the pending working list and the
      // closed-consultation archive behind it.
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
          />
        );
      case 'dashboard':
        // Same rail entry, two reports: a consultant sees their own practice,
        // the clinic roles see the whole OPD.
        if (currentUser?.role === 'doctor') {
          return (
            <DoctorDashboard
              appointments={appointments}
              doctors={doctors}
              patients={patients}
              currentUser={currentUser}
              onNavigate={(tab) => goToTab(tab as TabId)}
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
            onNavigate={(tab) => goToTab(tab as TabId)}
            onJoinVideo={handleJoinVideoRoom}
            onCancelAppointment={handleCancelAppointment}
            onBookAppointment={handleBookAppointment}
          />
        );
      case 'book':
        return (
          <DoctorBooking
            doctors={doctors}
            patients={patients}
            onBookAppointment={handleBookAppointment}
            currentUser={currentUser}
          />
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
        // One component, two roles: the desk composes and reviews its outbox,
        // a patient reads their inbox. MessageCenter picks by currentUser.role.
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
      case 'telehealth':
        // No live consultation to show — offer a way back rather than
        // redirecting to a tab this role may not be allowed to open.
        if (!activeAppointment) return <NoActiveConsultation onDismiss={() => goToTab('portal')} />;
        return (
          <TelehealthCabin
            appointment={activeAppointment}
            doctors={doctors}
            patients={patients}
            onCompleteConsultation={handleCompleteConsultation}
            onExitCabin={() => goToTab('portal')}
          />
        );
      default:
        return null;
    }
  };

  /**
   * Only the very first load is allowed to replace the screen. Every mutation
   * (booking, upload, profile save) calls loadAllData() to refresh, and gating
   * the content area on `isLoading` unmounted whatever screen was open —
   * which discarded the booking wizard's state and made its confirmation step
   * unreachable. Later refresh failures surface as a banner instead.
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
     Signed out — a quiet, single-column entry screen.
     --------------------------------------------------------------------- */
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-canvas text-ink font-sans antialiased flex flex-col">
        <header className="border-b border-hairline bg-surface">
          <div className="flex h-16 w-full items-center gap-4 px-5 lg:px-8">
            <Brand tone="light" />
            {/* Role portal switcher lands here. Login owns the state and the
                rules about when the switcher applies, so it renders the tabs
                into this slot rather than App second-guessing either. */}
            <div id="auth-header-slot" className="ml-auto flex min-w-0 items-center" />
          </div>
        </header>
        <main className="flex-1">
          {body ?? (
            <Login
              doctors={doctors}
              patients={patients}
              /* Self-registration creates the record and refreshes the
                 directory, so the new profile exists by the time the patient
                 is dropped on their Profile page to complete it. */
              onRegisterPatient={handleSavePatient}
              onLoginSuccess={(u) => {
                setCurrentUser(u);
                // A consultant opens on their KPI dashboard rather than their
                // profile page — see VITE_DOCTOR_LAND_ON_DASHBOARD.
                setActiveTab(
                  u.role === 'doctor' && doctorPortalConfig.landOnDashboard ? 'dashboard' : 'portal'
                );
              }}
            />
          )}
        </main>
      </div>
    );
  }

  let meta = PAGE_META[activeTab];
  if (activeTab === 'portal') {
    meta = { ...PAGE_META.portal, subtitle: PORTAL_SUBTITLE[currentUser.role] };
  } else if (activeTab === 'messages') {
    meta = { ...PAGE_META.messages, subtitle: MESSAGES_SUBTITLE[currentUser.role] };
  } else if (activeTab === 'dashboard' && currentUser.role === 'doctor') {
    // The dashboard destination is shared, but a consultant's version reports
    // their own practice rather than the clinic's.
    meta = { title: 'My Dashboard', subtitle: 'Your OPD load, queue and consultation activity' };
  }

  /* ---------------------------------------------------------------------
     Signed in — fixed left rail + content column.
     --------------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-canvas text-ink font-sans antialiased">
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col bg-slate-950 transition-transform duration-300 ease-out lg:translate-x-0 ${
          isNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="clinical-grid relative flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <Brand tone="dark" />
          <button
            onClick={() => setIsNavOpen(false)}
            className="-mr-1 rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <nav aria-label="Primary" className="rail-scroll flex-1 overflow-y-auto px-3 py-5">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? 'mt-6' : ''}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const isLive = item.id === 'telehealth';
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => goToTab(item.id, { keepConsultation: true })}
                        aria-current={isActive ? 'page' : undefined}
                        className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                          isActive ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-400"
                          />
                        )}
                        <Icon
                          className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                            isActive ? 'text-indigo-300' : 'text-white/40 group-hover:text-white/70'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.id === 'messages' && unreadMessageCount > 0 && (
                          <span className="ml-auto rounded-full bg-indigo-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                            {unreadMessageCount}
                          </span>
                        )}
                        {isLive && (
                          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-rose-300">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                            Live
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
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white/35">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            OPD &amp; Telehealth live
          </div>

          <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 font-serif text-sm font-semibold text-indigo-200 ring-1 ring-indigo-400/25">
              {currentUser.name[0]}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-white">{currentUser.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                {ROLE_LABEL[currentUser.role]}
              </p>
            </div>
            <button
              onClick={() => {
                setCurrentUser(null);
                setActiveTab('portal');
                setActiveAppointment(null);
                setIsNavOpen(false);
              }}
              title="Sign out"
              aria-label="Sign out"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-white/40 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* --------------------------- Content column -------------------------- */}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-5 lg:px-8">
            <button
              onClick={() => setIsNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={isNavOpen}
              className="-ml-1.5 cursor-pointer rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface hover:text-ink lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-lg font-semibold leading-tight tracking-tight text-ink">
                {meta.title}
              </h1>
              <p className="hidden truncate text-[11px] text-ink-soft sm:block">{meta.subtitle}</p>
            </div>

            <span className="hidden items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1.5 font-mono text-[11px] text-ink-soft sm:inline-flex">
              <Calendar className="h-3.5 w-3.5" />
              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </header>

        <main key={activeTab} className="page-enter px-5 py-6 lg:px-8 lg:py-8">
          {refreshBanner}
          {body ?? renderContent()}
        </main>
      </div>
    </div>
  );
}

/* ========================================================================
   Shell primitives
   ======================================================================== */

function Brand({ tone }: { tone: 'light' | 'dark' }) {
  const isDark = tone === 'dark';
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          isDark
            ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30'
            : 'bg-indigo-600 text-white'
        }`}
      >
        <Activity className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <p className={`font-serif text-[15px] font-semibold tracking-tight ${isDark ? 'text-white' : 'text-ink'}`}>
          neXgen
        </p>
        <p
          className={`text-[9px] font-medium uppercase tracking-[0.18em] ${
            isDark ? 'text-white/40' : 'text-ink-soft'
          }`}
        >
          Healthcare
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-indigo-600" />
      <p className="text-xs font-medium text-ink-soft">Synchronising clinical databases…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto my-12 max-w-md space-y-4 rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
      <Activity className="mx-auto h-7 w-7 text-rose-600 dark:text-rose-400" />
      <div className="space-y-1.5">
        <p className="font-serif text-sm font-semibold text-ink">Clinical system connection offline</p>
        <p className="text-[12px] leading-relaxed text-ink-soft">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry system sync
      </button>
    </div>
  );
}

/** Non-blocking notice for a background refresh that failed. */
function RefreshBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <span className="flex-1">{message}</span>
      <button
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

function NoActiveConsultation({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mx-auto my-12 max-w-md space-y-4 rounded-xl border border-hairline bg-surface p-6 text-center">
      <Video className="mx-auto h-7 w-7 text-ink-soft" />
      <div className="space-y-1.5">
        <p className="font-serif text-sm font-semibold text-ink">No consultation in session</p>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          The telehealth cabin opens automatically when you join a scheduled video appointment.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="cursor-pointer rounded-md border border-hairline px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
      >
        Back to portal
      </button>
    </div>
  );
}
