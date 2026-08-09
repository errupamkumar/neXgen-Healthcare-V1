/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Video,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Star,
  Building2,
  Check,
  Upload,
  CreditCard,
  QrCode,
  Printer,
  ArrowRight,
  ArrowLeft,
  X,
  Paperclip,
  Building,
  Copy,
  Plus,
  Bell,
  Search,
  Send,
  Smartphone,
  MessageSquare,
  Mail,
  Zap,
  Siren,
  RefreshCw,
  ChevronDown,
  Info,
  Navigation,
  CalendarDays,
  Clock,
  User,
  Stethoscope,
} from 'lucide-react';
import { Doctor, PatientHistory, Appointment, WaitlistEntry, InAppNotification, LoggedInUser } from '../types';
import { DoctorFilterState, filterDoctors } from './DoctorFilterBar';
import DoctorLocationMap, { ClinicAddress } from './DoctorLocationMap';
import { doctorDirectoryConfig, patientPortalConfig } from '../config';
import { buildDirectionsLink, formatFullAddress } from '../lib/location';
import { PLATFORM_FEE, DOCTOR_FEE_NOTE } from '../lib/pricing';
import { isFutureAppointment, todayLocal } from '../lib/appointments';

interface DoctorBookingProps {
  doctors: Doctor[];
  patients: PatientHistory[];
  initialAppointment?: Appointment | null;
  onCloseModal?: () => void;
  /**
   * Hide the doctor list until the patient searches. Defaults to
   * VITE_DOCTOR_LIST_REQUIRE_SEARCH in .env; pass a value only to force one
   * behaviour for a particular screen.
   */
  requireSearch?: boolean;
  /**
   * The signed-in session. When a patient is booking and
   * VITE_BOOKING_USE_LOGGED_IN_PATIENT is on, the booking is filled from their
   * own profile and the "Who is this appointment for?" block is not shown.
   * Omitted by the front-desk/admin screens, which always keep the picker.
   */
  currentUser?: LoggedInUser | null;
  onBookAppointment: (bookingData: {
    doctorId: string;
    patientId: string;
    date: string;
    timeSlot: string;
    type: 'visiting' | 'video';
    patientName: string;
    patientAge: number;
    patientContact: string;
    notes: string;
    isRevisit?: boolean;
    previousBookingId?: string;
    uploadedReportNames?: string[];
    prescriptionNames?: string[];
    paymentMethod?: string;
    baseFee?: number;
    discountAmount?: number;
    taxAmount?: number;
    totalAmount?: number;
    bookingNo?: string;
  }) => Promise<any>;
}

interface UploadedDoc {
  id: string;
  name: string;
  size: string;
  type: 'report' | 'prescription';
}

/** "Wed, 5 Aug" — friendlier than an ISO string for a patient reading a summary. */
function friendlyDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function DoctorBooking({
  doctors,
  patients,
  onBookAppointment,
  initialAppointment,
  onCloseModal,
  requireSearch: requireSearchProp,
  currentUser,
}: DoctorBookingProps) {
  // Three required steps, then the confirmation screen.
  // 1: Choose doctor  2: Pick time + patient  3: Review & pay  4: Booked
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Filter State for Step 1
  const [filterState, setFilterState] = useState<DoctorFilterState>({
    state: 'ALL',
    district: 'ALL',
    searchName: '',
    department: 'ALL',
    availability: 'ALL'
  });

  // Whether the directory stays hidden until the patient searches. The .env
  // flag is the default; a caller may force one behaviour for its own screen.
  const requireSearch = requireSearchProp ?? doctorDirectoryConfig.requireSearch;

  const typedQuery = filterState.searchName.trim();
  const hasTypedQuery = typedQuery.length >= doctorDirectoryConfig.minSearchChars;
  const hasFilterApplied =
    filterState.department !== 'ALL' ||
    filterState.state !== 'ALL' ||
    filterState.district !== 'ALL' ||
    filterState.availability !== 'ALL';
  const isSearching = hasTypedQuery || (doctorDirectoryConfig.revealOnFilter && hasFilterApplied);

  /** Nothing is listed until the patient has actually searched for someone. */
  const showDoctorList = !requireSearch || isSearching;

  // useMemo keeps the array identity stable — filterDoctors() re-run on every
  // render would retrigger the auto-select effect below on every keystroke.
  const matchingDoctors = useMemo(
    () => (showDoctorList ? filterDoctors(doctors, filterState) : []),
    [doctors, filterState, showDoctorList]
  );

  const { maxResults } = doctorDirectoryConfig;
  const visibleDoctors = maxResults > 0 ? matchingDoctors.slice(0, maxResults) : matchingDoctors;
  const hiddenResultCount = matchingDoctors.length - visibleDoctors.length;

  // Several consultants hold OPD at more than one chamber, so two rows can
  // carry the same name and differ only by address. The card has to say so,
  // otherwise the second entry reads as a duplicate record.
  const chambersByName = useMemo(() => {
    const counts = new Map<string, number>();
    doctors.forEach(d => counts.set(d.name, (counts.get(d.name) ?? 0) + 1));
    return counts;
  }, [doctors]);

  const [selectedDocId, setSelectedDocId] = useState<string>(
    requireSearch ? '' : doctors[0]?.id || ''
  );

  // Auto-switch the selection only when the whole list is on show. Behind a
  // search gate the patient must pick explicitly — quietly binding a booking
  // to a doctor they never saw is exactly the failure mode the gate prevents.
  useEffect(() => {
    if (requireSearch) return;
    if (matchingDoctors.length > 0 && !matchingDoctors.some(d => d.id === selectedDocId)) {
      setSelectedDocId(matchingDoctors[0].id);
    }
  }, [requireSearch, matchingDoctors, selectedDocId]);

  // Step 2 State (Date, Slot, Type, Patient)
  // Local calendar day — a UTC key defaulted the booking form to yesterday for
  // anyone opening it before 05:30 IST.
  const [selectedDate, setSelectedDate] = useState<string>(todayLocal());
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [apptType, setApptType] = useState<'visiting' | 'video'>('visiting');

  const [selectedPatientId, setSelectedPatientId] = useState<string>('new');
  const [patientName, setPatientName] = useState<string>('');
  const [patientAge, setPatientAge] = useState<number | ''>('');
  const [patientContact, setPatientContact] = useState<string>('');

  // Optional extras (folded into step 3 behind a disclosure)
  const [isRevisit, setIsRevisit] = useState<boolean>(false);
  const [previousBookingId, setPreviousBookingId] = useState<string>('');
  const [uploadedReports, setUploadedReports] = useState<UploadedDoc[]>([]);
  const [uploadedPrescriptions, setUploadedPrescriptions] = useState<UploadedDoc[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [urgencyLevel, setUrgencyLevel] = useState<'routine' | 'high' | 'critical'>('routine');

  // Pre-load initial appointment details if rescheduling
  useEffect(() => {
    if (initialAppointment) {
      if (initialAppointment.doctorId) {
        setSelectedDocId(initialAppointment.doctorId);
      }
      setSelectedPatientId(initialAppointment.patientId || 'new');
      setPatientName(initialAppointment.patientName || '');
      setPatientAge(initialAppointment.patientAge || '');
      setPatientContact(initialAppointment.patientContact || '');
      setApptType(initialAppointment.type || 'visiting');
      setNotes(
        initialAppointment.notes
          ? `[Rescheduled from #${initialAppointment.bookingNo || initialAppointment.id}] ${initialAppointment.notes}`
          : `Rescheduled from #${initialAppointment.bookingNo || initialAppointment.id}`
      );
      setIsRevisit(true);
      setPreviousBookingId(initialAppointment.bookingNo || initialAppointment.id);

      if (initialAppointment.date) {
        setSelectedDate(initialAppointment.date);
      }
      if (initialAppointment.timeSlot) {
        setSelectedSlot(initialAppointment.timeSlot);
      }

      // Jump directly to date & slot selection
      setCurrentStep(2);
    }
  }, [initialAppointment]);

  // Reminders Configuration
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);
  const [reminderFrequency, setReminderFrequency] = useState<'1_hour' | '3_hours' | '12_hours' | '1_day' | 'daily'>('1_day');
  const [reminderMode, setReminderMode] = useState<'whatsapp' | 'sms' | 'email' | 'push'>('whatsapp');

  // Doctor Delay & Unavailability Real-Time Notifications
  const [delayAlertsEnabled, setDelayAlertsEnabled] = useState<boolean>(true);
  const [doctorLiveStatus, setDoctorLiveStatus] = useState<'on_time' | 'delayed_20m' | 'delayed_45m' | 'unavailable_emergency'>('on_time');
  const [testNotification, setTestNotification] = useState<{
    type: 'reminder' | 'delay' | 'unavailable';
    title: string;
    message: string;
    timestamp: string;
  } | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'counter'>('upi');
  const [upiId, setUpiId] = useState<string>('patient@okaxis');
  const [cardNumber, setCardNumber] = useState<string>('4111 •••• •••• 8892');
  const [cardExpiry, setCardExpiry] = useState<string>('08/28');
  const [cardCvv, setCardCvv] = useState<string>('321');
  const [selectedBank, setSelectedBank] = useState<string>('State Bank of India');

  // Slots tracker & Waitlist state
  const [slotsBookedCounts, setSlotsBookedCounts] = useState<Record<string, number>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedBookingNo, setCopiedBookingNo] = useState<boolean>(false);

  // Real-Time Waitlist & In-App Notification state
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [inAppNotifications, setInAppNotifications] = useState<InAppNotification[]>([]);
  const [isWaitlistSubmitting, setIsWaitlistSubmitting] = useState<boolean>(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState<{ slot: string; date: string; message: string } | null>(null);
  const [activeNotification, setActiveNotification] = useState<InAppNotification | null>(null);

  const selectedDoctor = doctors.find((d) => d.id === selectedDocId);
  // Present only for a saved profile — a brand new patient is typed in by hand,
  // so the preview falls back to the form fields for those.
  const selectedPatientRecord = patients.find((p) => p.id === selectedPatientId);

  /**
   * The profile a signed-in patient books against, or null when the picker
   * should be shown.
   *
   * Resolving the record here — rather than trusting the session id — is what
   * makes the lock safe to apply: if the account has no matching patient row,
   * this stays null and the form falls back to the normal picker instead of
   * stranding the user in a step they cannot complete.
   */
  const lockedPatient =
    patientPortalConfig.bookingUsesLoggedInPatient && currentUser?.role === 'patient'
      ? patients.find((p) => p.id === currentUser.id) ?? null
      : null;

  // Point the booking at the session's own profile. The auto-fill effect below
  // then populates name / age / mobile from that record, exactly as it does for
  // a hand-picked profile.
  useEffect(() => {
    if (lockedPatient && selectedPatientId !== lockedPatient.id) {
      setSelectedPatientId(lockedPatient.id);
    }
  }, [lockedPatient, selectedPatientId]);

  /**
   * In locked mode the name / age / mobile inputs are not on screen, so telling
   * the patient to "fill them in" would send them hunting for fields that do
   * not exist — the fix is in their profile instead.
   */
  const missingPatientDetailsMessage = () =>
    lockedPatient
      ? 'Your profile is missing a name, age or mobile number. Please complete your profile before booking.'
      : 'Please fill in the patient name, age and mobile number.';

  // Fetch waitlist & notifications
  const fetchWaitlistAndNotifications = async () => {
    try {
      const [wlRes, notifRes] = await Promise.all([
        fetch('/api/waitlist'),
        fetch('/api/notifications')
      ]);
      if (wlRes.ok) {
        const wl = await wlRes.json();
        setWaitlistEntries(wl);
      }
      if (notifRes.ok) {
        const notifs = await notifRes.json();
        setInAppNotifications(notifs);
        const unreadAlert = notifs.find((n: InAppNotification) => n.type === 'slot_available' && !n.read);
        setActiveNotification(unreadAlert || null);
      }
    } catch (err) {
      console.error('Error loading waitlist/notifications:', err);
    }
  };

  useEffect(() => {
    fetchWaitlistAndNotifications();
    const interval = setInterval(fetchWaitlistAndNotifications, 10000); // Polling every 10s for real-time alerts
    return () => clearInterval(interval);
  }, [selectedDocId, selectedDate]);

  const handleJoinWaitlist = async () => {
    if (!patientName.trim()) {
      setErrorMessage('Please enter the patient name below before joining the waitlist.');
      return;
    }
    if (!selectedSlot) {
      setErrorMessage('Please choose a time before joining the waitlist.');
      return;
    }
    setIsWaitlistSubmitting(true);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDocId,
          patientId: selectedPatientId,
          patientName,
          patientContact,
          date: selectedDate,
          timeSlot: selectedSlot,
          type: apptType
        })
      });
      if (response.ok) {
        setWaitlistSuccess({
          slot: selectedSlot,
          date: selectedDate,
          message: `You're on the waitlist for ${selectedDoctor?.name || 'this doctor'} on ${friendlyDate(selectedDate)} at ${selectedSlot}. We'll alert you the moment a place opens up.`
        });
        await fetchWaitlistAndNotifications();
      }
    } catch (err) {
      console.error('Waitlist submission failed:', err);
    } finally {
      setIsWaitlistSubmitting(false);
    }
  };

  const handleSimulateCancellation = async () => {
    if (!selectedSlot) return;
    try {
      const res = await fetch('/api/waitlist/simulate-cancellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDocId,
          date: selectedDate,
          timeSlot: selectedSlot
        })
      });
      if (res.ok) {
        const slotsRes = await fetch(`/api/slots-tracker?doctorId=${selectedDocId}&date=${selectedDate}`);
        if (slotsRes.ok) {
          setSlotsBookedCounts(await slotsRes.json());
        }
        await fetchWaitlistAndNotifications();
      }
    } catch (err) {
      console.error('Simulate cancellation failed:', err);
    }
  };

  const handleClaimWaitlistSlot = async (notif: InAppNotification) => {
    try {
      await fetch(`/api/notifications/${notif.id}/read`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setSelectedDocId(notif.doctorId);
    setSelectedDate(notif.date);
    setSelectedSlot(notif.timeSlot);
    setActiveNotification(null);
    setWaitlistSuccess(null);
    try {
      const slotsRes = await fetch(`/api/slots-tracker?doctorId=${notif.doctorId}&date=${notif.date}`);
      if (slotsRes.ok) {
        setSlotsBookedCounts(await slotsRes.json());
      }
    } catch (err) {}
    await fetchWaitlistAndNotifications();
  };

  const handleDismissNotification = async (notifId: string) => {
    try {
      await fetch(`/api/notifications/${notifId}/read`, { method: 'POST' });
    } catch (err) {}
    setActiveNotification(null);
  };

  const getWaitlistCountForSlot = (slot: string) => {
    return waitlistEntries.filter(
      (w) => w.doctorId === selectedDocId && w.date === selectedDate && w.timeSlot === slot && w.status === 'waiting'
    ).length;
  };

  // Pricing: ₹50 reserves the slot online, the doctor's fee is settled at the
  // clinic. The consultation figures below are still sent with the booking so
  // the clinic's own record is complete — they are never shown to the patient.
  const bookingFee = PLATFORM_FEE;
  const doctorOfflineFee = selectedDoctor?.fee || 1000;
  const discountAmount = isRevisit ? Math.round(doctorOfflineFee * 0.20) : 0;
  const baseFee = doctorOfflineFee;
  const taxAmount = 0;
  const totalAmount = bookingFee;

  // Next 7 days for the date picker
  const datesList = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    return { dateStr, weekday, dayNum, month };
  });

  // Load slot booking levels when doctor or date changes
  useEffect(() => {
    if (!selectedDocId || !selectedDate) return;

    const fetchSlotsTracker = async () => {
      setIsLoadingSlots(true);
      try {
        const response = await fetch(
          `/api/slots-tracker?doctorId=${selectedDocId}&date=${selectedDate}`
        );
        if (response.ok) {
          const counts = await response.json();
          setSlotsBookedCounts(counts);
        }
      } catch (err) {
        console.error('Error fetching slots tracker:', err);
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlotsTracker();
    setSelectedSlot('');
  }, [selectedDocId, selectedDate, bookingSuccess]);

  // Adjust apptType to visiting if doctor doesn't support video
  useEffect(() => {
    if (selectedDoctor && !selectedDoctor.videoEnabled) {
      setApptType('visiting');
    }
  }, [selectedDocId]);

  // Auto-fill form fields when an existing patient is chosen
  useEffect(() => {
    if (selectedPatientId === 'new') {
      setPatientName('');
      setPatientAge('');
      setPatientContact('');
    } else {
      const patient = patients.find((p) => p.id === selectedPatientId);
      if (patient) {
        setPatientName(patient.name);
        setPatientAge(patient.age);
        setPatientContact(patient.contact);
      }
    }
  }, [selectedPatientId, patients]);

  // File Upload Helpers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'report' | 'prescription') => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newDocs: UploadedDoc[] = files.map((file: File) => ({
      id: 'up-' + Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type
    }));

    if (type === 'report') {
      setUploadedReports(prev => [...prev, ...newDocs]);
    } else {
      setUploadedPrescriptions(prev => [...prev, ...newDocs]);
    }
  };

  const removeDoc = (id: string, type: 'report' | 'prescription') => {
    if (type === 'report') {
      setUploadedReports(prev => prev.filter(d => d.id !== id));
    } else {
      setUploadedPrescriptions(prev => prev.filter(d => d.id !== id));
    }
  };

  // Demo file attachments for quick testing
  const addDemoReport = () => {
    setUploadedReports(prev => [
      ...prev,
      { id: 'up-demo-1', name: 'Lab_Report_Blood_CBC_Feb2026.pdf', size: '240 KB', type: 'report' }
    ]);
  };

  const addDemoPrescription = () => {
    setUploadedPrescriptions(prev => [
      ...prev,
      { id: 'up-demo-2', name: 'Previous_Rx_DrSharma_Jan2026.png', size: '180 KB', type: 'prescription' }
    ]);
  };

  // Final submission
  const handleFinalPaymentSubmit = async () => {
    setErrorMessage('');

    if (!selectedDocId) {
      setErrorMessage('Please choose a doctor.');
      return;
    }
    if (!selectedSlot) {
      setErrorMessage('Please choose an available time.');
      return;
    }
    if (!patientName || !patientAge || !patientContact) {
      setErrorMessage(missingPatientDetailsMessage());
      return;
    }

    setIsSubmitting(true);
    try {
      const generatedBookingNo = `BK-NXG-${Math.floor(100000 + Math.random() * 900000)}`;
      const generatedTokenNo = `Token #A-${Math.floor(10 + Math.random() * 89)}`;

      const bookingPayload = {
        doctorId: selectedDocId,
        patientId: selectedPatientId === 'new' ? '' : selectedPatientId,
        date: selectedDate,
        timeSlot: selectedSlot,
        type: apptType,
        patientName,
        patientAge: Number(patientAge),
        patientContact,
        notes: notes || 'Standard consultation appointment',
        isRevisit,
        previousBookingId: isRevisit ? previousBookingId : '',
        uploadedReportNames: uploadedReports.map(r => r.name),
        prescriptionNames: uploadedPrescriptions.map(p => p.name),
        paymentMethod: paymentMethod === 'upi' ? 'UPI Instant' : paymentMethod === 'card' ? 'Credit/Debit Card' : paymentMethod === 'netbanking' ? 'Net Banking' : 'Pay at OPD Counter',
        baseFee,
        discountAmount,
        taxAmount,
        totalAmount,
        bookingNo: generatedBookingNo,
        tokenNo: generatedTokenNo
      };

      const result = await onBookAppointment(bookingPayload);

      if (result && !result.error) {
        setBookingSuccess(result);
        setCurrentStep(4); // Confirmation screen
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setErrorMessage(result?.error || 'We could not confirm this booking. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Something went wrong while booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetBooking = () => {
    setCurrentStep(1);
    setBookingSuccess(null);
    setSelectedSlot('');
    setUploadedReports([]);
    setUploadedPrescriptions([]);
    setIsRevisit(false);
    setPreviousBookingId('');
    setNotes('');
  };

  const goToStep2 = () => {
    if (!selectedDocId) {
      setErrorMessage('Please choose a doctor to continue.');
      return;
    }
    setErrorMessage('');
    setCurrentStep(2);
  };

  const goToStep3 = () => {
    if (!selectedSlot) {
      setErrorMessage('Please choose a time for the appointment.');
      return;
    }
    if (!patientName || !patientAge || !patientContact) {
      setErrorMessage(missingPatientDetailsMessage());
      return;
    }
    setErrorMessage('');
    setCurrentStep(3);
  };

  const STEPS = [
    { id: 1, title: 'Doctor' },
    { id: 2, title: 'Date & time' },
    { id: 3, title: 'Confirm' },
  ];

  const extrasCount =
    uploadedReports.length +
    uploadedPrescriptions.length +
    (isRevisit ? 1 : 0) +
    (notes.trim() ? 1 : 0);

  // Departments offered by the doctors actually on file — no empty options.
  const departments = Array.from(
    new Set(doctors.map(d => d.department).filter(Boolean) as string[])
  ).sort();

  /** "Purnea, Bihar" while every chamber sits in one district; a count once they don't. */
  const directoryArea = useMemo(() => {
    const districts = Array.from(new Set(doctors.map(d => d.district).filter(Boolean))) as string[];
    const states = Array.from(new Set(doctors.map(d => d.state).filter(Boolean))) as string[];
    if (districts.length === 1) return [districts[0], states[0]].filter(Boolean).join(', ');
    if (districts.length > 1) return `${districts.length} cities`;
    return 'our network';
  }, [doctors]);

  const isSelectedSlotFull =
    !!selectedSlot &&
    !!selectedDoctor &&
    (slotsBookedCounts[selectedSlot] || 0) >= (selectedDoctor.maxSchedulesPerSlot || 1);

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ---------------------------------------------------------------- */}
      {/* Page heading                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-900">
            {initialAppointment ? 'Reschedule appointment' : 'Book an appointment'}
          </h2>
          <p className="text-sm text-slate-500">
            {initialAppointment
              ? `Choose a new date and time for booking #${previousBookingId}`
              : 'Three quick steps. Pay ₹50 now to hold your slot — the doctor’s fee is paid at the clinic.'}
          </p>
        </div>

        {onCloseModal && (
          <button
            type="button"
            onClick={onCloseModal}
            className="cursor-pointer rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Reschedule notice */}
      {initialAppointment && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-sm text-amber-900">
            Rescheduling <strong className="font-semibold">{initialAppointment.patientName}</strong>’s appointment —
            currently {friendlyDate(initialAppointment.date)} at {initialAppointment.timeSlot}. Your details are already filled in.
          </p>
        </div>
      )}

      {/* Slot-opened alert */}
      {activeNotification && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">A slot just opened up</p>
              <p className="text-sm text-emerald-800">{activeNotification.message}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => handleClaimWaitlistSlot(activeNotification)}
              className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              Take this slot
            </button>
            <button
              type="button"
              onClick={() => handleDismissNotification(activeNotification.id)}
              aria-label="Dismiss"
              className="cursor-pointer rounded-lg p-2 text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Progress                                                          */}
      {/* ---------------------------------------------------------------- */}
      {currentStep <= 3 && (
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <li key={step.id} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => isDone && setCurrentStep(step.id)}
                  disabled={!isDone}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-lg px-1 py-1 text-sm transition-colors ${
                    isDone ? 'cursor-pointer text-slate-700 hover:text-slate-900' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-400'
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : step.id}
                  </span>
                  <span
                    className={`hidden font-medium sm:inline ${
                      isCurrent ? 'text-slate-900' : isDone ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* Error */}
      {errorMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            aria-label="Dismiss"
            className="cursor-pointer text-rose-500 hover:text-rose-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 1 — CHOOSE A DOCTOR                                          */}
      {/* ================================================================ */}
      {currentStep === 1 && (
        <div className="space-y-5">
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              {/* <h3 className="text-base font-semibold text-slate-900">Who would you like to see?</h3> */}
              <h3 className="text-base font-semibold text-slate-900">Search Doctor</h3>
              <p className="text-sm text-slate-500">
                {requireSearch
                  ? 'Search by name, speciality, hospital or locality — matching doctors appear below.'
                  : 'Search by name or condition, or browse by department.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={filterState.searchName}
                  onChange={(e) => setFilterState(p => ({ ...p, searchName: e.target.value }))}
                  placeholder="Search a doctor, speciality or hospital"
                  aria-label="Search doctors"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-indigo-500"
                />
              </div>

              <select
                value={filterState.department}
                onChange={(e) => setFilterState(p => ({ ...p, department: e.target.value }))}
                aria-label="Department"
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500"
              >
                <option value="ALL">All departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Secondary filters stay out of the way until asked for. */}
            <details className="group">
              <summary className="-my-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 py-2 text-sm font-medium text-indigo-700 hover:text-indigo-800">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                More filters
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <select
                  value={filterState.state}
                  onChange={(e) => setFilterState(p => ({ ...p, state: e.target.value, district: 'ALL' }))}
                  aria-label="State"
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Any state</option>
                  {Array.from(new Set(doctors.map(d => d.state).filter(Boolean) as string[])).sort().map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

                <select
                  value={filterState.district}
                  onChange={(e) => setFilterState(p => ({ ...p, district: e.target.value }))}
                  aria-label="City"
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Any city</option>
                  {Array.from(new Set(doctors.map(d => d.district).filter(Boolean) as string[])).sort().map(dt => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </select>

                <select
                  value={filterState.availability}
                  onChange={(e) => setFilterState(p => ({ ...p, availability: e.target.value }))}
                  aria-label="Consultation type"
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Any consultation type</option>
                  <option value="video">Video consultation</option>
                  <option value="visiting">Hospital visit only</option>
                </select>
              </div>
            </details>
          </div>

          {/* ----------------------------------------------------------------
              Results.
              The list is deliberately absent until the patient searches — see
              VITE_DOCTOR_LIST_REQUIRE_SEARCH in .env.
             ---------------------------------------------------------------- */}
          {!showDoctorList ? (
            <div className="space-y-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-12">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <Search className="h-7 w-7" />
              </span>

              <div className="space-y-1.5">
                <p className="text-base font-semibold text-slate-900">Search to see doctors</p>
                <p className="mx-auto max-w-md text-sm text-slate-500">
                  {typedQuery && !hasTypedQuery ? (
                    <>
                      Keep typing — {doctorDirectoryConfig.minSearchChars} characters or more brings up
                      matching doctors.
                    </>
                  ) : (
                    <>
                      Type a doctor’s name, speciality, hospital or locality above
                      {doctorDirectoryConfig.revealOnFilter && ', or pick a department'}. We hold{' '}
                      <strong className="font-semibold text-slate-700">{doctors.length}</strong> consulting{' '}
                      {doctors.length === 1 ? 'chamber' : 'chambers'} across {directoryArea}.
                    </>
                  )}
                </p>
              </div>

              {doctorDirectoryConfig.revealOnFilter && departments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Or browse a department
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {departments.slice(0, 8).map(dept => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setFilterState(p => ({ ...p, department: dept }))}
                        className="cursor-pointer rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-slate-500">
                  {matchingDoctors.length} {matchingDoctors.length === 1 ? 'doctor' : 'doctors'} found
                  {hiddenResultCount > 0 && (
                    <span className="text-slate-400">
                      {' '}· showing the first {visibleDoctors.length}, narrow your search to see the rest
                    </span>
                  )}
                </p>
                {isSearching && (
                  <button
                    type="button"
                    onClick={() => setFilterState({ state: 'ALL', district: 'ALL', searchName: '', department: 'ALL', availability: 'ALL' })}
                    className="cursor-pointer text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    Clear search
                  </button>
                )}
              </div>

              {matchingDoctors.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <p className="text-sm font-medium text-slate-800">No doctors match that search</p>
                  <p className="text-sm text-slate-500">Try a different name, speciality or locality.</p>
                  <button
                    type="button"
                    onClick={() => setFilterState({ state: 'ALL', district: 'ALL', searchName: '', department: 'ALL', availability: 'ALL' })}
                    className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {visibleDoctors.map((doc) => {
                    const isSelected = doc.id === selectedDocId;
                    // Same consultant, another chamber — worth flagging, since the
                    // rows are otherwise identical down to the photograph.
                    const otherChambers = (chambersByName.get(doc.name) ?? 1) - 1;

                    return (
                      <li key={doc.id}>
                        {/* A div, not a <button>: the card holds its own map
                            button, and a button inside a button is invalid HTML
                            that browsers silently un-nest. */}
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedDocId(doc.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedDocId(doc.id);
                            }
                          }}
                          className={`w-full min-w-0 cursor-pointer rounded-xl border p-4 transition-colors sm:p-5 ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex gap-4">
                            {/* A large portrait: patients recognise their doctor
                                by face far faster than by a 14px line of text. */}
                            <DoctorPortrait doctor={doc} className="h-28 w-28 sm:h-32 sm:w-32" />

                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 sm:text-lg">{doc.name}</p>
                                  <p className="text-sm text-indigo-700">{doc.specialty}</p>
                                </div>
                                {isSelected && (
                                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                                    <Check className="h-4 w-4" />
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <span className="flex items-center gap-1 text-slate-600">
                                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                  {doc.rating}
                                </span>
                                {doc.experienceYears && (
                                  <span className="text-slate-500">{doc.experienceYears} yrs experience</span>
                                )}
                                {/* No consultation fee is quoted anywhere in the
                                    patient flow — it is settled in person at the
                                    clinic, so a figure here would be a promise
                                    the reception desk has to honour. */}
                                <span className="text-slate-500">Fee paid at the clinic</span>
                                {doc.videoEnabled && (
                                  <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                                    <Video className="h-3 w-3" />
                                    Video available
                                  </span>
                                )}
                              </div>

                              {otherChambers > 0 && (
                                <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[13px] text-amber-800">
                                  <Info className="h-3.5 w-3.5 shrink-0" />
                                  Also consults at {otherChambers} other{' '}
                                  {otherChambers === 1 ? 'address' : 'addresses'} — check the location below
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Address + pin-pointed map: with same-named doctors in
                              the list, this is the field that tells them apart. */}
                          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(0,1fr)_216px]">
                            <ClinicAddress doctor={doc} />
                            <DoctorLocationMap doctor={doc} height={120} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <StepBar
            summary={
              selectedDoctor ? (
                <span className="text-sm text-slate-600">
                  Selected: <strong className="font-semibold text-slate-900">{selectedDoctor.name}</strong>
                  {(selectedDoctor.area || selectedDoctor.district) && (
                    <span className="text-slate-500">
                      {' '}· {selectedDoctor.area || selectedDoctor.district}
                    </span>
                  )}
                </span>
              ) : null
            }
            next={{ label: 'Continue', onClick: goToStep2, disabled: !selectedDocId }}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 2 — DATE, TIME & PATIENT                                     */}
      {/* ================================================================ */}
      {currentStep === 2 && selectedDoctor && (
        <div className="space-y-5">
          {/* Chosen doctor — the address is repeated here because several
              consultants share a name; this is the patient's chance to notice
              they picked the Khushkibagh chamber rather than Line Bazar. */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <DoctorPortrait doctor={selectedDoctor} className="h-16 w-16" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{selectedDoctor.name}</p>
                  <p className="truncate text-sm text-indigo-700">{selectedDoctor.specialty}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Change
              </button>
            </div>

            <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <ClinicAddress doctor={selectedDoctor} />
              <DoctorLocationMap doctor={selectedDoctor} height={110} />
            </div>
          </div>

          {/* How to consult */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">How would you like to consult?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setApptType('visiting')}
                aria-pressed={apptType === 'visiting'}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  apptType === 'visiting'
                    ? 'border-indigo-600 bg-indigo-50/40'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                <span>
                  <span className="block font-medium text-slate-900">Visit the hospital</span>
                  <span className="block text-sm text-slate-500">Meet the doctor in the OPD</span>
                </span>
              </button>

              <button
                type="button"
                disabled={!selectedDoctor.videoEnabled}
                onClick={() => setApptType('video')}
                aria-pressed={apptType === 'video'}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  !selectedDoctor.videoEnabled
                    ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                    : apptType === 'video'
                    ? 'cursor-pointer border-indigo-600 bg-indigo-50/40'
                    : 'cursor-pointer border-slate-200 hover:border-slate-300'
                }`}
              >
                <Video className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                <span>
                  <span className="block font-medium text-slate-900">Video call</span>
                  <span className="block text-sm text-slate-500">
                    {selectedDoctor.videoEnabled ? 'Consult from home' : 'Not offered by this doctor'}
                  </span>
                </span>
              </button>
            </div>
          </section>

          {/* Date */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Pick a day</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {datesList.map((item, idx) => {
                const isSelected = selectedDate === item.dateStr;
                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(item.dateStr)}
                    aria-pressed={isSelected}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border py-3 transition-colors ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className={`text-[11px] uppercase ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                      {idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : item.weekday}
                    </span>
                    <span className="font-mono text-lg font-semibold leading-tight">{item.dayNum}</span>
                    <span className={`text-[11px] ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>
                      {item.month}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Time */}
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Pick a time</h3>
              <span className="text-sm text-slate-500">{friendlyDate(selectedDate)}</span>
            </div>

            {isLoadingSlots ? (
              <p className="py-6 text-center text-sm text-slate-400">Checking availability…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {selectedDoctor.slots.map((slot) => {
                    const bookedCount = slotsBookedCounts[slot] || 0;
                    const maxLimit = selectedDoctor.maxSchedulesPerSlot;
                    const isFull = bookedCount >= maxLimit;
                    const isSelected = selectedSlot === slot;
                    const left = maxLimit - bookedCount;
                    // A slot that has already begun cannot be booked — every
                    // upcoming list in the app requires the start time to be
                    // ahead of the clock, so the booking form must not create
                    // one that isn't.
                    const hasPassed = !isFutureAppointment({ date: selectedDate, timeSlot: slot });

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={hasPassed}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setWaitlistSuccess(null);
                        }}
                        aria-pressed={isSelected}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border py-3 transition-colors ${
                          hasPassed
                            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                            : isSelected && isFull
                            ? 'cursor-pointer border-amber-500 bg-amber-50'
                            : isSelected
                            ? 'cursor-pointer border-indigo-600 bg-indigo-600 text-white'
                            : isFull
                            ? 'cursor-pointer border-slate-200 bg-slate-50 text-slate-500 hover:border-amber-300'
                            : 'cursor-pointer border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <span className="font-mono text-sm font-medium">{slot}</span>
                        <span
                          className={`text-[11px] ${
                            hasPassed
                              ? 'text-slate-400'
                              : isSelected && !isFull
                              ? 'text-white/75'
                              : isFull
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {hasPassed ? 'Passed' : isFull ? 'Full' : `${left} left`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Waitlist — only surfaces when the chosen time is full */}
                {isSelectedSlotFull && (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    {waitlistSuccess && waitlistSuccess.slot === selectedSlot ? (
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">You’re on the waitlist</p>
                          <p className="text-sm text-emerald-800">{waitlistSuccess.message}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-semibold text-amber-900">
                            {selectedSlot} is fully booked
                          </p>
                          <p className="text-sm text-amber-800">
                            Join the waitlist and we’ll notify you if someone cancels.
                            {getWaitlistCountForSlot(selectedSlot) > 0 &&
                              ` ${getWaitlistCountForSlot(selectedSlot)} already waiting.`}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isWaitlistSubmitting}
                          onClick={handleJoinWaitlist}
                          className="cursor-pointer rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-800 disabled:opacity-60"
                        >
                          {isWaitlistSubmitting ? 'Joining…' : 'Join the waitlist'}
                        </button>
                      </>
                    )}

                    <DemoTools>
                      <button
                        type="button"
                        onClick={handleSimulateCancellation}
                        className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Siren className="mr-1 inline h-3 w-3" />
                        Simulate a cancellation
                      </button>
                    </DemoTools>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Patient.
              With VITE_BOOKING_USE_LOGGED_IN_PATIENT on, a signed-in patient
              books for themselves, so the picker and the name / age / mobile
              fields give way to a read-only confirmation of who is booking.
              Front desk and admin never hit this branch — `currentUser` is not
              passed to their booking screens — so they keep the full picker. */}
          {lockedPatient ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {/* <h3 className="text-base font-semibold text-slate-900">Who is this appointment for?</h3> */}
              <h3 className="text-base font-semibold text-slate-900">Patient</h3>
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white">
                  {lockedPatient.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{lockedPatient.name}</p>
                  <p className="truncate text-sm text-slate-500">
                    {lockedPatient.age} yrs · {lockedPatient.gender} · {lockedPatient.contact}
                  </p>
                </div>
              </div>
            </section>
          ) : (
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div>
              {/* <h3 className="text-base font-semibold text-slate-900">Who is this appointment for?</h3> */}
              <h3 className="text-base font-semibold text-slate-900">Patient</h3>
              <p className="text-sm text-slate-500">Pick a saved profile, or add someone new.</p>
            </div>

            <Field label="Patient">
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
              >
                <option value="new">Someone new</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.age} yrs
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Full name">
              <input
                type="text"
                placeholder="e.g. Aarav Patel"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Age">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 34"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </Field>

              <Field label="Mobile number">
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="e.g. +91 98201 45678"
                  value={patientContact}
                  onChange={(e) => setPatientContact(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </Field>
            </div>
          </section>
          )}

          <StepBar
            back={{ label: 'Back', onClick: () => setCurrentStep(1) }}
            summary={
              selectedSlot ? (
                <span className="text-sm text-slate-600">
                  <strong className="font-semibold text-slate-900">{friendlyDate(selectedDate)}</strong> at{' '}
                  <strong className="font-mono font-semibold text-slate-900">{selectedSlot}</strong>
                </span>
              ) : (
                <span className="text-sm text-slate-500">Choose a time to continue</span>
              )
            }
            next={{ label: 'Continue', onClick: goToStep3 }}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 3 — REVIEW & PAY                                             */}
      {/* ================================================================ */}
      {currentStep === 3 && selectedDoctor && (
        <div className="space-y-5">
          {/* ----------------------------------------------------------------
              Appointment preview.
              The last screen before money changes hands, so it shows the two
              faces involved, the exact chamber on a map, the slot, and the one
              amount payable — everything a patient would otherwise have to
              step back through to check.
             ---------------------------------------------------------------- */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Tinted header band. This is the last screen before money changes
                hands, so the "check this" instruction is lifted off the white
                card rather than reading as one more section heading. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 p-5">
              <div>
                <h3 className="text-base font-semibold text-indigo-950">Review your appointment</h3>
                <p className="text-sm text-indigo-900/70">
                  Please check every detail before paying the ₹{PLATFORM_FEE} booking fee.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="cursor-pointer rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-900 transition-colors hover:bg-indigo-100"
              >
                Edit details
              </button>
            </div>

            {/* Who is meeting whom */}
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="space-y-3 p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Doctor
                </p>
                <div className="flex gap-3">
                  <DoctorPortrait doctor={selectedDoctor} className="h-20 w-20" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-slate-900">{selectedDoctor.name}</p>
                    <p className="text-sm text-indigo-700">{selectedDoctor.specialty}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {selectedDoctor.rating}
                      </span>
                      {selectedDoctor.experienceYears && <span>{selectedDoctor.experienceYears} yrs exp.</span>}
                    </p>
                    {selectedDoctor.clinicPhone && (
                      <p className="text-[13px] text-slate-500">{selectedDoctor.clinicPhone}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <User className="h-3.5 w-3.5" />
                  Patient
                </p>
                <div className="flex gap-3">
                  <PatientAvatar
                    name={patientName}
                    image={selectedPatientRecord?.image}
                    className="h-20 w-20"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-slate-900">{patientName || 'Patient name missing'}</p>
                    <p className="text-sm text-slate-600">
                      {[patientAge && `${patientAge} yrs`, selectedPatientRecord?.gender]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="text-[13px] text-slate-500">{patientContact}</p>
                    {selectedPatientRecord?.bloodGroup && (
                      <p className="text-[13px] text-slate-500">
                        Blood group {selectedPatientRecord.bloodGroup}
                      </p>
                    )}
                    {selectedPatientRecord?.abhaId && (
                      <p className="font-mono text-[13px] text-slate-500">
                        ABHA {selectedPatientRecord.abhaId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* When & how */}
            <div className="grid gap-4 border-t border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Date
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">{friendlyDate(selectedDate)}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <Clock className="h-3.5 w-3.5" />
                  Time
                </p>
                <p className="mt-0.5 font-mono font-semibold text-slate-900">{selectedSlot}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  {apptType === 'video' ? <Video className="h-3.5 w-3.5" /> : <Building className="h-3.5 w-3.5" />}
                  Consultation
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {apptType === 'video' ? 'Video call' : 'Hospital visit (OPD)'}
                </p>
              </div>
            </div>

            {/* Clinic / Hospital */}
            {apptType === 'visiting' ? (
              <div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-[minmax(0,1fr)_220px]">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <MapPin className="h-3.5 w-3.5" />
                    Clinic/Hospital
                  </p>
                  <ClinicAddress doctor={selectedDoctor} />
                  <p className="text-[13px] text-slate-500">
                    Check the pin before you pay — this consultant may hold OPD at more than one address
                    in {selectedDoctor.district || 'the city'}.
                  </p>
                </div>
                <DoctorLocationMap doctor={selectedDoctor} height={128} />
              </div>
            ) : (
              <div className="flex items-start gap-2.5 border-t border-slate-100 p-5">
                <Video className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-sm text-slate-600">
                  A joining link will be sent to <strong className="font-medium text-slate-800">{patientContact}</strong> shortly
                  before your slot. No travel needed.
                </p>
              </div>
            )}

            {/* What it costs */}
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Booking fee — payable now</span>
                <span className="font-mono text-lg font-semibold text-slate-900">₹{PLATFORM_FEE}</span>
              </div>
              <p className="text-sm text-slate-600">
                {DOCTOR_FEE_NOTE} reception on the day of your visit.
                {isRevisit && ' A follow-up discount will be applied there.'}
              </p>
            </div>
          </section>

          {/* Optional extras */}
          <details className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
              <span>
                <span className="block text-base font-semibold text-slate-900">
                  Add reports or notes
                  <span className="ml-2 text-sm font-normal text-slate-400">Optional</span>
                </span>
                <span className="block text-sm text-slate-500">
                  {extrasCount > 0
                    ? `${extrasCount} item${extrasCount > 1 ? 's' : ''} added`
                    : 'Follow-up discount, test reports, symptoms'}
                </span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>

            <div className="space-y-6 border-t border-slate-100 p-5">
              {/* Follow-up */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isRevisit}
                    onChange={(e) => setIsRevisit(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      This is a follow-up visit
                    </span>
                    <span className="block text-sm text-slate-500">
                      A follow-up discount is applied to the doctor’s fee when you pay at the clinic
                    </span>
                  </span>
                </label>

                {isRevisit && (
                  <Field label="Previous booking ID (optional)">
                    <input
                      type="text"
                      placeholder="e.g. BK-NXG-104932"
                      value={previousBookingId}
                      onChange={(e) => setPreviousBookingId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                    />
                  </Field>
                )}
              </div>

              {/* Uploads */}
              <div className="grid gap-4 sm:grid-cols-2">
                <UploadBox
                  title="Test reports"
                  hint="PDF, JPG or PNG"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  files={uploadedReports}
                  onUpload={(e) => handleFileUpload(e, 'report')}
                  onRemove={(id) => removeDoc(id, 'report')}
                />
                <UploadBox
                  title="Past prescriptions"
                  hint="PDF, JPG or PNG"
                  accept=".pdf,.jpg,.jpeg,.png"
                  files={uploadedPrescriptions}
                  onUpload={(e) => handleFileUpload(e, 'prescription')}
                  onRemove={(id) => removeDoc(id, 'prescription')}
                />
              </div>

              <DemoTools>
                <button
                  type="button"
                  onClick={addDemoReport}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add sample report
                </button>
                <button
                  type="button"
                  onClick={addDemoPrescription}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add sample prescription
                </button>
              </DemoTools>

              {/* Symptoms */}
              <Field label="What brings you in? (optional)">
                <textarea
                  rows={3}
                  placeholder="e.g. Mild chest tightness while walking, for the past 3 days."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
                />
              </Field>

              {/* Urgency */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">How urgent is it?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    { id: 'routine', label: 'Routine', hint: 'Standard slot timing' },
                    { id: 'high', label: 'Urgent', hint: 'Acute pain or fever' },
                    { id: 'critical', label: 'Emergency', hint: 'Alerts the triage desk' },
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setUrgencyLevel(opt.id)}
                      aria-pressed={urgencyLevel === opt.id}
                      className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                        urgencyLevel === opt.id
                          ? 'border-indigo-600 bg-indigo-50/40'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className="block text-sm font-medium text-slate-900">{opt.label}</span>
                      <span className="block text-[13px] text-slate-500">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>

          {/* Payment */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">How would you like to pay the ₹50?</h3>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                { id: 'upi', label: 'UPI', icon: QrCode },
                { id: 'card', label: 'Card', icon: CreditCard },
                { id: 'netbanking', label: 'Net banking', icon: Building2 },
                { id: 'counter', label: 'At the counter', icon: Building },
              ] as const).map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    aria-pressed={paymentMethod === opt.id}
                    className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
                      paymentMethod === opt.id
                        ? 'border-indigo-600 bg-indigo-50/40'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              {paymentMethod === 'upi' && (
                <Field label="Your UPI ID">
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500"
                  />
                  <p className="text-[13px] text-slate-500">Works with GPay, PhonePe, Paytm and BHIM.</p>
                </Field>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-4">
                  <Field label="Card number">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Expiry">
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500"
                      />
                    </Field>
                    <Field label="CVV">
                      <input
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {paymentMethod === 'netbanking' && (
                <Field label="Your bank">
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                  >
                    <option>State Bank of India</option>
                    <option>HDFC Bank</option>
                    <option>ICICI Bank</option>
                    <option>Axis Bank</option>
                    <option>Kotak Mahindra Bank</option>
                  </select>
                </Field>
              )}

              {paymentMethod === 'counter' && (
                <p className="text-sm text-slate-600">
                  Your slot is held straight away. Please pay the ₹50 booking fee at the OPD reception when
                  you arrive — quote your booking number.
                </p>
              )}
            </div>

            {/* What you pay — the ₹50 slot fee is the only amount this app
                ever quotes; the consultation fee is a clinic-desk matter. */}
            <div className="space-y-2 rounded-lg border border-slate-200 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-600">Booking fee — pay now</span>
                <span className="font-mono text-lg font-semibold text-slate-900">₹50</span>
              </div>
              <p className="border-t border-slate-100 pt-2 text-sm text-slate-600">
                The doctor’s fee is paid at the clinic reception on the day of your visit.
                {isRevisit && (
                  <span className="text-emerald-700"> A follow-up discount will be applied there.</span>
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleFinalPaymentSubmit}
              className="w-full cursor-pointer rounded-lg bg-indigo-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Confirming your slot…' : 'Pay ₹50 and confirm booking'}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[13px] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secure payment · Free cancellation up to 2 hours before
            </p>
          </section>

          <StepBar back={{ label: 'Back', onClick: () => setCurrentStep(2) }} />
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 4 — CONFIRMED                                                */}
      {/* ================================================================ */}
      {currentStep === 4 && bookingSuccess && (
        <div className="space-y-5">
          {/* Confirmation */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="h-6 w-6" />
            </span>
            <h3 className="font-serif text-xl font-semibold text-emerald-950">Your appointment is booked</h3>
            <p className="mt-1 text-sm text-emerald-800">
              {selectedDoctor?.name} · {friendlyDate(bookingSuccess.date)} at {bookingSuccess.timeSlot}
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                <span className="text-slate-500">Booking ID</span>
                <span className="font-mono font-semibold text-slate-900">{bookingSuccess.bookingNo}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(bookingSuccess.bookingNo || '');
                    setCopiedBookingNo(true);
                    setTimeout(() => setCopiedBookingNo(false), 2000);
                  }}
                  title="Copy booking ID"
                  aria-label="Copy booking ID"
                  className="cursor-pointer text-slate-400 hover:text-slate-700"
                >
                  {copiedBookingNo ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </span>

              {bookingSuccess.tokenNo && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm">
                  <span className="text-slate-500">Token</span>
                  <span className="font-mono font-semibold text-slate-900">{bookingSuccess.tokenNo}</span>
                </span>
              )}
            </div>

            <p className="mt-4 text-sm text-emerald-800">
              Please arrive 15 minutes early. The doctor’s fee is paid at the clinic reception.
            </p>
          </div>

          {/* Test notification toast */}
          {testNotification && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{testNotification.title}</p>
                  <p className="text-sm text-slate-600">{testNotification.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestNotification(null)}
                aria-label="Dismiss"
                className="cursor-pointer text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Getting there — a booked patient's next question is "where exactly?",
              and with same-named consultants at several chambers the answer has
              to be the specific address they booked, not the doctor's name. */}
          {selectedDoctor && bookingSuccess.type !== 'video' && (
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Getting there</h3>
                  <p className="text-sm text-slate-500">
                    Reach 15 minutes early and report to the OPD desk with your booking ID.
                  </p>
                </div>
                <a
                  href={buildDirectionsLink(selectedDoctor)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Navigation className="h-4 w-4" />
                  Get directions
                </a>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
                <ClinicAddress doctor={selectedDoctor} />
                <DoctorLocationMap doctor={selectedDoctor} height={140} />
              </div>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {/* Reminders */}
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Reminders</h3>
                  <p className="text-sm text-slate-500">We’ll nudge you before your visit</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300"
                  />
                  On
                </label>
              </div>

              {reminderEnabled ? (
                <div className="space-y-4">
                  <Field label="Remind me">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: '1_hour', label: '1 hour before' },
                        { id: '3_hours', label: '3 hours before' },
                        { id: '12_hours', label: '12 hours before' },
                        { id: '1_day', label: 'A day before' },
                      ] as const).map(freq => (
                        <button
                          key={freq.id}
                          type="button"
                          onClick={() => setReminderFrequency(freq.id)}
                          aria-pressed={reminderFrequency === freq.id}
                          className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                            reminderFrequency === freq.id
                              ? 'border-indigo-600 bg-indigo-50/40 font-medium text-slate-900'
                              : 'border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {freq.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Send it by">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {([
                        { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                        { id: 'sms', label: 'SMS', icon: Smartphone },
                        { id: 'email', label: 'Email', icon: Mail },
                        { id: 'push', label: 'App', icon: Zap },
                      ] as const).map(mode => {
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setReminderMode(mode.id)}
                            aria-pressed={reminderMode === mode.id}
                            className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition-colors ${
                              reminderMode === mode.id
                                ? 'border-indigo-600 bg-indigo-50/40 font-medium text-slate-900'
                                : 'border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {mode.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <DemoTools>
                    <button
                      type="button"
                      onClick={() => {
                        const modeTitle = reminderMode === 'whatsapp' ? 'WhatsApp reminder' : reminderMode === 'sms' ? 'SMS alert' : reminderMode === 'email' ? 'Email reminder' : 'App notification';
                        setTestNotification({
                          type: 'reminder',
                          title: modeTitle,
                          message: `Your appointment with ${selectedDoctor?.name} is on ${friendlyDate(bookingSuccess.date)} at ${bookingSuccess.timeSlot}. Please arrive 15 minutes early.`,
                          timestamp: 'Just now'
                        });
                      }}
                      className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Send className="mr-1 inline h-3 w-3" />
                      Send a test reminder
                    </button>
                  </DemoTools>
                </div>
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  Reminders are off for this booking.
                </p>
              )}
            </section>

            {/* Doctor status */}
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">On the day</h3>
                <p className="text-sm text-slate-500">We’ll tell you if the doctor is running late</p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium ${
                    doctorLiveStatus === 'on_time'
                      ? 'bg-emerald-100 text-emerald-800'
                      : doctorLiveStatus === 'unavailable_emergency'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      doctorLiveStatus === 'on_time'
                        ? 'bg-emerald-600'
                        : doctorLiveStatus === 'unavailable_emergency'
                        ? 'bg-rose-600'
                        : 'bg-amber-600'
                    }`}
                  />
                  {doctorLiveStatus === 'on_time' && 'Running on time'}
                  {doctorLiveStatus === 'delayed_20m' && '20 minutes behind'}
                  {doctorLiveStatus === 'delayed_45m' && '45 minutes behind'}
                  {doctorLiveStatus === 'unavailable_emergency' && 'Called to emergency duty'}
                </span>

                <p className="mt-2 text-sm text-slate-700">
                  {doctorLiveStatus === 'on_time' && `${selectedDoctor?.name} is on schedule in OPD Room 204.`}
                  {doctorLiveStatus === 'delayed_20m' && `${selectedDoctor?.name} is about 20 minutes behind after an emergency review.`}
                  {doctorLiveStatus === 'delayed_45m' && `${selectedDoctor?.name} is about 45 minutes behind due to emergency surgery.`}
                  {doctorLiveStatus === 'unavailable_emergency' && `${selectedDoctor?.name} has been called to emergency surgery. Our desk will call you to rearrange, free of charge.`}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={delayAlertsEnabled}
                  onChange={(e) => setDelayAlertsEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">Alert me about delays</span>
                  <span className="block text-sm text-slate-500">If the wait goes over 15 minutes</span>
                </span>
              </label>

              <DemoTools>
                <button
                  type="button"
                  onClick={() => {
                    setDoctorLiveStatus('delayed_20m');
                    setTestNotification({
                      type: 'delay',
                      title: 'Delay alert',
                      message: `${selectedDoctor?.name} is running about 20 minutes late for your ${bookingSuccess.timeSlot} slot. Please adjust your arrival.`,
                      timestamp: 'Just now'
                    });
                  }}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Simulate a delay
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDoctorLiveStatus('unavailable_emergency');
                    setTestNotification({
                      type: 'unavailable',
                      title: 'Doctor unavailable',
                      message: `${selectedDoctor?.name} has been called to emergency surgery. Reschedule or switch to an associate specialist free of charge.`,
                      timestamp: 'Just now'
                    });
                  }}
                  className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Simulate unavailability
                </button>
              </DemoTools>
            </section>
          </div>

          {/* Receipt */}
          <div id="printable-invoice" className="print-target space-y-5 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-indigo-700" />
                  <h3 className="font-serif text-base font-semibold text-slate-900">
                    neXgen Multispecialty Healthcare
                  </h3>
                </div>
                <p className="mt-1 text-[13px] text-slate-500">
                  Sadar Hospital Road, Zila School Chowk, Line Bazar, Purnea, Bihar — 854301 · GSTIN
                  10AABCN9102K1Z
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Tax invoice</p>
                <p className="font-mono text-sm font-medium text-slate-900">INV-{bookingSuccess.bookingNo}</p>
                <p className="text-[13px] text-slate-500">
                  {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="grid gap-5 border-b border-slate-200 pb-5 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">Doctor</p>
                <p className="font-medium text-slate-900">{selectedDoctor?.name}</p>
                <p className="text-sm text-slate-600">{selectedDoctor?.specialty}</p>
                <p className="text-sm text-slate-500">{selectedDoctor?.hospital}</p>
                {selectedDoctor && (
                  <p className="text-[13px] text-slate-500">{formatFullAddress(selectedDoctor)}</p>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Patient &amp; schedule
                </p>
                <p className="font-medium text-slate-900">
                  {bookingSuccess.patientName} · {bookingSuccess.patientAge} yrs
                </p>
                <p className="text-sm text-slate-600">{bookingSuccess.patientContact}</p>
                <p className="text-sm text-slate-600">
                  {friendlyDate(bookingSuccess.date)} at {bookingSuccess.timeSlot} ·{' '}
                  {bookingSuccess.type === 'video' ? 'Video call' : 'Hospital visit'}
                </p>
              </div>
            </div>

            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* This invoice covers the online slot reservation only. The
                    consultation fee is billed separately by the clinic and is
                    deliberately absent — not even as a zero line. */}
                <tr>
                  <td className="py-2.5">Online slot booking fee</td>
                  <td className="py-2.5 text-right font-mono">₹{bookingFee}</td>
                </tr>
                <tr>
                  <td className="py-2.5">GST</td>
                  <td className="py-2.5 text-right font-mono">₹{taxAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                  <td className="py-2.5">Paid online today</td>
                  <td className="py-2.5 text-right font-mono">₹{totalAmount.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <p className="border-t border-slate-200 pt-4 text-[13px] text-slate-500">
              Paid by {bookingSuccess.paymentMethod || 'UPI'}. Thank you for booking with neXgen Healthcare —
              please arrive 15 minutes before your slot.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Print invoice
            </button>

            {onCloseModal ? (
              <button
                type="button"
                onClick={onCloseModal}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Check className="h-4 w-4" />
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResetBooking}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Book another appointment
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Small building blocks
   ========================================================================== */

/**
 * Doctor portrait with a graceful fallback. The photo is now the largest thing
 * on a result card, so a dead image URL would leave a broken-image icon where
 * the doctor's face should be — initials read as intentional, that doesn't.
 */
function DoctorPortrait({ doctor, className = '' }: { doctor: Doctor; className?: string }) {
  const [failed, setFailed] = useState(false);

  // An empty `image` has to be caught up front: <img src=""> resolves against
  // the page URL, so it can fail without ever firing onError — leaving exactly
  // the broken-image icon this fallback exists to prevent. Records with no
  // photograph on file are normal, not an error.
  if (failed || !doctor.image?.trim()) {
    const initials = doctor.name
      .replace(/^Dr\.?\s*/i, '')
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase();

    return (
      <div
        role="img"
        aria-label={doctor.name}
        className={`flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl font-semibold text-indigo-700 ring-1 ring-slate-200 ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={doctor.image}
      alt={doctor.name}
      loading="lazy"
      onError={() => setFailed(true)}
      // object-top keeps the face in frame when a portrait is cropped square.
      className={`shrink-0 rounded-xl bg-slate-100 object-cover object-top ring-1 ring-slate-200 ${className}`}
    />
  );
}

/**
 * Patient portrait for the preview. Most patient records carry no photograph,
 * so initials on a tinted disc are the normal case rather than the fallback —
 * it keeps the doctor/patient pair visually symmetrical either way.
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
      className={`flex shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl font-semibold text-emerald-700 ring-1 ring-slate-200 ${className}`}
    >
      {initials}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

/**
 * Sticky footer for each step. Keeping the primary action pinned means a patient
 * on a phone never has to scroll back up to move forward.
 */
function StepBar({
  back,
  summary,
  next,
}: {
  back?: { label: string; onClick: () => void };
  summary?: React.ReactNode;
  next?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-canvas px-5 py-3 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.25)]">
      <div className="flex items-center gap-3">
        {back && (
          <button
            type="button"
            onClick={back.onClick}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {back.label}
          </button>
        )}
        {summary}
      </div>

      {next && (
        <button
          type="button"
          onClick={next.onClick}
          disabled={next.disabled}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {next.label}
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Simulation controls are useful for demos but must never read as real patient
 * actions, so they live behind a closed disclosure.
 */
function DemoTools({ children }: { children: React.ReactNode }) {
  return (
    <details className="border-t border-slate-200 pt-3">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 py-1.5 text-xs text-slate-400 hover:text-slate-600">
        <Info className="h-3 w-3" />
        Demo tools
      </summary>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </details>
  );
}

function UploadBox({
  title,
  hint,
  accept,
  files,
  onUpload,
  onRemove,
}: {
  title: string;
  hint: string;
  accept: string;
  files: UploadedDoc[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{title}</p>

      <label className="block cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/30">
        <input type="file" multiple accept={accept} onChange={onUpload} className="hidden" />
        <Upload className="mx-auto mb-1 h-5 w-5 text-slate-400" />
        <span className="block text-sm text-slate-700">Choose files</span>
        <span className="block text-[13px] text-slate-400">{hint}</span>
      </label>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map(file => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate text-[13px] text-slate-700">{file.name}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 cursor-pointer text-slate-400 hover:text-rose-600"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
