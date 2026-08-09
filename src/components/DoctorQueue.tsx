/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Video,
  MapPin,
  AlertCircle,
  Pill,
  Activity,
  FileText,
  Plus,
  X,
  Check,
  ChevronRight,
  Stethoscope,
  CalendarDays,
  Sparkles,
  ClipboardList,
  Eye,
  Printer,
  Repeat,
  UserPlus,
  CheckCircle2,
  Download,
  Lightbulb,
} from 'lucide-react';
import { Appointment, Doctor, PatientHistory, MedicalDocument, LoggedInUser } from '../types';
import { buildPrescriptionText } from '../lib/prescription';
import { isFutureAppointment, todayLocal } from '../lib/appointments';

export interface PrescriptionLine {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
}

/**
 * Which half of the doctor's workload this page shows.
 *
 * 'pending'   — patients still to be seen. A completed checkup leaves this list
 *               immediately; when nobody is waiting the page is simply blank.
 * 'completed' — closed consultations, reachable only from the Completed rail
 *               entry, so finished work never clutters the working list.
 */
export type QueueView = 'pending' | 'completed';

interface DoctorQueueProps {
  appointments: Appointment[];
  doctors: Doctor[];
  patients: PatientHistory[];
  documents: MedicalDocument[];
  currentUser: LoggedInUser | null;
  view?: QueueView;
  onJoinVideo: (appt: Appointment) => void;
  onCompleteConsultation: (
    apptId: string,
    patientId: string,
    data: {
      notes: string;
      prescriptions: string[];
      diagnosis?: string;
      advice?: string;
    }
  ) => Promise<any>;
}

/** "09:00 AM" -> minutes since midnight, so the queue sorts chronologically. */
function slotToMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((slot || '').trim());
  if (!m) return 9999;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

function friendlyDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** One prescription row rendered as a single line for the patient record. */
export function formatPrescriptionLine(line: PrescriptionLine): string {
  const parts = [line.medicine.trim()];
  if (line.dosage.trim()) parts.push(line.dosage.trim());
  const tail = [line.frequency.trim(), line.duration.trim()].filter(Boolean).join(' · ');
  return tail ? `${parts.join(' ')} — ${tail}` : parts.join(' ');
}

const EMPTY_LINE: PrescriptionLine = { medicine: '', dosage: '', frequency: '', duration: '' };

/**
 * Follow-up vs first visit — the one thing a doctor scans an appointment list
 * for, because it decides whether to read history or take one. Rendered as a
 * pair of opposing colours so the mix in a list is readable at a glance.
 */
function VisitTypeBadge({ isFollowUp, size = 'sm' }: { isFollowUp: boolean; size?: 'sm' | 'md' }) {
  const padding = size === 'md' ? 'px-2.5 py-1.5 text-[13px]' : 'px-2 py-1 text-[11px]';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold ${padding} ${
        isFollowUp
          ? 'bg-amber-50 text-amber-800 border border-amber-200'
          : 'bg-sky-50 text-sky-800 border border-sky-200'
      }`}
    >
      {isFollowUp ? <Repeat className="h-3 w-3 shrink-0" /> : <UserPlus className="h-3 w-3 shrink-0" />}
      {isFollowUp ? 'Follow-up' : 'New patient'}
    </span>
  );
}

/**
 * Patient portrait for a queue card. Patient records rarely carry a photograph,
 * so initials on a tinted disc are the normal case rather than a fallback.
 */
function PatientAvatar({
  name,
  image,
  className = '',
}: {
  name: string;
  image?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      <img
        src={image}
        alt={name}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-xl bg-slate-100 object-cover object-top ring-1 ring-slate-200 ${className}`}
      />
    );
  }

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || '?';

  return (
    <div
      role="img"
      aria-label={name || 'Patient'}
      className={`flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-2xl font-semibold text-indigo-700 ring-1 ring-slate-200 ${className}`}
    >
      {initials}
    </div>
  );
}

/**
 * Reader for a patient-uploaded document.
 *
 * Records hold their content as text (`fileContentText`) rather than a hosted
 * file, so "opening" one means rendering it here — there is no URL to link to.
 * The download rebuilds a file from that text for anyone who wants it outside
 * the app.
 */
function DocumentViewer({ doc, onClose }: { doc: MedicalDocument; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const downloadFile = () => {
    const blob = new Blob([doc.fileContentText || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = doc.fileName || `${doc.title}.txt`;
    anchor.click();
    // The click has already handed the URL to the browser's download machinery,
    // so it is safe to release it on the next tick.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Portalled to <body> so no page-level transform can capture the fixed
  // overlay and size it to the content column instead of the window.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        onClick={e => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">{doc.title}</h3>
            <p className="text-sm text-slate-500">
              {doc.category} · <span className="font-mono">{doc.uploadDate}</span>
              {doc.fileSize ? ` · ${doc.fileSize}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document"
            className="shrink-0 cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {doc.analysis && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <Sparkles className="h-4 w-4" />
                AI summary
              </h4>
              <p className="text-sm leading-relaxed text-indigo-900">{doc.analysis.summary}</p>
              {doc.analysis.keyFindings?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {doc.analysis.keyFindings.map((finding, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] text-indigo-900">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
                      {finding}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <FileText className="h-4 w-4 text-slate-400" />
              {doc.fileName || 'Document'}
            </h4>
            <pre className="max-h-[46vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-[13px] leading-relaxed text-slate-700">
              {doc.fileContentText?.trim() || 'This record carries no readable content.'}
            </pre>
          </section>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={downloadFile}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Everything a patient has on file, in one place for the dialog and the count. */
interface PatientPaperwork {
  patientName: string;
  /** Vault records — each one opens in the reader. */
  docs: MedicalDocument[];
  /** Filed at booking as names only; there is nothing to open. */
  attachmentNames: string[];
}

/**
 * The patient's uploads, listed in a popup.
 *
 * A card shows a single "Uploaded documents" link rather than one chip per
 * file: a patient with six reports would otherwise push the card's actions
 * below the fold, and the doctor scanning the list cares only *whether* there
 * is paperwork — the contents are a click away.
 */
function DocumentListDialog({
  paperwork,
  onOpenDoc,
  onClose,
}: {
  paperwork: PatientPaperwork;
  onOpenDoc: (doc: MedicalDocument) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const { docs, attachmentNames, patientName } = paperwork;
  const total = docs.length + attachmentNames.length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Uploaded documents — ${patientName}`}
        onClick={e => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">Uploaded documents</h3>
            <p className="text-sm text-slate-500">
              {patientName} · {total} {total === 1 ? 'file' : 'files'} on record
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close documents"
            className="shrink-0 cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
          {total === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              This patient has not uploaded anything.
            </p>
          )}

          {docs.map(doc => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onOpenDoc(doc)}
              className="block w-full cursor-pointer rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2">
                    {doc.title}
                  </p>
                  <p className="text-[13px] text-slate-500">
                    {doc.category} · <span className="font-mono">{doc.uploadDate}</span>
                    {doc.fileSize ? ` · ${doc.fileSize}` : ''}
                  </p>
                </div>
                <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                  {doc.analysis && <Sparkles className="h-3.5 w-3.5 text-indigo-600" />}
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                </span>
              </div>
              {doc.analysis && (
                <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-600">
                  {doc.analysis.summary}
                </p>
              )}
            </button>
          ))}

          {attachmentNames.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Attached at booking
              </p>
              {attachmentNames.map((name, i) => (
                <p
                  key={`attached-${i}`}
                  title="Named at booking — not yet in the document vault, so there is nothing to open"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-600"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{name}</span>
                  <span className="ml-auto shrink-0 text-slate-400">not uploaded yet</span>
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-100 p-5">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DoctorQueue({
  appointments,
  doctors,
  patients,
  documents,
  currentUser,
  view = 'pending',
  onJoinVideo,
  onCompleteConsultation,
}: DoctorQueueProps) {
  // Local calendar day, not the UTC one — see todayLocal(). Appointment dates
  // are plain local days, so comparing them against a UTC key put today's
  // bookings under "Upcoming" for the first 5½ hours of every IST day.
  const today = todayLocal();
  const isCompletedView = view === 'completed';

  /**
   * Prescribing authority.
   *
   * The front desk works this same queue — it has to see who is booked in, and
   * to mark a visit completed once the patient has been seen and gone home.
   * What it may NOT do is practise medicine: no diagnosis, no advice, no
   * prescription. Those are the attending consultant's to write.
   *
   * Withdrawing the record form is only the visible half of the rule. POST
   * /api/appointments/:id/status enforces the other half, refusing any clinical
   * content that does not come from a clinical role — so a desk client that
   * regressed could not file a prescription even with the button back.
   */
  const canPrescribe = currentUser?.role === 'doctor' || currentUser?.role === 'admin';

  // A doctor sees their own list; admin/front-desk can watch any doctor's queue.
  const [doctorId, setDoctorId] = useState<string>(
    currentUser?.role === 'doctor' ? currentUser.id : doctors[0]?.id || ''
  );
  const [scope, setScope] = useState<'today' | 'all'>('today');

  /** The appointment whose consultation dialog is open, and which dialog it is. */
  const [workingApptId, setWorkingApptId] = useState<string>('');
  const [dialog, setDialog] = useState<'record' | 'confirm' | null>(null);

  // Consultation form — held here rather than in the dialog so that opening
  // "Complete checkup" straight after "Add prescription" keeps what was typed.
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [lines, setLines] = useState<PrescriptionLine[]>([{ ...EMPTY_LINE }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [justCompleted, setJustCompleted] = useState<{ name: string; count: number } | null>(null);
  const [viewingDoc, setViewingDoc] = useState<MedicalDocument | null>(null);
  /** Whose paperwork the documents popup is showing. */
  const [viewingPaperwork, setViewingPaperwork] = useState<PatientPaperwork | null>(null);

  /**
   * Appointments closed during this session.
   *
   * The card is pulled the instant the server accepts the completion, rather
   * than waiting for the parent's full data reload — otherwise a patient the
   * doctor has just finished with sits on the pending list for the length of
   * four refetches, which reads as "the button didn't work".
   */
  const [justClosedIds, setJustClosedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentUser?.role === 'doctor') setDoctorId(currentUser.id);
  }, [currentUser]);

  const doctor = doctors.find(d => d.id === doctorId);

  const queue = useMemo(() => {
    return appointments
      .filter(a => a.doctorId === doctorId)
      .filter(a => a.status !== 'cancelled')
      .filter(a => {
        // Pending work looks forward; completed work looks back, so "Today"
        // means the same day in both views but "All" means opposite directions.
        if (a.status === 'completed') return scope === 'today' ? a.date === today : true;
        // "Upcoming" means the slot has genuinely not started yet — a 09:00
        // booking is no longer upcoming at 09:05. "Today" deliberately keeps
        // showing slots that have already begun: that is the working queue,
        // and a doctor running late still has to see those patients.
        return scope === 'today' ? a.date === today : isFutureAppointment(a);
      })
      .sort((a, b) => {
        if (a.date !== b.date) return isCompletedView ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
        return slotToMinutes(a.timeSlot) - slotToMinutes(b.timeSlot);
      });
  }, [appointments, doctorId, scope, today, isCompletedView]);

  const waiting = useMemo(
    () => queue.filter(a => a.status !== 'completed' && !justClosedIds.has(a.id)),
    [queue, justClosedIds]
  );
  const completed = useMemo(() => queue.filter(a => a.status === 'completed'), [queue]);
  const visible = isCompletedView ? completed : waiting;

  /**
   * Which of the booked patients this doctor has seen before.
   *
   * `appointment.isRevisit` is set by the booking flow, but it is absent or
   * false on every seeded record — so trusting it alone would label the whole
   * list "New patient". The fallback asks the real question instead: is there
   * an earlier, non-cancelled appointment with THIS doctor on file?
   */
  const followUpIds = useMemo(() => {
    const ids = new Set<string>();
    for (const appt of queue) {
      const seenBefore = appointments.some(
        a =>
          a.patientId === appt.patientId &&
          a.doctorId === appt.doctorId &&
          a.id !== appt.id &&
          a.status !== 'cancelled' &&
          (a.date < appt.date ||
            (a.date === appt.date && slotToMinutes(a.timeSlot) < slotToMinutes(appt.timeSlot)))
      );
      if (appt.isRevisit === true || seenBefore) ids.add(appt.id);
    }
    return ids;
  }, [queue, appointments]);

  const followUpCount = waiting.filter(a => followUpIds.has(a.id)).length;
  const newPatientCount = waiting.length - followUpCount;

  const workingAppt = queue.find(a => a.id === workingApptId) || null;
  const workingPatient = workingAppt ? patients.find(p => p.id === workingAppt.patientId) : undefined;

  /** Everything uploaded by a patient, newest first. */
  const docsFor = (patientId: string) =>
    documents
      .filter(d => d.patientId === patientId)
      .sort((a, b) => (b.uploadDate || '').localeCompare(a.uploadDate || ''));

  const pastVisitsFor = (appt: Appointment) =>
    appointments
      .filter(a => a.patientId === appt.patientId && a.id !== appt.id && a.status === 'completed')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 4);

  const filledLines = lines.filter(l => l.medicine.trim());

  const updateLine = (idx: number, patch: Partial<PrescriptionLine>) => {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) =>
    setLines(prev => (prev.length === 1 ? [{ ...EMPTY_LINE }] : prev.filter((_, i) => i !== idx)));

  const resetForm = () => {
    setDiagnosis('');
    setNotes('');
    setAdvice('');
    setLines([{ ...EMPTY_LINE }]);
    setError('');
  };

  /**
   * What the patient will receive — same builder the vault copy uses.
   *
   * For the front desk this collapses to an administrative close. A handover
   * note survives (an arrival time or a "patient left before being seen" is a
   * desk observation, not a clinical finding); diagnosis, advice and medicines
   * are hard-zeroed rather than merely hidden, so nothing left over in state
   * can ride along with the request.
   */
  const consultationData = canPrescribe
    ? {
        notes: notes.trim(),
        prescriptions: filledLines.map(formatPrescriptionLine),
        diagnosis: diagnosis.trim(),
        advice: advice.trim(),
      }
    : {
        notes: notes.trim(),
        prescriptions: [] as string[],
        diagnosis: '',
        advice: '',
      };

  const hasRecordedAnything =
    Boolean(consultationData.diagnosis || consultationData.notes || consultationData.advice) ||
    consultationData.prescriptions.length > 0;

  const previewText = useMemo(() => {
    if (!workingAppt) return '';
    return buildPrescriptionText(workingAppt, doctor, workingPatient, consultationData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingAppt, doctor, workingPatient, diagnosis, notes, advice, lines]);

  const openDialog = (appt: Appointment, which: 'record' | 'confirm') => {
    // Switching patients starts a clean record; reopening the same one keeps
    // whatever was already typed.
    if (appt.id !== workingApptId) {
      setWorkingApptId(appt.id);
      resetForm();
    } else {
      setError('');
    }
    setDialog(which);
  };

  const closeDialog = () => {
    if (isSaving) return;
    setDialog(null);
  };

  // Escape closes whichever dialog is open; the page behind must not scroll.
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) setDialog(null);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [dialog, isSaving]);

  /**
   * Close the consultation. Neither a prescription nor a document is required —
   * a checkup that needed neither is a perfectly ordinary outcome, and blocking
   * on one would push doctors into typing filler to get the patient off the list.
   */
  const handleComplete = async () => {
    if (!workingAppt) return;

    setError('');
    setIsSaving(true);
    try {
      const result = await onCompleteConsultation(
        workingAppt.id,
        workingAppt.patientId,
        consultationData
      );

      if (result && result.error) {
        setError(result.error);
        return;
      }

      // Off the page immediately — the parent's reload will agree a moment
      // later, but the doctor should never see a patient they have just
      // finished with still sitting in the queue.
      setJustClosedIds(prev => new Set(prev).add(workingAppt.id));
      setDialog(null);
      setJustCompleted({
        name: workingAppt.patientName,
        count: consultationData.prescriptions.length,
      });
      setTimeout(() => setJustCompleted(null), 6000);
      setWorkingApptId('');
      resetForm();
    } catch (err: any) {
      setError(err?.message || 'Could not close the consultation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  /* ======================================================================
     Cards
     ====================================================================== */

  const renderPendingCard = (appt: Appointment, position: number) => {
    const patient = patients.find(p => p.id === appt.patientId);
    const patientDocs = docsFor(appt.patientId);
    const attachments = [...(appt.uploadedReportNames || []), ...(appt.prescriptionNames || [])];
    const isLive = appt.status === 'active-video';
    const isOpen = appt.id === workingApptId && hasRecordedAnything;

    return (
      <li key={appt.id}>
        <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 sm:p-5">
          <div className="flex gap-4">
            <PatientAvatar
              name={appt.patientName}
              image={patient?.image}
              className="h-24 w-24 sm:h-28 sm:w-28"
            />

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 sm:text-lg">{appt.patientName}</p>
                  <p className="text-sm text-slate-500">
                    {appt.patientAge} yrs
                    {patient?.gender ? ` · ${patient.gender}` : ''} · {appt.patientContact}
                  </p>
                  {patient?.abhaId && (
                    <p className="font-mono text-[13px] text-slate-400">ABHA {patient.abhaId}</p>
                  )}
                </div>

                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 font-mono text-sm font-semibold text-indigo-700">
                  {position + 1}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-medium text-slate-700">
                  <Clock className="h-3 w-3" />
                  {appt.timeSlot}
                </span>
                {scope === 'all' && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
                    <CalendarDays className="h-3 w-3" />
                    {friendlyDate(appt.date)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700">
                  {appt.type === 'video' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                  {appt.type === 'video' ? 'Video call' : 'In person'}
                </span>
                <VisitTypeBadge isFollowUp={followUpIds.has(appt.id)} />
                {isLive && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                    In call
                  </span>
                )}
                {isOpen && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
                    <ClipboardList className="h-3 w-3" />
                    Draft record saved
                  </span>
                )}
              </div>

              {appt.notes?.trim() && (
                <p className="line-clamp-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-500">Reported: </span>
                  {appt.notes}
                </p>
              )}

              {patient?.allergies?.length ? (
                <p className="flex items-start gap-1.5 text-[13px] text-rose-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Allergic to {patient.allergies.join(', ')}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {/* One link, not a chip per file — the list opens in a popup. */}
            {patientDocs.length + attachments.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setViewingPaperwork({
                    patientName: appt.patientName,
                    docs: patientDocs,
                    attachmentNames: attachments,
                  })
                }
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                Uploaded documents
                <span className="text-slate-400">· {patientDocs.length + attachments.length}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 px-1 text-sm text-slate-400">
                <FileText className="h-4 w-4" />
                No documents uploaded
              </span>
            )}

            {appt.type === 'video' && (
              <button
                type="button"
                onClick={() => onJoinVideo(appt)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Video className="h-4 w-4" />
                Start video call
              </button>
            )}

            {/* Prescribing is the consultant's — the desk never sees this. */}
            {canPrescribe && (
              <button
                type="button"
                onClick={() => openDialog(appt, 'record')}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Pill className="h-4 w-4 text-slate-400" />
                Add prescription
                <span className="text-slate-400">· optional</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openDialog(appt, 'confirm')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              {canPrescribe ? 'Complete checkup' : 'Mark as completed'}
            </button>
          </div>
        </article>
      </li>
    );
  };

  const renderCompletedCard = (appt: Appointment) => {
    const patient = patients.find(p => p.id === appt.patientId);
    const patientDocs = docsFor(appt.patientId);
    const rawRecord = appt.consultation;
    // A checkup closed without notes still files a record — it just has nothing
    // in it. Treat that as "no record" for display rather than rendering an
    // empty definition list.
    const record =
      rawRecord &&
      (rawRecord.diagnosis || rawRecord.notes || rawRecord.advice || rawRecord.prescriptions.length > 0)
        ? rawRecord
        : null;
    const past = pastVisitsFor(appt);

    return (
      <li key={appt.id}>
        <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex gap-4">
            <PatientAvatar
              name={appt.patientName}
              image={patient?.image}
              className="h-20 w-20 sm:h-24 sm:w-24"
            />

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 sm:text-lg">{appt.patientName}</p>
                  <p className="text-sm text-slate-500">
                    {appt.patientAge} yrs
                    {patient?.gender ? ` · ${patient.gender}` : ''} · {appt.patientContact}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[13px] font-medium text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Seen · {friendlyDate(appt.date)} {appt.timeSlot}
                </span>
              </div>

              {record ? (
                <dl className="space-y-2 text-sm">
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
              ) : (
                <p className="text-sm text-slate-500">
                  {rawRecord?.closedByRole === 'hospital'
                    ? 'Marked completed at the front desk — no clinical record was filed.'
                    : 'Closed without a written record — no prescription or notes were filed.'}
                </p>
              )}

              {/* An administrative close is not a consultant who wrote nothing.
                  Label it, so the two are never confused in the visit history. */}
              {rawRecord?.closedByRole === 'hospital' && (
                <p className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Closed by front desk
                  {rawRecord.closedByName ? ` · ${rawRecord.closedByName}` : ''}
                </p>
              )}

              {past.length > 0 && (
                <p className="text-[13px] text-slate-400">
                  {past.length} earlier visit{past.length === 1 ? '' : 's'} on file
                </p>
              )}
            </div>
          </div>

          {patientDocs.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() =>
                  setViewingPaperwork({
                    patientName: appt.patientName,
                    docs: patientDocs,
                    attachmentNames: [],
                  })
                }
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 text-slate-400" />
                Uploaded documents
                <span className="text-slate-400">· {patientDocs.length}</span>
              </button>
            </div>
          )}
        </article>
      </li>
    );
  };

  /* ======================================================================
     Page
     ====================================================================== */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-900">
            {isCompletedView ? 'Completed' : 'Appointments'}
          </h2>
          <p className="text-sm text-slate-500">
            {doctor ? `${doctor.name} · ${doctor.specialty}` : 'Select a doctor'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUser?.role !== 'doctor' && doctors.length > 0 && (
            <select
              value={doctorId}
              onChange={e => setDoctorId(e.target.value)}
              aria-label="Doctor"
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
            >
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}

          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {([
              { id: 'today', label: 'Today' },
              { id: 'all', label: isCompletedView ? 'All' : 'Upcoming' },
            ] as const).map(o => (
              <button
                key={o.id}
                onClick={() => setScope(o.id)}
                className={`min-h-9 cursor-pointer rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  scope === o.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {justCompleted && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <Check className="h-4 w-4 shrink-0 text-emerald-700" />
          <p className="text-sm text-emerald-900">
            Checkup for <strong className="font-semibold">{justCompleted.name}</strong> completed — moved to
            Completed.
            {!canPrescribe
              ? ' Closed administratively — no clinical record was filed.'
              : justCompleted.count > 0
              ? ' The prescription is on their profile and in the Document Vault.'
              : ' No prescription was filed.'}
          </p>
        </div>
      )}

      {/* Count line + case mix */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {visible.length} {isCompletedView ? 'completed' : 'pending'}
          {visible.length === 1 ? ' consultation' : ' consultations'}
          {scope === 'today' ? ' today' : ''}
        </p>

        {!isCompletedView && waiting.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {followUpCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[13px] font-medium text-amber-800">
                <Repeat className="h-3.5 w-3.5" />
                {followUpCount} follow-up{followUpCount === 1 ? '' : 's'}
              </span>
            )}
            {newPatientCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[13px] font-medium text-sky-800">
                <UserPlus className="h-3.5 w-3.5" />
                {newPatientCount} new
              </span>
            )}
          </div>
        )}
      </div>

      {/* The list. Completed consultations never appear here in the pending
          view — they live behind the Completed rail entry. */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          {isCompletedView ? (
            <>
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-800">No completed consultations</p>
              <p className="text-sm text-slate-500">
                Checkups you close {scope === 'today' ? 'today' : ''} will be listed here.
              </p>
            </>
          ) : (
            <>
              <Stethoscope className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-800">No pending appointments</p>
              <p className="text-sm text-slate-500">
                {completed.length > 0
                  ? 'Everyone booked has been seen — closed consultations are under Completed.'
                  : scope === 'today'
                  ? 'Nothing booked with you for today.'
                  : 'Nothing booked with you yet.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((appt, idx) =>
            isCompletedView ? renderCompletedCard(appt) : renderPendingCard(appt, idx)
          )}
        </ul>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Consultation record                                               */}
      {/* ---------------------------------------------------------------- */}
      {/* `canPrescribe` is the backstop: every route into this dialog is already
          withdrawn from the front desk, so this guard should be unreachable —
          which is exactly why it is here. */}
      {canPrescribe && dialog === 'record' && workingAppt && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rx-title"
            onClick={e => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white sm:max-h-[88vh] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div className="min-w-0">
                <h3 id="rx-title" className="font-serif text-lg font-semibold text-slate-900">
                  Consultation record
                </h3>
                <p className="truncate text-sm text-slate-500">
                  {workingAppt.patientName} · {workingAppt.patientAge} yrs · {friendlyDate(workingAppt.date)}{' '}
                  {workingAppt.timeSlot}
                </p>
              </div>
              <button
                onClick={closeDialog}
                disabled={isSaving}
                aria-label="Close"
                className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
              {/* What is already known about this patient */}
              <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-rose-700">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Allergies
                  </p>
                  <p className="text-[13px] text-slate-700">
                    {workingPatient?.allergies?.length ? workingPatient.allergies.join(', ') : 'None recorded'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-700">
                    <Pill className="h-3.5 w-3.5" />
                    Current medicines
                  </p>
                  <p className="text-[13px] text-slate-700">
                    {workingPatient?.medications?.length ? workingPatient.medications.join(', ') : 'None recorded'}
                  </p>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    <Activity className="h-3.5 w-3.5" />
                    Conditions
                  </p>
                  <p className="text-[13px] text-slate-700">
                    {workingPatient?.medicalConditions?.length
                      ? workingPatient.medicalConditions.join(', ')
                      : 'None recorded'}
                  </p>
                </div>
              </section>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">
                  Diagnosis <span className="font-normal text-slate-400">optional</span>
                </span>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                  placeholder="e.g. Stage 1 essential hypertension"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">
                  Examination notes <span className="font-normal text-slate-400">optional</span>
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Findings, observations, vitals discussed…"
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </label>

              {/* Prescription */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    Prescription <span className="font-normal text-slate-400">optional</span>
                  </span>
                  <span className="text-[13px] text-slate-400">
                    {filledLines.length} {filledLines.length === 1 ? 'medicine' : 'medicines'}
                  </span>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-[1.4fr_0.8fr_1fr_0.8fr_auto]">
                      <input
                        type="text"
                        value={line.medicine}
                        onChange={e => updateLine(idx, { medicine: e.target.value })}
                        placeholder="Medicine"
                        aria-label={`Medicine ${idx + 1}`}
                        className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={line.dosage}
                        onChange={e => updateLine(idx, { dosage: e.target.value })}
                        placeholder="40mg"
                        aria-label={`Dosage ${idx + 1}`}
                        className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={line.frequency}
                        onChange={e => updateLine(idx, { frequency: e.target.value })}
                        placeholder="Once daily, morning"
                        aria-label={`Frequency ${idx + 1}`}
                        className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={line.duration}
                        onChange={e => updateLine(idx, { duration: e.target.value })}
                        placeholder="30 days"
                        aria-label={`Duration ${idx + 1}`}
                        className="rounded-md border border-slate-200 px-2.5 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label={`Remove medicine ${idx + 1}`}
                        className="cursor-pointer self-center rounded-md p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add medicine
                </button>

                {workingPatient?.allergies?.length ? (
                  <p className="flex items-start gap-1.5 text-[13px] text-rose-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Allergic to {workingPatient.allergies.join(', ')} — check before prescribing.
                  </p>
                ) : null}
              </div>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">
                  Advice &amp; follow-up <span className="font-normal text-slate-400">optional</span>
                </span>
                <textarea
                  rows={2}
                  value={advice}
                  onChange={e => setAdvice(e.target.value)}
                  placeholder="e.g. Low-salt diet, walk 30 min daily. Review in 12 weeks."
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </label>

              {/* Exactly what the patient receives. Closed by default so the
                  form stays the focus. */}
              {hasRecordedAnything && (
                <details className="group rounded-xl border border-slate-200">
                  <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium text-slate-700">
                    <Eye className="h-4 w-4 text-slate-400" />
                    Preview what {workingAppt.patientName} receives
                  </summary>
                  <div className="border-t border-slate-200 p-3">
                    <pre className="print-target whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-800">
                      {previewText}
                    </pre>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4" />
                      Print or save as PDF
                    </button>
                  </div>
                </details>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5">
              <button
                onClick={closeDialog}
                disabled={isSaving}
                className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Save &amp; close later
              </button>

              <button
                onClick={handleComplete}
                disabled={isSaving}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSaving ? 'Completing…' : 'Complete checkup'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Complete confirmation                                             */}
      {/* ---------------------------------------------------------------- */}
      {dialog === 'confirm' && workingAppt && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-title"
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div>
              <h3 id="complete-title" className="font-serif text-lg font-semibold text-slate-900">
                {canPrescribe ? 'Complete this checkup?' : 'Mark this appointment completed?'}
              </h3>
              <p className="text-sm text-slate-500">
                {workingAppt.patientName} · {friendlyDate(workingAppt.date)} {workingAppt.timeSlot}
              </p>
            </div>

            {/* Front desk: an administrative close, with an optional handover
                note. No diagnosis, advice or medicine fields — those belong to
                the consultant and the server refuses them from this role. */}
            {!canPrescribe ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This closes the appointment administratively. Only{' '}
                    {doctor?.name || 'the attending consultant'} can record a diagnosis, advice or
                    prescription for this visit.
                  </span>
                </p>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-slate-700">
                    Handover note <span className="font-normal text-slate-400">· optional</span>
                  </span>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Patient arrived 20 minutes late; seen and discharged."
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  />
                </label>
              </div>
            ) : hasRecordedAnything ? (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700">
                <p className="font-medium text-slate-800">This will be filed:</p>
                {consultationData.diagnosis && <p>Diagnosis — {consultationData.diagnosis}</p>}
                {consultationData.notes && <p>Notes recorded</p>}
                {consultationData.prescriptions.length > 0 && (
                  <p>
                    {consultationData.prescriptions.length} medicine
                    {consultationData.prescriptions.length === 1 ? '' : 's'} prescribed
                  </p>
                )}
                {consultationData.advice && <p>Advice recorded</p>}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-600">
                Nothing has been written for this visit. That is fine — a prescription is optional, and the
                checkup will be filed as completed with no record attached.
              </p>
            )}

            <p className="text-[13px] text-slate-500">
              {workingAppt.patientName} moves off the pending list and into Completed.
            </p>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={canPrescribe ? () => setDialog('record') : closeDialog}
                disabled={isSaving}
                className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {!canPrescribe ? 'Cancel' : hasRecordedAnything ? 'Edit record' : 'Add a prescription first'}
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={isSaving}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSaving ? 'Completing…' : canPrescribe ? 'Complete checkup' : 'Mark as completed'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {viewingPaperwork && (
        <DocumentListDialog
          paperwork={viewingPaperwork}
          onOpenDoc={setViewingDoc}
          onClose={() => setViewingPaperwork(null)}
        />
      )}

      {/* Rendered after the list so the reader stacks above it — closing the
          reader returns the doctor to the list they opened it from. */}
      {viewingDoc && <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />}
    </div>
  );
}
