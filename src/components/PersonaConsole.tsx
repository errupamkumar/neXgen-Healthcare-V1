/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  User, 
  UserPlus,
  Activity, 
  Plus, 
  Check, 
  Trash2, 
  FileText, 
  Upload, 
  AlertTriangle, 
  TrendingUp, 
  DollarSign, 
  Settings, 
  Star, 
  Printer, 
  CreditCard, 
  Clock, 
  ShieldAlert, 
  Sliders, 
  RefreshCw, 
  CheckCircle,
  Stethoscope,
  Building,
  Heart,
  PlusCircle,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  Calendar,
  Video,
  Eye,
  BriefcaseMedical,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Bell,
  CalendarCheck,
  Smartphone,
  Send,
  Mail
} from 'lucide-react';
import { Doctor, PatientHistory, MedicalDocument, Appointment, HospitalConfig, LoggedInUser } from '../types';
import { patientPortalConfig } from '../config';
import { fileToAvatarDataUrl } from '../lib/image';

/**
 * Profile picture control, shared by the patient, doctor and onboarding forms.
 *
 * The picked file is downscaled to a data URL before it ever reaches state —
 * see src/lib/image.ts for why a raw upload would be a problem here.
 */
function AvatarPicker({
  name,
  image,
  onChange,
  label = 'Profile picture',
}: {
  name: string;
  image?: string;
  onChange: (dataUrl: string) => void;
  label?: string;
}) {
  const [error, setError] = useState<string>('');
  const [isReading, setIsReading] = useState<boolean>(false);

  const initials =
    (name || '')
      .replace(/^Dr\.?\s*/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || '?';

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear immediately so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!file) return;

    setError('');
    setIsReading(true);
    try {
      onChange(await fileToAvatarDataUrl(file));
    } catch (err: any) {
      setError(err?.message || 'Could not read that image.');
    } finally {
      setIsReading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-bold text-slate-500 uppercase block">{label}</span>
      <div className="flex items-center gap-3">
        {image ? (
          <img src={image} alt={name} className="h-16 w-16 rounded-2xl object-cover border border-slate-200 shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-lg shrink-0">
            {initials}
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" />
              {isReading ? 'Reading…' : image ? 'Change picture' : 'Upload picture'}
              <input type="file" accept="image/*" onChange={handlePick} className="hidden" />
            </label>

            {image && (
              <button
                type="button"
                onClick={() => { setError(''); onChange(''); }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium">
            JPG, PNG or WebP. Cropped square and resized automatically.
          </p>
          {error && <p className="text-[10px] font-bold text-rose-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
import { PLATFORM_FEE, DOCTOR_FEE_NOTE } from '../lib/pricing';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DoctorFilterBar, { DoctorFilterState, filterDoctors } from './DoctorFilterBar';
import DoctorBooking from './DoctorBooking';
import ConsultationHistory from './ConsultationHistory';
import { isUpcomingAppointment, byStartTimeAscending } from '../lib/appointments';

/**
 * Which slice of the console to render.
 *
 * 'full'     — the original combined portal (inner tab bar visible). Still used
 *              by the doctor / hospital / admin personas.
 * 'profile'  — profile details only. Backs the renamed "Profile" rail entry.
 * 'upcoming' — the dedicated "Upcoming Appointment" page.
 * 'history'  — the dedicated "Appointment History" page.
 *
 * The sliced modes exist so the patient's three inner tabs could be promoted to
 * first-class rail destinations without duplicating the shared modals (payment,
 * receipt, feedback, reminder) that live at the bottom of this component.
 */
export type ConsoleView = 'full' | 'profile' | 'upcoming' | 'history';

/**
 * How many upcoming appointments the dedicated "Upcoming Appointment" page
 * renders. The page is built to hold every upcoming appointment — this cap is
 * only the "keep it to one for now" product decision. Raise it (or set it to
 * Number.POSITIVE_INFINITY) to show the full list.
 */
const UPCOMING_VISIBLE_LIMIT = 1;

/** "03:00 PM" -> 900. Used to order upcoming appointments within a day. */
const minutesOfDay = (timeSlot: string): number => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((timeSlot || '').trim());
  if (!match) return 0;
  let hour = Number(match[1]) % 12;
  if (match[3]?.toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
};

interface PersonaConsoleProps {
  doctors: Doctor[];
  patients: PatientHistory[];
  documents: MedicalDocument[];
  appointments: Appointment[];
  loadAllData: () => Promise<void>;
  onJoinVideo: (appt: Appointment) => void;
  onCancelAppointment: (id: string) => void;
  onBookAppointment: (data: any) => Promise<any>;
  onSavePatient: (data: any) => Promise<any>;
  onUploadDocument: (data: any) => Promise<any>;
  onAnalyzeDocument: (id: string) => Promise<any>;
  currentUser?: LoggedInUser | null;
  /** Slice of the console to render. Defaults to the original combined portal. */
  view?: ConsoleView;
  /** Lets the shell jump to the dedicated Appointment History page. */
  onOpenHistory?: () => void;
}

export default function PersonaConsole({
  doctors,
  patients,
  documents,
  appointments,
  loadAllData,
  onJoinVideo,
  onCancelAppointment,
  onBookAppointment,
  onSavePatient,
  onUploadDocument,
  onAnalyzeDocument,
  currentUser,
  view = 'full',
  onOpenHistory,
}: PersonaConsoleProps) {
  // Current Persona: 'doctor' | 'patient' | 'hospital' | 'admin'
  const [activePersona, setActivePersona] = useState<'doctor' | 'patient' | 'hospital' | 'admin'>('patient');
  
  // Specific role IDs
  const [activeDoctorId, setActiveDoctorId] = useState<string>('doc-1');
  const [activePatientId, setActivePatientId] = useState<string>('pat-1');

  // Sync state with logged in user if any
  useEffect(() => {
    if (currentUser) {
      setActivePersona(currentUser.role);
      if (currentUser.role === 'patient') {
        setActivePatientId(currentUser.id);
      } else if (currentUser.role === 'doctor') {
        setActiveDoctorId(currentUser.id);
      }
    }
  }, [currentUser, patients, doctors]);

  // Hospital Configuration State (Local Sync with Backend)
  const [hospitalConfig, setHospitalConfig] = useState<HospitalConfig>({
    name: "neXgen Multispecialty Healthcare Institute, New Delhi",
    address: "Plot 12, Sector 18, Dwarka, New Delhi - 110075",
    taxRate: 18.0,
    contactNumber: "+91 11 4567 8900",
    enableSms: true,
    enableTelehealth: true
  });

  // Analytics Stats from backend
  const [stats, setStats] = useState<any>({
    totalRevenue: 0,
    totalAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    scheduledAppointments: 0,
    totalDoctors: 0,
    activeDoctors: 0,
    totalPatients: 0,
    specialtyDistribution: {},
    revenueByDate: [],
    appointmentsByDate: []
  });

  /**
   * Money the clinic actually collected through this app: the ₹50 platform fee
   * on each settled booking. Derived here rather than taken from the server's
   * revenue figures, which are built from consultation fees — a number that must
   * not reach any screen.
   */
  const platformFeeCollected = useMemo(
    // Refunded bookings gave the ₹50 back, so they are not money collected.
    () => appointments.filter(a => a.feePaid && !a.refundStatus).length * PLATFORM_FEE,
    [appointments]
  );

  /** The same money, bucketed by booking date, for the inflow chart. */
  const platformFeeByDate = useMemo(() => {
    const byDate = new Map<string, number>();
    appointments
      .filter(a => a.feePaid && !a.refundStatus)
      .forEach(a => byDate.set(a.date, (byDate.get(a.date) ?? 0) + PLATFORM_FEE));
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));
  }, [appointments]);

  /**
   * Completed consultations and bookings per day, derived from the loaded
   * appointments. The workspace used to read `stats.completedAppointments` and
   * `stats.appointmentsByDate`, neither of which /api/hospital/stats returns,
   * so the "Completed care" tile was blank and the capacity chart empty.
   */
  const completedCount = useMemo(
    () => appointments.filter(a => a.status === 'completed').length,
    [appointments]
  );
  const appointmentsByDate = useMemo(() => {
    const byDate = new Map<string, number>();
    appointments
      .filter(a => a.status !== 'cancelled')
      .forEach(a => byDate.set(a.date, (byDate.get(a.date) ?? 0) + 1));
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [appointments]);

  // UI state managers
  const [patientTab, setPatientTab] = useState<'upcoming' | 'profiles' | 'history'>('upcoming');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'scheduled' | 'cancelled'>('all');

  /**
   * When the console is mounted as a dedicated page the rail — not the inner tab
   * bar — decides which patient section is on screen, so the local `patientTab`
   * state is overridden. 'full' keeps the original tabbed behaviour.
   */
  const isSlicedView = view !== 'full';
  const effectivePatientTab =
    view === 'upcoming' ? 'upcoming' : view === 'history' ? 'history' : view === 'profile' ? 'profiles' : patientTab;

  /* ---------------------------------------------------------------------
     Single-profile policy — see VITE_SINGLE_PATIENT_PROFILE in .env.example.
     --------------------------------------------------------------------- */

  /**
   * A patient signed in with the flag on owns exactly one record, so the family
   * switchers are withdrawn. Staff personas are never locked: the front desk
   * genuinely does work across the whole patient directory.
   */
  const lockPatientToSelf = patientPortalConfig.singleProfile && currentUser?.role === 'patient';

  /**
   * Registration is withdrawn from the patient persona whenever the flag is on,
   * signed in or not — a patient portal restricted to one profile must not offer
   * a way to mint more.
   */
  const canRegisterPatientProfile = !(patientPortalConfig.singleProfile && activePersona === 'patient');

  /**
   * The profiles the patient persona may browse. Filtering on `activePatientId`
   * rather than `currentUser.id` keeps whatever the sync effect already chose,
   * so the <select> value can never fall outside its own option list.
   */
  const ownPatientProfile = patients.filter(p => p.id === activePatientId);
  const selectablePatients = lockPatientToSelf && ownPatientProfile.length > 0 ? ownPatientProfile : patients;

  /* ---------------------------------------------------------------------
     Profile completion — a self-registered patient arrives with only a name
     and a mobile number, so the Profile page has to be where the rest gets
     filled in.
     --------------------------------------------------------------------- */
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [profileForm, setProfileForm] = useState({
    name: '', email: '', age: '' as number | '', gender: '', contact: '',
    bloodGroup: '', address: '', emergencyContact: '', image: '',
    allergiesRaw: '', medicationsRaw: '', medicalConditionsRaw: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  /** Load the active record into the form and open it. */
  const handleOpenProfileEditor = () => {
    const p = patients.find(pat => pat.id === activePatientId);
    if (!p) return;
    setProfileForm({
      name: p.name || '',
      email: p.email || '',
      // 0 is the "not stated yet" the server writes for a fresh registration;
      // an empty box invites the real number rather than an edit of "0".
      age: p.age ? p.age : '',
      gender: p.gender || '',
      contact: p.contact || '',
      bloodGroup: p.bloodGroup || '',
      address: p.address || '',
      emergencyContact: p.emergencyContact || '',
      image: p.image || '',
      allergiesRaw: (p.allergies || []).join(', '),
      medicationsRaw: (p.medications || []).join(', '),
      medicalConditionsRaw: (p.medicalConditions || []).join(', '),
    });
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = patients.find(pat => pat.id === activePatientId);
    if (!p) return;

    const toList = (raw: string) => raw.split(',').map(s => s.trim()).filter(Boolean);

    setIsSavingProfile(true);
    try {
      const saved = await onSavePatient({
        id: p.id,
        name: profileForm.name.trim() || p.name,
        email: profileForm.email.trim(),
        age: profileForm.age === '' ? 0 : Number(profileForm.age),
        gender: profileForm.gender,
        contact: profileForm.contact.trim(),
        bloodGroup: profileForm.bloodGroup.trim(),
        address: profileForm.address.trim(),
        emergencyContact: profileForm.emergencyContact.trim(),
        image: profileForm.image,
        allergies: toList(profileForm.allergiesRaw),
        medications: toList(profileForm.medicationsRaw),
        medicalConditions: toList(profileForm.medicalConditionsRaw),
        // Case notes belong to the clinicians who wrote them — a patient
        // editing their own profile must not overwrite that record.
        notes: p.notes || '',
      });
      if (saved) setIsEditingProfile(false);
    } finally {
      setIsSavingProfile(false);
    }
  };

  /* ---------------------------------------------------------------------
     Doctor profile editing — a consultant maintains their own practice
     details and photograph from their Profile page.
     --------------------------------------------------------------------- */
  const [isEditingDoctor, setIsEditingDoctor] = useState<boolean>(false);
  const [isSavingDoctor, setIsSavingDoctor] = useState<boolean>(false);
  const [doctorForm, setDoctorForm] = useState({
    name: '', specialty: '', department: '', bio: '', image: '',
    hospital: '', addressLine: '', area: '', landmark: '', district: '', state: '', pincode: '',
    clinicPhone: '', experienceYears: '' as number | '',
    maxSchedulesPerSlot: 3, videoEnabled: true, isActive: true,
    slotsRaw: '',
  });

  const handleOpenDoctorEditor = (doc: Doctor) => {
    setDoctorForm({
      name: doc.name || '',
      specialty: doc.specialty || '',
      department: doc.department || '',
      bio: doc.bio || '',
      image: doc.image || '',
      hospital: doc.hospital || '',
      addressLine: doc.addressLine || '',
      area: doc.area || '',
      landmark: doc.landmark || '',
      district: doc.district || '',
      state: doc.state || '',
      pincode: doc.pincode || '',
      clinicPhone: doc.clinicPhone || '',
      experienceYears: doc.experienceYears ?? '',
      maxSchedulesPerSlot: doc.maxSchedulesPerSlot || 3,
      videoEnabled: doc.videoEnabled !== false,
      isActive: doc.isActive !== false,
      slotsRaw: (doc.slots || []).join(', '),
    });
    setIsEditingDoctor(true);
  };

  const handleSaveDoctorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDoctor(true);
    try {
      const res = await fetch(`/api/doctors/${activeDoctorId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...doctorForm,
          // The endpoint treats '' as "clear this", which is what an emptied
          // number box should mean.
          experienceYears: doctorForm.experienceYears,
          slots: doctorForm.slotsRaw.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        await loadAllData();
        setIsEditingDoctor(false);
      }
    } catch (err) {
      console.error('Error saving doctor profile:', err);
    } finally {
      setIsSavingDoctor(false);
    }
  };

  /** What a freshly registered profile is still missing. */
  const activePatientRecord = patients.find(p => p.id === activePatientId);
  const missingProfileFields = activePatientRecord
    ? ([
        !activePatientRecord.age && 'age',
        !activePatientRecord.gender && 'gender',
        !activePatientRecord.email && 'email',
        !activePatientRecord.bloodGroup && 'blood group',
        !activePatientRecord.address && 'address',
      ].filter(Boolean) as string[])
    : [];

  // Patient Reminders state (keyed by appointment id)
  const [patientReminders, setPatientReminders] = useState<Record<string, {
    enabled: boolean;
    frequency: '15_min' | '1_hour' | '3_hours' | '12_hours' | '1_day';
    channel: 'whatsapp' | 'sms' | 'email' | 'push';
    phone: string;
    email: string;
    lastUpdated?: string;
  }>>({
    'appt-201': {
      enabled: true,
      frequency: '1_hour',
      channel: 'whatsapp',
      phone: '+91 98201 45678',
      email: 'aarav.patel@gmail.com',
      lastUpdated: 'Aug 2, 2026'
    }
  });

  const [reminderModalAppt, setReminderModalAppt] = useState<Appointment | null>(null);
  const [reminderForm, setReminderForm] = useState<{
    frequency: '15_min' | '1_hour' | '3_hours' | '12_hours' | '1_day';
    channel: 'whatsapp' | 'sms' | 'email' | 'push';
    phone: string;
    email: string;
  }>({
    frequency: '1_hour',
    channel: 'whatsapp',
    phone: '+91 98201 45678',
    email: 'aarav.patel@gmail.com'
  });
  const [reminderNotice, setReminderNotice] = useState<string>('');

  const handleOpenReminderModal = (appt: Appointment) => {
    const existing = patientReminders[appt.id];
    const patientObj = patients.find(p => p.id === appt.patientId);
    setReminderForm({
      frequency: existing?.frequency || '1_hour',
      channel: existing?.channel || 'whatsapp',
      phone: existing?.phone || patientObj?.contact || '+91 98201 45678',
      email: existing?.email || patientObj?.email || 'patient@example.com'
    });
    setReminderModalAppt(appt);
  };

  const handleSaveReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderModalAppt) return;
    setPatientReminders(prev => ({
      ...prev,
      [reminderModalAppt.id]: {
        enabled: true,
        frequency: reminderForm.frequency,
        channel: reminderForm.channel,
        phone: reminderForm.phone,
        email: reminderForm.email,
        lastUpdated: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      }
    }));
    setReminderNotice(`Reminder set for appointment ${reminderModalAppt.bookingNo || 'BK-' + reminderModalAppt.id.slice(-6)}! We will notify via ${reminderForm.channel.toUpperCase()}.`);
    setReminderModalAppt(null);
    setTimeout(() => setReminderNotice(''), 6000);
  };

  const handleAddToCalendar = (appt: Appointment) => {
    const doctor = doctors.find(d => d.id === appt.doctorId);
    const title = encodeURIComponent(`Consultation with ${doctor?.name || 'Specialist Doctor'}`);
    const details = encodeURIComponent(`Care Specialty: ${doctor?.specialty}. Mode: ${appt.type === 'video' ? 'Virtual Video Telehealth' : 'In-Person OPD'}. Booking Ref: BK-${appt.id}`);
    const location = encodeURIComponent(doctor?.hospital || hospitalConfig.name);
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    window.open(googleCalUrl, '_blank');
  };
  const [patientFilterState, setPatientFilterState] = useState<DoctorFilterState>({
    state: 'ALL',
    district: 'ALL',
    searchName: '',
    department: 'ALL',
    availability: 'ALL'
  });

  const filteredPatientDoctors = filterDoctors(
    doctors.filter(d => d.isActive !== false),
    patientFilterState
  );
  const [hospitalTab, setHospitalTab] = useState<'add_doctor' | 'analytics' | 'availabilities'>('analytics');
  const [doctorActivePatientId, setDoctorActivePatientId] = useState<string>('pat-1');
  const [doctorViewMode, setDoctorViewMode] = useState<'classic' | 'slots' | 'timeline'>('slots');

  // Ensure Doctor has a valid active patient selection from seeded patients
  useEffect(() => {
    if (patients.length > 0 && !patients.find(p => p.id === doctorActivePatientId)) {
      setDoctorActivePatientId(patients[0].id);
    }
  }, [patients, doctorActivePatientId]);

  
  // Payment states
  const [payingAppointment, setPayingAppointment] = useState<Appointment | null>(null);
  const [paymentForm, setPaymentForm] = useState({ name: '', number: '', expiry: '', cvv: '' });
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  
  // Receipt State
  const [viewingReceiptAppointment, setViewingReceiptAppointment] = useState<Appointment | null>(null);

  // Feedback states
  const [feedbackAppointment, setFeedbackAppointment] = useState<Appointment | null>(null);
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');

  // New Doctor creation Form
  /**
   * Onboarding form. Mirrors the full Doctor record — a chamber address, its
   * map coordinates and the practice parameters — because a clinician added
   * here should be as complete as one that came from the seed, not a stub the
   * directory and map then have to render around.
   *
   * No fee field, by design: consultation fees are settled at the clinic desk.
   */
  const [newDoctorForm, setNewDoctorForm] = useState({
    name: '',
    specialty: 'Cardiologist',
    department: '',
    bio: '',
    image: '',
    hospital: '',
    addressLine: '',
    area: '',
    landmark: '',
    district: 'Purnea',
    state: 'Bihar',
    pincode: '',
    clinicPhone: '',
    latitude: '' as number | '',
    longitude: '' as number | '',
    experienceYears: '' as number | '',
    maxSchedulesPerSlot: 3,
    videoEnabled: true,
    isActive: true,
    slotsRaw: '09:00 AM, 10:30 AM, 01:00 PM, 03:30 PM',
    slots: ['09:00 AM', '10:30 AM', '01:00 PM', '03:30 PM']
  });

  // Doctor Availability form — no fee field: consultation fees are settled at
  // the clinic and are not configurable from the console.
  const [editingAvailabilityDocId, setEditingAvailabilityDocId] = useState<string | null>(null);
  const [doctorAvailabilityForm, setDoctorAvailabilityForm] = useState({
    isActive: true,
    videoEnabled: true,
    slots: [] as string[]
  });

  // Doctor prescription form
  const [newPrescriptionMed, setNewPrescriptionMed] = useState<string>('');
  const [prescriptionNotes, setPrescriptionNotes] = useState<string>('');

  // Register Patient form
  const [showRegisterPatient, setShowRegisterPatient] = useState<boolean>(false);
  const [registerPatientForm, setRegisterPatientForm] = useState({
    name: '',
    email: '',
    age: 30,
    gender: 'Male',
    contact: '',
    allergies: [] as string[],
    allergiesRaw: '',
    medications: [] as string[],
    medicationsRaw: '',
    medicalConditions: [] as string[],
    medicalConditionsRaw: '',
    notes: ''
  });

  // Document Upload state
  const [uploadForm, setUploadForm] = useState({
    patientId: 'pat-1',
    title: '',
    category: 'Lab Report' as any,
    fileContentText: '',
    fileName: 'lab_report.txt',
    fileSize: '1.2 KB'
  });
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);

  // Fetch configs and stats
  const fetchHospitalConfigAndStats = async () => {
    try {
      const configRes = await fetch('/api/hospital/config');
      if (configRes.ok) {
        const configData = await configRes.json();
        // The server stores the clinic phone as `phone` and has no SMS /
        // telehealth flags, so a straight replace left those form inputs
        // undefined (React's controlled → uncontrolled warning). Merge over
        // the defaults and map the phone field across.
        setHospitalConfig(prev => ({
          ...prev,
          ...configData,
          contactNumber: configData.contactNumber ?? configData.phone ?? prev.contactNumber,
          enableSms: configData.enableSms ?? prev.enableSms,
          enableTelehealth: configData.enableTelehealth ?? prev.enableTelehealth,
        }));
      }
      
      const statsRes = await fetch('/api/hospital/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error("Error loading config/stats:", err);
    }
  };

  useEffect(() => {
    fetchHospitalConfigAndStats();
  }, [appointments, doctors, patients, documents]);

  // Handle active doctor change
  useEffect(() => {
    if (patients.length > 0 && !patients.find(p => p.id === doctorActivePatientId)) {
      setDoctorActivePatientId(patients[0].id);
    }
  }, [patients]);

  // Reset system
  const handleSystemReset = async () => {
    if (!window.confirm("CRITICAL WARNING: This will purge all appointments, uploaded documents, client records, and configuration adjustments to factory default states. Proceed?")) {
      return;
    }
    try {
      const res = await fetch('/api/system/reset', { method: 'POST' });
      if (res.ok) {
        alert("Clinical system databases purged and re-seeded successfully!");
        await loadAllData();
        await fetchHospitalConfigAndStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit payment
  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingAppointment) return;
    try {
      // Only the platform fee is ever charged online — the consultation fee is
      // collected by the clinic desk and never passes through this app.
      const res = await fetch(`/api/appointments/${payingAppointment.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountPaid: PLATFORM_FEE,
          paymentMethod: 'Credit Card (Ending ' + paymentForm.number.slice(-4) + ')'
        })
      });
      if (res.ok) {
        setPaymentSuccess(true);
        setTimeout(async () => {
          setPaymentSuccess(false);
          setPayingAppointment(null);
          setPaymentForm({ name: '', number: '', expiry: '', cvv: '' });
          await loadAllData();
        }, 1500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Feedback
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackAppointment) return;
    try {
      const res = await fetch(`/api/appointments/${feedbackAppointment.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: feedbackRating,
          text: feedbackText
        })
      });
      if (res.ok) {
        alert("Your valuable feedback has been submitted directly to care records!");
        setFeedbackAppointment(null);
        setFeedbackText('');
        setFeedbackRating(5);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save Hospital Configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/hospital/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hospitalConfig)
      });
      if (res.ok) {
        alert("Hospital setup and configurations updated in real-time!");
        await fetchHospitalConfigAndStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create new Doctor Profile
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newDoctorForm,
          // Typed as a comma-separated line, stored as a list.
          slots: newDoctorForm.slotsRaw.split(',').map(s => s.trim()).filter(Boolean),
        })
      });
      if (res.ok) {
        alert("Specialist clinician record successfully configured!");
        setNewDoctorForm({
          name: '',
          specialty: 'Cardiologist',
          department: '',
          bio: '',
          image: '',
          hospital: '',
          addressLine: '',
          area: '',
          landmark: '',
          district: 'Purnea',
          state: 'Bihar',
          pincode: '',
          clinicPhone: '',
          latitude: '',
          longitude: '',
          experienceYears: '',
          maxSchedulesPerSlot: 3,
          videoEnabled: true,
          isActive: true,
          slotsRaw: '09:00 AM, 10:30 AM, 01:00 PM, 03:30 PM',
          slots: ['09:00 AM', '10:30 AM', '01:00 PM', '03:30 PM']
        });
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update clinician availability
  const handleUpdateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAvailabilityDocId) return;
    try {
      const res = await fetch(`/api/doctors/${editingAvailabilityDocId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: doctorAvailabilityForm.slots,
          isActive: doctorAvailabilityForm.isActive,
          videoEnabled: doctorAvailabilityForm.videoEnabled
        })
      });
      if (res.ok) {
        alert("Clinician availability and parameters adjusted on-the-fly!");
        setEditingAvailabilityDocId(null);
        await loadAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Patient profile creation
  const handleRegisterPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Policy check at the point of write, not just at the point of display —
    // hiding a button is a UI courtesy, refusing the save is the actual rule.
    if (!canRegisterPatientProfile) {
      setShowRegisterPatient(false);
      return;
    }
    const formattedData = {
      name: registerPatientForm.name,
      email: registerPatientForm.email,
      age: Number(registerPatientForm.age),
      gender: registerPatientForm.gender,
      contact: registerPatientForm.contact,
      allergies: registerPatientForm.allergiesRaw ? registerPatientForm.allergiesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      medications: registerPatientForm.medicationsRaw ? registerPatientForm.medicationsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      medicalConditions: registerPatientForm.medicalConditionsRaw ? registerPatientForm.medicalConditionsRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      notes: registerPatientForm.notes
    };
    
    const saved = await onSavePatient(formattedData);
    if (saved) {
      alert(`Patient account created! Patient ID: ${saved.id}`);
      setActivePatientId(saved.id);
      setShowRegisterPatient(false);
      setRegisterPatientForm({
        name: '', email: '', age: 30, gender: 'Male', contact: '',
        allergies: [], allergiesRaw: '', medications: [], medicationsRaw: '',
        medicalConditions: [], medicalConditionsRaw: '', notes: ''
      });
    }
  };

  // Doctor adding prescription
  const handleAddPrescriptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const activePatient = patients.find(p => p.id === doctorActivePatientId);
    if (!activePatient) return;

    const newMed = newPrescriptionMed.trim();
    if (!newMed) return;

    const updatedMedications = [...(activePatient.medications || [])];
    if (!updatedMedications.includes(newMed)) {
      updatedMedications.push(newMed);
    }

    let updatedNotes = activePatient.notes || '';
    if (prescriptionNotes.trim()) {
      const docName = doctors.find(d => d.id === activeDoctorId)?.name || 'Dr. Jenkins';
      updatedNotes += `\n\n[Dr. Note - ${docName} - ${new Date().toLocaleDateString()}]: ${prescriptionNotes.trim()}`;
    }

    const payload = {
      id: activePatient.id,
      name: activePatient.name,
      email: activePatient.email,
      age: activePatient.age,
      gender: activePatient.gender,
      contact: activePatient.contact,
      allergies: activePatient.allergies,
      medications: updatedMedications,
      medicalConditions: activePatient.medicalConditions,
      notes: updatedNotes
    };

    const saved = await onSavePatient(payload);
    if (saved) {
      alert("Prescription cataloged and medical record updated successfully!");
      setNewPrescriptionMed('');
      setPrescriptionNotes('');
      await loadAllData();
    }
  };

  // Document upload helper
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title.trim() || !uploadForm.fileContentText.trim()) {
      alert("Please provide a file title and the diagnostic report/text content!");
      return;
    }
    const saved = await onUploadDocument({
      patientId: activePatientId,
      title: uploadForm.title,
      category: uploadForm.category,
      fileContentText: uploadForm.fileContentText,
      fileName: uploadForm.title.toLowerCase().replace(/\s+/g, '_') + '.txt',
      fileSize: `${(uploadForm.fileContentText.length / 1024).toFixed(1)} KB`
    });

    if (saved) {
      alert("Document uploaded to clinic vault!");
      setUploadForm({
        patientId: activePatientId,
        title: '',
        category: 'Lab Report',
        fileContentText: '',
        fileName: 'lab_report.txt',
        fileSize: '1.2 KB'
      });
      await loadAllData();
    }
  };

  // Run analyzer
  const handleRunAnalysis = async (docId: string) => {
    setIsAnalyzing(docId);
    try {
      await onAnalyzeDocument(docId);
      alert("Gemini AI clinical intelligence diagnostic parsing complete!");
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(null);
    }
  };

  // No consultation-fee arithmetic lives here any more: the platform fee is a
  // flat PLATFORM_FEE and the doctor's fee is settled at the clinic desk.

  return (
    <div className="space-y-6">
      
      {/* Dynamic Persona Swapper Bar / Session Lock.
          Suppressed on the dedicated appointment pages — the signed-in identity
          is already shown in the left rail, so repeating it there is noise. It
          still renders on the combined portal and on the Profile page. */}
      {view === 'upcoming' || view === 'history' ? null : currentUser ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-slate-800 p-4.5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-sm shadow-sm shrink-0">
                {currentUser.role[0].toUpperCase()}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {currentUser.role} Session Active
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" title="Connected"></span>
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{currentUser.name}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{currentUser.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Persona Locked & Verified</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center lg:text-left">
              <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Access Control</h2>
              <div className="flex items-center gap-2 justify-center lg:justify-start">
                <Building className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{hospitalConfig.name}</span>
              </div>
            </div>

            {/* Core switches */}
            <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl">
              {[
                { id: 'patient', label: 'Patient Role', icon: User, color: 'bg-indigo-600 text-white' },
                { id: 'doctor', label: 'Doctor Specialist', icon: Stethoscope, color: 'bg-indigo-600 text-white' },
                { id: 'hospital', label: 'Hospital Desk', icon: Building, color: 'bg-indigo-600 text-white' },
                { id: 'admin', label: 'Admin Settings', icon: Settings, color: 'bg-indigo-600 text-white' }
              ].map(role => (
                <button
                  key={role.id}
                  onClick={() => setActivePersona(role.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer ${
                    activePersona === role.id ? role.color + " shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-700"
                  }`}
                >
                  <role.icon className="h-3.5 w-3.5" />
                  {role.label}
                </button>
              ))}
            </div>
          </div>

          {/* Profile Pickers underneath */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            {activePersona === 'patient' && (
              <div className="flex items-center gap-3 w-full justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active Patient Picker:</span>
                  <select
                    value={activePatientId}
                    onChange={(e) => {
                      setActivePatientId(e.target.value);
                      setUploadForm(prev => ({ ...prev, patientId: e.target.value }));
                    }}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 outline-hidden"
                  >
                    {selectablePatients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (Age {p.age})</option>
                    ))}
                  </select>
                </div>

                {/* Withdrawn while the portal is restricted to one profile. */}
                {canRegisterPatientProfile && (
                <button
                  onClick={() => setShowRegisterPatient(true)}
                  className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors cursor-pointer"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Register Patient
                </button>
                )}
              </div>
            )}

            {activePersona === 'doctor' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Log In As Doctor Profile:</span>
                <select
                  value={activeDoctorId}
                  onChange={(e) => setActiveDoctorId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-hidden"
                >
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                  ))}
                </select>
              </div>
            )}

            {activePersona === 'hospital' && (
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Authorized Clinic Desk Session</span>
              </div>
            )}

            {activePersona === 'admin' && (
              <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1 text-rose-600"><ShieldAlert className="h-3.5 w-3.5" /> System Master Administration Mode</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 1. PATIENT VIEWS ==================== */}
      {activePersona === 'patient' && (
        <div className="space-y-6">
          
          {/* Inner Navigation tabs: Upcoming Appointments, Patient Profiles, Historic Records.
              These three tabs are now first-class entries in the left rail
              ("Upcoming Appointment", "Profile", "Appointment History"), so the
              tab strip is hidden whenever the console renders a single slice.
              It is retained for the combined portal / non-patient personas. */}
          {!isSlicedView && (
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs">
            {[
              { id: 'upcoming', label: 'Upcoming Appointments & Reminders', icon: CalendarCheck },
              { id: 'profiles', label: 'Patient Profiles & Vitals', icon: User },
              { id: 'history', label: 'Historic Records & Tax Invoices', icon: FileSpreadsheet }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPatientTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  patientTab === tab.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
          )}

          {/* Toast / Reminder Notice */}
          {reminderNotice && (
            <div className="bg-emerald-600 text-white p-3.5 rounded-xl shadow-lg flex items-center justify-between text-xs font-bold animate-bounce">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                <span>{reminderNotice}</span>
              </div>
              <button onClick={() => setReminderNotice('')} className="text-emerald-200 hover:text-white font-extrabold cursor-pointer">✕</button>
            </div>
          )}

          {/* TAB 0: Upcoming Appointments & Reminders — also the dedicated
              "Upcoming Appointment" rail page (view === 'upcoming'). */}
          {effectivePatientTab === 'upcoming' && (
            <div className="space-y-6">
              
              {/* Active Profile Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-base">
                    {patients.find(p => p.id === activePatientId)?.name.charAt(0) || 'P'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900">
                        {patients.find(p => p.id === activePatientId)?.name}
                      </h3>
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Patient Profile
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      ABHA ID: <span className="font-mono text-slate-700 font-semibold">{patients.find(p => p.id === activePatientId)?.abhaId || "Not linked"}</span>
                    </p>
                  </div>
                </div>

                {/* Family switcher — hidden when the portal is locked to the
                    signed-in patient's own single profile. */}
                {!lockPatientToSelf && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Switch Family Profile:</span>
                  <select
                    value={activePatientId}
                    onChange={(e) => setActivePatientId(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-3 py-2 outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    {selectablePatients.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.age} yrs, {p.gender})
                      </option>
                    ))}
                  </select>
                </div>
                )}
              </div>

              {/* Upcoming Appointments List */}
              {(() => {
                /**
                 * Every still-scheduled booking for the active profile, soonest
                 * first. Sorting matters now that the page is capped: without it
                 * the "one" appointment on screen would be whichever row the API
                 * happened to return first, which can be a stale past-dated slot.
                 */
                const allUpcomingAppts = appointments
                  .filter(
                    a =>
                      a.patientId === activePatientId &&
                      // Date AND slot time: a 09:00 booking stops being
                      // "upcoming" at 09:00, not at midnight.
                      isUpcomingAppointment(a)
                  )
                  .sort(byStartTimeAscending);

                // The page holds every upcoming appointment; UPCOMING_VISIBLE_LIMIT
                // is the only thing keeping it to a single card for now.
                const upcomingAppts = allUpcomingAppts.slice(0, UPCOMING_VISIBLE_LIMIT);
                const hiddenUpcomingCount = allUpcomingAppts.length - upcomingAppts.length;

                if (upcomingAppts.length === 0) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-xs">
                      <div className="h-14 w-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
                        <CalendarCheck className="h-7 w-7" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-extrabold text-slate-900">No Upcoming Appointments Scheduled</h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          You do not have any active appointments or doctor visits scheduled for {patients.find(p => p.id === activePatientId)?.name}.
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="text-xs text-slate-400">Select another family profile or switch to the specialist booking section to find available slots.</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CalendarCheck className="h-4 w-4 text-indigo-600" /> Confirmed Consultations ({upcomingAppts.length})
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">Automatic SMS & WhatsApp Alerts Active</span>
                    </div>

                    {/* Surfaced rather than silently dropped: the cap is a display
                        decision, and the patient should know more slots exist. */}
                    {hiddenUpcomingCount > 0 && (
                      <div className="bg-indigo-50/70 border border-indigo-200 text-indigo-900 rounded-xl px-4 py-2.5 text-[11px] font-semibold flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        Showing your next consultation.
                        {hiddenUpcomingCount === 1
                          ? ' 1 more upcoming booking is listed under Appointment History.'
                          : ` ${hiddenUpcomingCount} more upcoming bookings are listed under Appointment History.`}
                      </div>
                    )}

                    <div className={`grid grid-cols-1 gap-4 ${upcomingAppts.length > 1 ? 'lg:grid-cols-2' : ''}`}>
                      {upcomingAppts.map(appt => {
                        const doctor = doctors.find(d => d.id === appt.doctorId);
                        const rem = patientReminders[appt.id];

                        return (
                          <div key={appt.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
                            
                            {/* Card Top */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Scheduled
                                  </span>
                                  {appt.type === 'video' ? (
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                      <Video className="h-3 w-3" /> Telehealth Video
                                    </span>
                                  ) : (
                                    <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                      <Building className="h-3 w-3" /> OPD Visit
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-[10px] font-bold text-slate-400">Ref: {appt.bookingNo || `BK-${appt.id.slice(-6)}`}</span>
                              </div>

                              <div className="flex items-start gap-3">
                                {doctor?.image ? (
                                  <img src={doctor.image} alt={doctor.name} className="h-12 w-12 rounded-xl object-cover border border-slate-200 shrink-0" />
                                ) : (
                                  <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-base shrink-0">
                                    {doctor?.name.charAt(0) || 'D'}
                                  </div>
                                )}
                                <div className="space-y-0.5 flex-1">
                                  <h5 className="text-sm font-extrabold text-slate-900">{doctor?.name || 'Specialist Clinician'}</h5>
                                  <p className="text-xs font-semibold text-indigo-600">{doctor?.specialty || 'General Medicine'}</p>
                                  <p className="text-[11px] text-slate-500">{doctor?.hospital || hospitalConfig.name} • {doctor?.district || 'New Delhi'}</p>
                                </div>
                              </div>

                              {/* Slot & Fee Details — the platform fee is the only
                                  amount shown; the consultation fee is a clinic
                                  desk matter and is never quoted here. */}
                              <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Appointment Slot</span>
                                  <span className="font-extrabold text-slate-900">{appt.date} at {appt.timeSlot}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Platform Fee</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-emerald-700">₹{PLATFORM_FEE}</span>
                                    {appt.feePaid ? (
                                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded">PAID ONLINE</span>
                                    ) : (
                                      <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.2 rounded">UNPAID</span>
                                    )}
                                  </div>
                                </div>
                                <div className="col-span-2 border-t border-slate-200/70 pt-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Doctor’s Fee</span>
                                  <span className="font-bold text-slate-700">Paid offline at the clinic reception</span>
                                </div>
                              </div>

                              {/* Reminder Banner */}
                              <div className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                                rem?.enabled 
                                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
                                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
                              }`}>
                                <div className="flex items-start gap-2 text-xs">
                                  <Bell className={`h-4 w-4 mt-0.5 shrink-0 ${rem?.enabled ? 'text-emerald-600' : 'text-amber-600'}`} />
                                  <div className="space-y-0.5">
                                    <p className="font-extrabold">
                                      {rem?.enabled ? `Reminder Set: ${rem.frequency.replace('_', ' ').toUpperCase()} before slot` : 'No Custom Reminder Configured'}
                                    </p>
                                    <p className="text-[10px] opacity-80">
                                      {rem?.enabled 
                                        ? `Delivery via ${rem.channel.toUpperCase()} (${rem.phone || rem.email})`
                                        : 'Set automated WhatsApp or SMS reminders so you never miss your visit.'}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleOpenReminderModal(appt)}
                                  className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] font-bold shrink-0 cursor-pointer shadow-2xs"
                                >
                                  {rem?.enabled ? 'Change' : 'Set Reminder'}
                                </button>
                              </div>

                            </div>

                            {/* Card Footer Actions */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                              <button
                                onClick={() => handleAddToCalendar(appt)}
                                className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Sync Google Cal
                              </button>

                              <div className="flex items-center gap-2">
                                {!appt.feePaid && (
                                  <button
                                    onClick={() => setPayingAppointment(appt)}
                                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                                  >
                                    Pay Platform Fee (₹{PLATFORM_FEE})
                                  </button>
                                )}
                                {appt.type === 'video' && onJoinVideo && (
                                  <button
                                    onClick={() => onJoinVideo(appt)}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                                  >
                                    <Video className="h-3.5 w-3.5" /> Join Room
                                  </button>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Family Overview Section.
                  This table lists the scheduled slots of EVERY patient record,
                  which suits the shared front-desk portal but not a signed-in
                  patient's own "Upcoming Appointment" page — so it is kept for
                  the combined portal only. */}
              {!isSlicedView && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-indigo-600" /> All Family Profiles Upcoming Schedule
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">Centralized Care Directory</span>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
                  <table className="w-full text-left divide-y divide-slate-100">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-3">Patient Name</th>
                        <th className="p-3">Consulting Specialist</th>
                        <th className="p-3">Slot Date & Time</th>
                        <th className="p-3">Reminder Status</th>
                        <th className="p-3 text-right">Quick Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {appointments
                        .filter(a => isUpcomingAppointment(a))
                        .sort(byStartTimeAscending)
                        .map(a => {
                        const pat = patients.find(p => p.id === a.patientId);
                        const doc = doctors.find(d => d.id === a.doctorId);
                        const rem = patientReminders[a.id];

                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{pat?.name || 'Patient'}</td>
                            <td className="p-3">
                              <div className="font-semibold">{doc?.name}</div>
                              <div className="text-[10px] text-slate-400">{doc?.specialty}</div>
                            </td>
                            <td className="p-3 font-semibold">{a.date} ({a.timeSlot})</td>
                            <td className="p-3">
                              {rem?.enabled ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                  <Bell className="h-3 w-3" /> {rem.frequency.replace('_', ' ').toUpperCase()} ({rem.channel.toUpperCase()})
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  Standard SMS
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleOpenReminderModal(a)}
                                className="text-indigo-600 hover:text-indigo-800 font-bold text-xs cursor-pointer"
                              >
                                Configure Alert →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {appointments.filter(a => isUpcomingAppointment(a)).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400">No upcoming appointments across family profiles.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

            </div>
          )}

          {/* TAB 1: Patient Profiles — also the dedicated "Profile" rail page
              (view === 'profile'), which is why the portal was renamed. */}
          {effectivePatientTab === 'profiles' && (
            <div className="space-y-6">
              
              {/* Active Profile Banner & Switcher */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    {/* The uploaded photograph when there is one; initials otherwise. */}
                    {activePatientRecord?.image ? (
                      <img
                        src={activePatientRecord.image}
                        alt={activePatientRecord.name}
                        className="h-12 w-12 rounded-2xl object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-extrabold text-lg">
                        {patients.find(p => p.id === activePatientId)?.name.charAt(0) || 'P'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 leading-none">
                          {patients.find(p => p.id === activePatientId)?.name}
                        </h3>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Active Profile
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        ABHA Health ID: <span className="font-mono text-slate-700 font-semibold">{patients.find(p => p.id === activePatientId)?.abhaId || "Not linked"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Profile picker — gone once the portal is locked to one profile. */}
                    {!lockPatientToSelf && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Select Profile:</span>
                      <select
                        value={activePatientId}
                        onChange={(e) => {
                          setActivePatientId(e.target.value);
                          setUploadForm(prev => ({ ...prev, patientId: e.target.value }));
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-hidden"
                      >
                        {selectablePatients.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.gender}, Age {p.age})</option>
                        ))}
                      </select>
                    </div>
                    )}

                    {canRegisterPatientProfile && (
                    <button
                      onClick={() => setShowRegisterPatient(true)}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add Patient
                    </button>
                    )}

                    {!isEditingProfile && (
                      <button
                        onClick={handleOpenProfileEditor}
                        className="inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Settings className="h-4 w-4" />
                        {missingProfileFields.length > 0 ? 'Complete Profile' : 'Edit Profile'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Prompt rather than silent blanks: a self-registered profile
                    starts with a name and a mobile number and nothing else. */}
                {!isEditingProfile && missingProfileFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="flex-1 font-semibold">
                      Your profile is missing {missingProfileFields.join(', ')}. Completing it helps your
                      doctor treat you safely.
                    </span>
                    <button
                      onClick={handleOpenProfileEditor}
                      className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
                    >
                      Complete now
                    </button>
                  </div>
                )}

                {/* Profile editor */}
                {isEditingProfile && (
                  <form onSubmit={handleSaveProfile} className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/30 p-5">
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider border-b border-indigo-100 pb-2">
                      Complete Your Profile
                    </h4>

                    <AvatarPicker
                      name={profileForm.name}
                      image={profileForm.image}
                      onChange={dataUrl => setProfileForm(p => ({ ...p, image: dataUrl }))}
                      label="Your photo"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Full Name</label>
                        <input
                          type="text" required value={profileForm.name}
                          onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Mobile Number</label>
                        <input
                          type="tel" value={profileForm.contact}
                          onChange={e => setProfileForm(p => ({ ...p, contact: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Email</label>
                        <input
                          type="email" value={profileForm.email}
                          onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Age</label>
                          <input
                            type="number" min={0} max={120} value={profileForm.age}
                            onChange={e => setProfileForm(p => ({ ...p, age: e.target.value ? Number(e.target.value) : '' }))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Gender</label>
                          <select
                            value={profileForm.gender}
                            onChange={e => setProfileForm(p => ({ ...p, gender: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                          >
                            <option value="">Select</option>
                            <option>Male</option>
                            <option>Female</option>
                            <option>Other</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Blood Group</label>
                        <input
                          type="text" placeholder="e.g. O+" value={profileForm.bloodGroup}
                          onChange={e => setProfileForm(p => ({ ...p, bloodGroup: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">City / Address</label>
                        <input
                          type="text" placeholder="e.g. Line Bazar, Purnea" value={profileForm.address}
                          onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Emergency Contact</label>
                        <input
                          type="text" placeholder="Name and number of a family contact" value={profileForm.emergencyContact}
                          onChange={e => setProfileForm(p => ({ ...p, emergencyContact: e.target.value }))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 text-xs border-t border-indigo-100 pt-3">
                      {[
                        { key: 'allergiesRaw' as const, label: 'Known Allergies', hint: 'e.g. Penicillin, Dust Mites' },
                        { key: 'medicationsRaw' as const, label: 'Current Medications', hint: 'e.g. Telmisartan 40mg (Morning)' },
                        { key: 'medicalConditionsRaw' as const, label: 'Medical Conditions', hint: 'e.g. Type 2 Diabetes Mellitus' },
                      ].map(field => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            {field.label} <span className="normal-case font-medium text-slate-400">(comma separated)</span>
                          </label>
                          <input
                            type="text" placeholder={field.hint} value={profileForm[field.key]}
                            onChange={e => setProfileForm(p => ({ ...p, [field.key]: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {isSavingProfile ? 'Saving…' : 'Save Profile'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Active Patient Full Medical Profile */}
                {!isEditingProfile && (() => {
                  const p = patients.find(pat => pat.id === activePatientId);
                  if (!p) return null;
                  const patientAppts = appointments.filter(a => a.patientId === p.id);
                  const paidAppts = patientAppts.filter(a => a.feePaid);
                  // Platform fees only. Consultation fees are settled at the
                  // clinic and are not part of anything this portal totals up.
                  const totalPaidSum = paidAppts.length * PLATFORM_FEE;

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Left Column: Personal Vitals & Bio */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-150">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Age / Gender</span>
                            <span className="text-xs font-extrabold text-slate-900">{p.age} y/o • {p.gender}</span>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-150">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Blood Group</span>
                            <span className="text-xs font-extrabold text-rose-600">{p.bloodGroup || "Not provided"}</span>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-150">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Contact</span>
                            <span className="text-xs font-extrabold text-slate-900">{p.contact}</span>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-150">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">City / State</span>
                            <span className="text-xs font-extrabold text-slate-900">{p.address || "Not provided"}</span>
                          </div>
                        </div>

                        {/* Medical History & Allergies */}
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-3">
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                              Known Allergies & Sensitivities
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {p.allergies?.length ? p.allergies.map((all, i) => (
                                <span key={i} className="bg-rose-50 border border-rose-200 text-rose-700 font-bold px-2.5 py-1 rounded-md text-xs">
                                  {all}
                                </span>
                              )) : <span className="text-xs text-slate-400 italic">No known drug/food allergies logged.</span>}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200/60">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                              Active Prescriptions & Medications
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {p.medications?.length ? p.medications.map((med, i) => (
                                <span key={i} className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-1 rounded-md text-xs">
                                  {med}
                                </span>
                              )) : <span className="text-xs text-slate-400 italic">No active medications recorded.</span>}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200/60">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                              Emergency Contact & Guardian
                            </h4>
                            <p className="text-xs font-medium text-slate-700">
                              {p.emergencyContact || "Not provided"}
                            </p>
                          </div>
                        </div>

                        {/* Closed consultations — filed the moment the doctor
                            presses "Review & complete" in their queue. */}
                        <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                          <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <BriefcaseMedical className="h-3.5 w-3.5 text-indigo-600" />
                            Consultation Records
                          </h4>
                          <ConsultationHistory
                            appointments={appointments}
                            patientId={p.id}
                            doctors={doctors}
                            className="max-h-[360px] overflow-y-auto pr-1"
                          />
                        </div>
                      </div>

                      {/* Right Column: Account Stats Summary */}
                      <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Profile Statement</span>
                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded border border-indigo-500/30">
                              Verified Patient
                            </span>
                          </div>

                          <div className="mt-4 space-y-4">
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Consultations</span>
                              <span className="text-2xl font-black text-white">{patientAppts.length} Visits</span>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Platform Fees Paid Online</span>
                              <span className="text-xl font-extrabold text-emerald-400">₹{totalPaidSum.toLocaleString('en-IN')}</span>
                              <span className="block text-[10px] text-slate-400">{DOCTOR_FEE_NOTE}</span>
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Diagnostic Vault Documents</span>
                              <span className="text-sm font-bold text-slate-200">{documents.filter(d => d.patientId === p.id).length} Documents Uploaded</span>
                            </div>
                          </div>
                        </div>

                        {/* On the dedicated Profile page the inner tab bar is gone,
                            so this hands navigation back to the shell, which opens
                            the "Appointment History" rail page. */}
                        <button
                          onClick={() => (onOpenHistory ? onOpenHistory() : setPatientTab('history'))}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer text-center"
                        >
                          View Historic Appointments & Invoices →
                        </button>
                      </div>

                    </div>
                  );
                })()}
              </div>

              {/* All Registered Patient Profiles Grid.
                  A one-profile portal has nothing to list here that the banner
                  above does not already show, so the whole section stands down
                  when the patient is locked to their own record. */}
              {!lockPatientToSelf && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-indigo-600" /> Registered Family & Patient Profiles ({selectablePatients.length})
                  </h3>
                  {canRegisterPatientProfile && (
                  <button
                    onClick={() => setShowRegisterPatient(true)}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Register New Profile
                  </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectablePatients.map(p => {
                    const isSelected = p.id === activePatientId;
                    const pAppts = appointments.filter(a => a.patientId === p.id);
                    return (
                      <div
                        key={p.id}
                        className={`bg-white rounded-xl border p-5 transition-all flex flex-col justify-between space-y-4 ${
                          isSelected ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-10 w-10 rounded-xl font-black text-sm flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {p.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="text-xs font-extrabold text-slate-900">{p.name}</h4>
                                <p className="text-[10px] text-slate-500 font-medium">{p.gender} • {p.age} years old</p>
                              </div>
                            </div>

                            {isSelected && (
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-bold px-2 py-0.5 rounded">
                                Selected
                              </span>
                            )}
                          </div>

                          <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <p className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Contact:</span>
                              <span className="font-semibold">{p.contact}</span>
                            </p>
                            <p className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Blood Group:</span>
                              <span className="font-bold text-rose-600">{p.bloodGroup || "O+"}</span>
                            </p>
                            <p className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Total Appointments:</span>
                              <span className="font-bold text-slate-800">{pAppts.length}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setActivePatientId(p.id);
                            setUploadForm(prev => ({ ...prev, patientId: p.id }));
                          }}
                          className={`w-full rounded-lg py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-slate-100 text-slate-600 cursor-default'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {isSelected ? 'Active Profile' : 'Select This Profile'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

            </div>
          )}

          {/* TAB 2: Historic Appointments & Invoices — also the dedicated
              "Appointment History" rail page (view === 'history'). */}
          {effectivePatientTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
              
              {/* Header & Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-600" /> Historic Appointments & Tax Invoices
                  </h3>
                  <p className="text-xs text-slate-500">
                    Viewing records for patient profile: <span className="font-bold text-indigo-600">{patients.find(p => p.id === activePatientId)?.name}</span>
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs font-semibold text-slate-400 hidden lg:inline">Status:</span>
                  {[
                    { id: 'all', label: 'All Records' },
                    { id: 'scheduled', label: 'Upcoming / Active' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'cancelled', label: 'Cancelled' }
                  ].map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setHistoryStatusFilter(filter.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        historyStatusFilter === filter.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table / List of Historic Appointments & Invoices */}
              {(() => {
                let filteredList = appointments.filter(a => a.patientId === activePatientId);
                if (historyStatusFilter !== 'all') {
                  filteredList = filteredList.filter(a => a.status === historyStatusFilter);
                }

                if (filteredList.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-400 space-y-3">
                      <FileSpreadsheet className="h-12 w-12 mx-auto text-slate-300" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-700">No historic appointments or invoices found</p>
                        <p className="text-xs text-slate-500">There are no {historyStatusFilter !== 'all' ? historyStatusFilter : ''} consultations under this patient profile.</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate-100">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold">
                          <th className="p-3">Booking Ref & Date</th>
                          <th className="p-3">Specialist Consultant</th>
                          <th className="p-3">Consultation Type</th>
                          {/* One money column only: the platform fee. The
                              consultation fee is billed by the clinic and is
                              not itemised anywhere in this portal. */}
                          <th className="p-3">Platform Fee</th>
                          <th className="p-3">Doctor’s Fee</th>
                          <th className="p-3">Payment Status</th>
                          <th className="p-3 text-right">Invoice & Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {filteredList.map(appt => {
                          const doctor = doctors.find(d => d.id === appt.doctorId);

                          return (
                            <tr key={appt.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="p-3">
                                <div className="font-extrabold text-slate-900 font-mono">
                                  {appt.bookingNo || `BK-${appt.id.toUpperCase().slice(-6)}`}
                                </div>
                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  {appt.date} • {appt.timeSlot}
                                </div>
                              </td>

                              <td className="p-3">
                                <div className="font-bold text-slate-900">{doctor?.name || "Medical Specialist"}</div>
                                <div className="text-[10px] text-indigo-600 font-semibold">{doctor?.specialty || "General Medicine"}</div>
                              </td>

                              <td className="p-3">
                                {appt.type === 'video' ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                                    <Video className="h-3 w-3" /> Telehealth Video
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                                    <Building className="h-3 w-3" /> In-Person OPD
                                  </span>
                                )}
                              </td>

                              <td className="p-3 font-extrabold text-slate-900">₹{PLATFORM_FEE}</td>
                              <td className="p-3 font-semibold text-slate-500">Paid at clinic</td>

                              <td className="p-3">
                                {appt.status === 'cancelled' && appt.refundStatus ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 border border-sky-200">
                                    REFUND INITIATED
                                  </span>
                                ) : appt.feePaid ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" /> {appt.status === 'cancelled' ? 'PAID · CANCELLED' : 'PAID'}
                                  </span>
                                ) : appt.status === 'cancelled' ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                                    VOID / CANCELLED
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 border border-amber-200 animate-pulse">
                                    UNPAID
                                  </span>
                                )}
                              </td>

                              <td className="p-3 text-right space-x-1.5">
                                {!appt.feePaid && appt.status !== 'cancelled' && (
                                  <button
                                    onClick={() => setPayingAppointment(appt)}
                                    className="bg-indigo-600 text-white rounded px-2.5 py-1 text-[10px] font-bold hover:bg-indigo-500 transition-colors cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <CreditCard className="h-3 w-3" /> Pay Online
                                  </button>
                                )}

                                {appt.feePaid && (
                                  <button
                                    onClick={() => setViewingReceiptAppointment(appt)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-3xs"
                                  >
                                    <Printer className="h-3 w-3 text-slate-600" /> Tax Invoice
                                  </button>
                                )}

                                {appt.type === 'video' && appt.status === 'scheduled' && (
                                  <button
                                    onClick={() => onJoinVideo(appt)}
                                    className="bg-emerald-600 text-white rounded px-2.5 py-1 text-[10px] font-bold hover:bg-emerald-500 transition-colors cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Video className="h-3 w-3" /> Join Room
                                  </button>
                                )}

                                {appt.status === 'completed' && appt.feedbackRating == null && (
                                  <button
                                    onClick={() => setFeedbackAppointment(appt)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white rounded px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <MessageSquare className="h-3 w-3" /> Rate Care
                                  </button>
                                )}

                                {appt.feedbackRating != null && (
                                  <div className="text-[10px] text-amber-500 font-bold inline-flex items-center gap-0.5">
                                    Rated {appt.feedbackRating} <Star className="h-2.5 w-2.5 fill-amber-500" />
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      )}

      {/* ============ 2a. DOCTOR PROFILE (dedicated "Profile" page) ============
          Profile information only. The scheduler, patient charts and
          prescription pad that used to share this page now live on the
          "Appointments" rail entry (DoctorQueue). */}
      {activePersona === 'doctor' && view === 'profile' && (() => {
        const doc = doctors.find(d => d.id === activeDoctorId);

        if (!doc) {
          return (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
              No consultant profile is loaded for this session.
            </div>
          );
        }

        /** Address is assembled from optional parts — a doctor may hold OPD at
         *  a chamber that has only some of them on file. */
        const addressParts = [doc.addressLine, doc.area, doc.district, doc.state, doc.pincode].filter(Boolean);

        const fieldClass =
          'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500';

        if (isEditingDoctor) {
          return (
            <form onSubmit={handleSaveDoctorProfile} className="space-y-5 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-6">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider border-b border-indigo-100 pb-2.5">
                Edit Your Practice Profile
              </h3>

              <AvatarPicker
                name={doctorForm.name}
                image={doctorForm.image}
                onChange={dataUrl => setDoctorForm(p => ({ ...p, image: dataUrl }))}
                label="Profile photograph"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {([
                  { key: 'name', label: 'Full Name', required: true },
                  { key: 'specialty', label: 'Specialty', required: true },
                  { key: 'department', label: 'Department' },
                  { key: 'clinicPhone', label: 'Reception Phone' },
                  { key: 'hospital', label: 'Clinic / Hospital' },
                  { key: 'addressLine', label: 'Address Line' },
                  { key: 'area', label: 'Area / Locality' },
                  { key: 'landmark', label: 'Landmark' },
                  { key: 'district', label: 'District' },
                  { key: 'state', label: 'State' },
                  { key: 'pincode', label: 'PIN Code' },
                ] as const).map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">{field.label}</label>
                    <input
                      type="text"
                      required={'required' in field && field.required}
                      value={doctorForm[field.key]}
                      onChange={e => setDoctorForm(p => ({ ...p, [field.key]: e.target.value }))}
                      className={fieldClass}
                    />
                  </div>
                ))}

                {/* No fee field, by design: consultation fees are settled at the
                    clinic desk and are not configurable from the console. */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Years of Experience</label>
                  <input
                    type="number" min={0} max={70} value={doctorForm.experienceYears}
                    onChange={e => setDoctorForm(p => ({ ...p, experienceYears: e.target.value ? Number(e.target.value) : '' }))}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Patients Per Slot</label>
                  <input
                    type="number" min={1} max={20} value={doctorForm.maxSchedulesPerSlot}
                    onChange={e => setDoctorForm(p => ({ ...p, maxSchedulesPerSlot: Number(e.target.value) || 1 }))}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  OPD Slot Timings <span className="normal-case font-medium text-slate-400">(comma separated, e.g. 10:00 AM, 05:00 PM)</span>
                </label>
                <input
                  type="text" value={doctorForm.slotsRaw}
                  onChange={e => setDoctorForm(p => ({ ...p, slotsRaw: e.target.value }))}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1 text-xs">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Professional Summary</label>
                <textarea
                  rows={4} value={doctorForm.bio}
                  onChange={e => setDoctorForm(p => ({ ...p, bio: e.target.value }))}
                  placeholder="Qualifications, sub-specialties, registration number, clinic timings…"
                  className="w-full bg-white border border-slate-200 rounded-lg p-3 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox" checked={doctorForm.videoEnabled}
                    onChange={e => setDoctorForm(p => ({ ...p, videoEnabled: e.target.checked }))}
                    className="h-4 w-4 accent-indigo-600 cursor-pointer"
                  />
                  Offer telehealth video consultations
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="checkbox" checked={doctorForm.isActive}
                    onChange={e => setDoctorForm(p => ({ ...p, isActive: e.target.checked }))}
                    className="h-4 w-4 accent-indigo-600 cursor-pointer"
                  />
                  Currently accepting patients
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-indigo-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditingDoctor(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDoctor}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-bold text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSavingDoctor ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          );
        }

        return (
          <div className="space-y-6">

            {/* Identity banner */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                {doc.image ? (
                  <img
                    src={doc.image}
                    alt={doc.name}
                    className="h-20 w-20 rounded-2xl object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black text-2xl shrink-0">
                    {doc.name.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-extrabold text-slate-900 leading-none">{doc.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      doc.isActive !== false
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {doc.isActive !== false ? 'Accepting Patients' : 'Not Consulting'}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-indigo-600">{doc.specialty}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
                    {doc.department && (
                      <span className="flex items-center gap-1">
                        <BriefcaseMedical className="h-3.5 w-3.5 text-slate-400" /> {doc.department}
                      </span>
                    )}
                    {/* Placeholder for the edit affordance, rendered below the
                        stats so it never crowds the identity line on mobile. */}
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> {doc.rating} rating
                    </span>
                    {doc.experienceYears !== undefined && (
                      <span className="flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5 text-slate-400" /> {doc.experienceYears} years experience
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleOpenDoctorEditor(doc)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  Edit Profile
                </button>
              </div>
            </div>

            {/* Consulting parameters */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Fee Collection</span>
                <span className="text-sm font-extrabold text-slate-900">At the clinic desk</span>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Consultation Modes</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {doc.videoEnabled ? 'OPD + Telehealth' : 'In-Person OPD'}
                </span>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Daily Slots</span>
                <span className="text-sm font-extrabold text-slate-900">{doc.slots?.length || 0} slots</span>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Capacity / Slot</span>
                <span className="text-sm font-extrabold text-slate-900">{doc.maxSchedulesPerSlot} patients</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Chamber & contact */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                  <Building className="h-4 w-4 text-indigo-600" /> Consulting Chamber
                </h4>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Clinic / Hospital</span>
                  <p className="text-xs font-bold text-slate-900">{doc.hospital}</p>
                </div>

                {addressParts.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Address</span>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed">{addressParts.join(', ')}</p>
                  </div>
                )}

                {doc.landmark && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Landmark</span>
                    <p className="text-xs font-medium text-slate-700">{doc.landmark}</p>
                  </div>
                )}

                {doc.clinicPhone && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Reception</span>
                    <p className="text-xs font-bold text-slate-900 font-mono">{doc.clinicPhone}</p>
                  </div>
                )}

                {currentUser?.email && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Registered Email</span>
                    <p className="text-xs font-medium text-slate-700">{currentUser.email}</p>
                  </div>
                )}
              </div>

              {/* Profile summary & OPD hours */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                  <Stethoscope className="h-4 w-4 text-indigo-600" /> Professional Summary
                </h4>

                <p className="text-xs text-slate-700 leading-relaxed">
                  {doc.bio || <span className="text-slate-400 italic">No professional summary on file.</span>}
                </p>

                <div className="pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">OPD Slot Timings</span>
                  <div className="flex flex-wrap gap-1.5">
                    {doc.slots?.length ? doc.slots.map((slot, i) => (
                      <span key={i} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-md text-[11px] font-mono">
                        {slot}
                      </span>
                    )) : <span className="text-xs text-slate-400 italic">No slots published.</span>}
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ==================== 2. DOCTOR VIEWS ====================
          The combined doctor workspace. Retained for the full portal; a
          signed-in doctor now reaches these tools through "Appointments"
          and "Clinical Patients" instead. */}
      {activePersona === 'doctor' && view !== 'profile' && (() => {
        const currentDoctorObj = doctors.find(d => d.id === activeDoctorId);
        return (
          <div className="space-y-6">
            
            {/* View Selection Controls */}
            <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-3xs">
              <div className="flex items-center gap-2 pl-1.5">
                <Sliders className="h-4.5 w-4.5 text-indigo-600" />
                <div className="text-left">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                    Doctor Scheduler Dashboard
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    Manage patient lists, slots and consulting history
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  onClick={() => setDoctorViewMode('slots')}
                  className={`flex-1 sm:flex-initial text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    doctorViewMode === 'slots'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Slot-Wise Patients
                </button>
                <button
                  onClick={() => setDoctorViewMode('timeline')}
                  className={`flex-1 sm:flex-initial text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    doctorViewMode === 'timeline'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Chronological Timeline
                </button>
                <button
                  onClick={() => setDoctorViewMode('classic')}
                  className={`flex-1 sm:flex-initial text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    doctorViewMode === 'classic'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Standard Checklist
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Doctor Slots, Appointments & Patient Directory */}
              <div className="space-y-6 h-fit">
                
                {doctorViewMode === 'slots' && (() => {
                  const doctorSlots = currentDoctorObj?.slots || [];
                  return (
                    <div className="space-y-4">
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-indigo-600" /> Patient List Slot-Wise
                          </h4>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md">
                            {doctorSlots.length} Active Slots
                          </span>
                        </div>

                        <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                          {doctorSlots.map((slot, i) => {
                            const slotAppts = appointments.filter(
                              a => a.doctorId === activeDoctorId && a.timeSlot === slot && a.status !== 'cancelled'
                            );
                            const patientCount = slotAppts.length;

                            return (
                              <div key={i} className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-slate-150 pb-1.5">
                                  <span className="text-xs font-black text-slate-800">{slot}</span>
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                    patientCount > 0 
                                      ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' 
                                      : 'bg-slate-200 text-slate-500'
                                  }`}>
                                    {patientCount === 0 ? 'Empty Slot' : patientCount === 1 ? '1 Patient' : `${patientCount} Patients`}
                                  </span>
                                </div>

                                {patientCount === 0 ? (
                                  <p className="text-[10px] text-slate-400 font-medium italic">No patients scheduled for this slot.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {slotAppts.map(appt => {
                                      const isSelected = appt.patientId === doctorActivePatientId;
                                      const apptPatient = patients.find(p => p.id === appt.patientId);
                                      const apptDocs = documents.filter(d => d.patientId === appt.patientId);

                                      return (
                                        <div 
                                          key={appt.id} 
                                          onClick={() => setDoctorActivePatientId(appt.patientId)}
                                          className={`p-2.5 rounded-lg border transition-all text-left cursor-pointer space-y-2 hover:bg-white ${
                                            isSelected 
                                              ? 'bg-white border-indigo-300 text-indigo-950 shadow-xs ring-1 ring-indigo-200' 
                                              : 'bg-white/50 border-slate-150 hover:border-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-start justify-between gap-1">
                                            <div>
                                              <p className="text-[11px] font-bold text-slate-900">{appt.patientName}</p>
                                              <p className="text-[9px] text-slate-500 font-medium">Age: {appt.patientAge} • {apptPatient?.gender || 'N/A'}</p>
                                            </div>
                                            <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase tracking-wider shrink-0 ${
                                              appt.type === 'video' ? 'bg-teal-50 text-teal-700 border border-teal-150' : 'bg-blue-50 text-blue-700 border border-blue-150'
                                            }`}>
                                              {appt.type}
                                            </span>
                                          </div>

                                          {/* Patient-uploaded details */}
                                          {appt.notes && (
                                            <div className="bg-slate-50/80 border border-slate-100 rounded-md p-1.5 text-[9px] text-slate-500 leading-normal">
                                              <p className="font-extrabold text-[8px] text-slate-600 uppercase tracking-wide">Patient Note:</p>
                                              <p className="italic">"{appt.notes}"</p>
                                            </div>
                                          )}

                                          {/* Document uploads by this patient */}
                                          {apptDocs.length > 0 && (
                                            <div className="space-y-1">
                                              <p className="text-[8px] text-indigo-700 font-extrabold uppercase tracking-wide">Patient Clinical Vault Uploads ({apptDocs.length}):</p>
                                              <div className="flex flex-col gap-1">
                                                {apptDocs.map(doc => (
                                                  <div key={doc.id} className="flex items-center justify-between text-[8px] bg-indigo-50/40 border border-indigo-100 rounded px-1.5 py-0.5">
                                                    <span className="font-semibold text-indigo-950 truncate max-w-[120px]">{doc.title}</span>
                                                    <span className="text-slate-400 shrink-0">{doc.category}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}

                                          <div className="text-[9px] text-indigo-600 font-bold text-right hover:underline flex items-center justify-end gap-0.5">
                                            View Full Patient Chart <ArrowRight className="h-2.5 w-2.5" />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Unified Patient Directory in slots mode as well */}
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 flex-shrink-0">
                          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Users className="h-4.5 w-4.5 text-indigo-600" /> Patient Directory
                          </h4>
                        </div>
                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                          {patients.map(p => (
                            <button
                              key={p.id}
                              onClick={() => setDoctorActivePatientId(p.id)}
                              className={`w-full text-left p-2 rounded-xl border text-[11px] font-bold transition-all flex items-center justify-between cursor-pointer ${
                                p.id === doctorActivePatientId 
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900' 
                                  : 'border-slate-100 hover:bg-slate-50'
                              }`}
                            >
                              <span>{p.name} ({p.age} y/o)</span>
                              <ArrowRight className="h-3 w-3 text-slate-300" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {doctorViewMode === 'timeline' && (() => {
                  const doctorSlots = currentDoctorObj?.slots || [];
                  return (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="border-b border-slate-100 pb-2.5">
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="h-4.5 w-4.5 text-indigo-600" /> Daily Timeline Schedule
                        </h3>
                        <p className="text-[10px] text-slate-400">Chronological appointment flow for today</p>
                      </div>

                      <div className="relative border-l-2 border-slate-200 pl-4 ml-2.5 space-y-6 max-h-[600px] overflow-y-auto pr-1">
                        {doctorSlots.map((slot, idx) => {
                          const slotAppts = appointments.filter(
                            a => a.doctorId === activeDoctorId && a.timeSlot === slot && a.status !== 'cancelled'
                          );
                          const hasAppts = slotAppts.length > 0;

                          return (
                            <div key={idx} className="relative">
                              {/* Timeline indicator circle */}
                              <div className={`absolute -left-[23px] top-1 h-3.5 w-3.5 rounded-full border-2 bg-white transition-all ${
                                hasAppts ? 'border-indigo-600 scale-110' : 'border-slate-300'
                              }`}></div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-black text-slate-900">{slot}</span>
                                  {hasAppts && (
                                    <span className="text-[9px] font-black bg-indigo-50 border border-indigo-150 text-indigo-700 px-1.5 py-0.5 rounded">
                                      {slotAppts.length} {slotAppts.length === 1 ? 'Patient' : 'Patients'}
                                    </span>
                                  )}
                                </div>

                                {!hasAppts ? (
                                  <div className="p-3 bg-slate-50/50 border border-slate-200/50 rounded-xl text-[11px] text-slate-400 italic">
                                    No appointments scheduled. Available.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {slotAppts.map(appt => {
                                      const isSelected = appt.patientId === doctorActivePatientId;
                                      return (
                                        <div 
                                          key={appt.id}
                                          onClick={() => setDoctorActivePatientId(appt.patientId)}
                                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all space-y-1.5 ${
                                            isSelected 
                                              ? 'bg-indigo-50 border-indigo-200 shadow-3xs' 
                                              : 'bg-white border-slate-200 hover:border-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <p className="text-xs font-extrabold text-slate-800">{appt.patientName}</p>
                                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded uppercase ${
                                              appt.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' : 'bg-indigo-50 text-indigo-700 border border-indigo-150'
                                            }`}>
                                              {appt.status}
                                            </span>
                                          </div>

                                          <p className="text-[10px] text-slate-400 font-semibold">Contact: {appt.patientContact} • {appt.type} Consultation</p>
                                          
                                          {appt.notes && (
                                            <p className="text-[10px] text-slate-500 italic truncate">" {appt.notes} "</p>
                                          )}

                                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 text-[10px] font-bold justify-between">
                                            <span className="text-indigo-600 hover:underline">View Chart</span>
                                            {appt.type === 'video' && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onJoinVideo(appt);
                                                }}
                                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] font-black px-2 py-0.5 rounded cursor-pointer"
                                              >
                                                Telehealth
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {doctorViewMode === 'classic' && (
                  <>
                    {/* 1. Doctor's Active Slots Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Clock className="h-4.5 w-4.5 text-indigo-600" /> My Daily Active Slots
                        </h3>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md">
                          {currentDoctorObj?.slots?.length || 0} Slots
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {currentDoctorObj?.slots?.map((slot, i) => {
                          const bookedAppts = appointments.filter(a => a.doctorId === activeDoctorId && a.timeSlot === slot && a.status !== 'cancelled');
                          const isBooked = bookedAppts.length > 0;
                          return (
                            <div 
                              key={i} 
                              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col justify-between transition-all ${
                                isBooked 
                                  ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-3xs' 
                                  : 'bg-slate-50 border-slate-200/80 text-slate-600'
                              }`}
                            >
                              <span className="font-bold">{slot}</span>
                              <span className="text-[9px] font-medium mt-1 block">
                                {isBooked ? `Booked: ${bookedAppts[0].patientName}` : 'Available'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Appointments Made for the Doctor Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="h-4.5 w-4.5 text-indigo-600" /> Appointments Scheduled
                        </h3>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md">
                          {appointments.filter(a => a.doctorId === activeDoctorId && a.status !== 'cancelled').length} Booked
                        </span>
                      </div>

                      {appointments.filter(a => a.doctorId === activeDoctorId).length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <Calendar className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                          <p className="text-xs font-semibold">No appointments scheduled yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                          {appointments.filter(a => a.doctorId === activeDoctorId).map(appt => {
                            const isSelected = appt.patientId === doctorActivePatientId;
                            return (
                              <div 
                                key={appt.id} 
                                className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                                  isSelected 
                                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 shadow-xs' 
                                    : 'border-slate-200 bg-white hover:bg-slate-50/60'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="space-y-0.5">
                                    <p className="text-xs font-extrabold text-slate-900">{appt.patientName}</p>
                                    <p className="text-[10px] text-slate-500 font-semibold">{appt.date} • {appt.timeSlot}</p>
                                  </div>
                                  
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                      appt.type === 'video' 
                                        ? 'bg-teal-50 text-teal-700 border border-teal-150' 
                                        : 'bg-blue-50 text-blue-700 border border-blue-150'
                                    }`}>
                                      {appt.type === 'video' ? 'Video' : 'Visiting'}
                                    </span>
                                    <span className={`text-[9px] font-extrabold capitalize ${
                                      appt.status === 'completed' ? 'text-emerald-600' :
                                      appt.status === 'cancelled' ? 'text-rose-500' : 'text-indigo-600'
                                    }`}>
                                      ● {appt.status}
                                    </span>
                                  </div>
                                </div>

                                {appt.notes && (
                                  <p className="text-[10px] text-slate-500 leading-relaxed italic bg-slate-50 border border-slate-100 p-2 rounded-lg">
                                    " {appt.notes} "
                                  </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                                  <button
                                    onClick={() => setDoctorActivePatientId(appt.patientId)}
                                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="h-3.5 w-3.5" /> View Patient Chart
                                  </button>

                                  {appt.type === 'video' && appt.status !== 'cancelled' && (
                                    <button
                                      onClick={() => onJoinVideo(appt)}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-extrabold px-2.5 py-1 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <Video className="h-3 w-3" /> Join Telehealth
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 3. Patients Registry Directory */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                          <Users className="h-4.5 w-4.5 text-indigo-600" /> Patient Directory
                        </h3>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md">
                          {patients.length} Registered
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {patients.map(p => {
                          const isActive = p.id === doctorActivePatientId;
                          return (
                            <button
                              key={p.id}
                              onClick={() => setDoctorActivePatientId(p.id)}
                              className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                                isActive 
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-900 shadow-xs' 
                                  : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <p className="text-xs font-bold">{p.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{p.age} y/o • {p.gender}</p>
                              </div>
                              <ArrowRight className={`h-4 w-4 transition-all ${isActive ? 'text-indigo-600 translate-x-1' : 'text-slate-300'}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                
              </div>

          {/* Right Column: Detailed history and clinical prescriptions */}
          <div className="lg:col-span-2 space-y-6">
            {(() => {
              const activePatient = patients.find(p => p.id === doctorActivePatientId);
              if (!activePatient) return (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                  Select a clinical patient profile from the connection list to view medical charts.
                </div>
              );

              return (
                <div className="space-y-6">
                  
                  {/* Part A: Patient Clinical Chart */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Clinical Patient History</h3>
                        <p className="text-xs text-slate-400">Patient: {activePatient.name} • Contact: {activePatient.contact}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">ID: {activePatient.id}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4 space-y-1.5">
                        <span className="font-bold text-rose-800 uppercase tracking-wide text-[10px]">Allergy Concerns</span>
                        <div className="flex flex-wrap gap-1">
                          {activePatient.allergies?.length ? activePatient.allergies.map((all, i) => (
                            <span key={i} className="bg-white px-2 py-0.5 rounded border border-rose-200 text-rose-700 font-bold">{all}</span>
                          )) : <span className="text-slate-400">None logged.</span>}
                        </div>
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-1.5">
                        <span className="font-bold text-emerald-800 uppercase tracking-wide text-[10px]">Active Meds</span>
                        <div className="flex flex-wrap gap-1">
                          {activePatient.medications?.length ? activePatient.medications.map((med, i) => (
                            <span key={i} className="bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 font-bold">{med}</span>
                          )) : <span className="text-slate-400">No prescriptions.</span>}
                        </div>
                      </div>

                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-1.5">
                        <span className="font-bold text-blue-800 uppercase tracking-wide text-[10px]">Medical Diagnosis</span>
                        <div className="flex flex-wrap gap-1">
                          {activePatient.medicalConditions?.length ? activePatient.medicalConditions.map((cond, i) => (
                            <span key={i} className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-700 font-bold">{cond}</span>
                          )) : <span className="text-slate-400">Healthy.</span>}
                        </div>
                      </div>
                    </div>

                    {activePatient.notes && (
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs text-slate-700">
                        <p className="font-extrabold text-slate-800 mb-1">Clinical Progress Notes</p>
                        <p className="leading-relaxed whitespace-pre-wrap">{activePatient.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Part B: Add Prescriptions Form */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                      <BriefcaseMedical className="h-4.5 w-4.5 text-indigo-600" /> Issue Prescriptions & Log Consultation Checkup
                    </h3>
                    
                    <form onSubmit={handleAddPrescriptionSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">New Prescribed Medication</label>
                          <input
                            type="text"
                            placeholder="e.g. Amoxicillin 500mg, Atorvastatin 20mg"
                            value={newPrescriptionMed}
                            onChange={e => setNewPrescriptionMed(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Consulting Specialty Match</label>
                          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 font-semibold select-none">
                            {doctors.find(d => d.id === activeDoctorId)?.specialty || "General Medicine"}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Clinician Consultation Diagnosis Notes</label>
                        <textarea
                          rows={3}
                          placeholder="Log diagnostic findings, symptom evaluations, and recommendations..."
                          value={prescriptionNotes}
                          onChange={e => setPrescriptionNotes(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" /> Log Prescription
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Part C: View uploaded document logs for this patient */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                      <FileText className="h-4.5 w-4.5 text-indigo-600" /> Patient Medical File Records
                    </h3>

                    {documents.filter(d => d.patientId === activePatient.id).length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No uploaded files or diagnostic summaries found for this clinical profile.</p>
                    ) : (
                      <div className="space-y-3">
                        {documents.filter(d => d.patientId === activePatient.id).map(doc => (
                          <div key={doc.id} className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-900">{doc.title} ({doc.category})</span>
                              <span className="text-[10px] text-slate-400">{doc.uploadDate}</span>
                            </div>
                            {doc.analysis ? (
                              <div className="bg-white rounded-lg p-3 border border-slate-100 space-y-2 text-xs text-slate-600">
                                <p className="italic">"{doc.analysis.summary}"</p>
                                <div className="flex flex-wrap gap-1">
                                  {doc.analysis.extractedAllergies?.map((all, i) => <span key={i} className="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded text-[10px] font-bold">{all}</span>)}
                                  {doc.analysis.extractedMedications?.map((med, i) => <span key={i} className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-medium">{med}</span>)}
                                </div>
                              </div>
                            ) : (
                              <p className="text-slate-400 text-[11px]">Unanalyzed file stream. Ask patient to run Gemini AI Clinical Extraction on this record.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  })()}

      {/* ==================== 3. HOSPITAL VIEWS ====================
          Also rendered for admin: clinician onboarding lives on this console,
          and onboarding is an administrator's job as much as the front desk's
          — the admin account is literally described as doing it. The admin
          block below then adds the system-level settings on top. */}
      {(activePersona === 'hospital' || activePersona === 'admin') && (
        <div className="space-y-6">
          
          {/* Hospital Inner Navigation */}
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs">
            {[
              { id: 'analytics', label: 'Clinic Performance & Revenue', icon: TrendingUp },
              { id: 'availabilities', label: 'Clinician Availabilities', icon: Sliders },
              { id: 'add_doctor', label: 'Onboard Specialist', icon: PlusCircle }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setHospitalTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  hospitalTab === tab.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: Revenue & Bookings charts */}
          {hospitalTab === 'analytics' && (
            <div className="space-y-6">
              
              {/* Stats highlights */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
                  <div className="rounded-lg bg-teal-50 p-3 text-teal-600"><DollarSign className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Platform Fees Collected</p>
                    <h3 className="text-xl font-extrabold text-slate-900">₹{platformFeeCollected.toLocaleString('en-IN')}</h3>
                    <p className="text-[10px] text-slate-400">Consultation fees are collected at the clinic</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
                  <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600"><Calendar className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Bookings</p>
                    <h3 className="text-xl font-extrabold text-slate-900">{stats.totalAppointments}</h3>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
                  <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600"><CheckCircle className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Completed Care</p>
                    <h3 className="text-xl font-extrabold text-slate-900">{completedCount}</h3>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex items-center gap-4">
                  <div className="rounded-lg bg-indigo-50 p-3 text-indigo-600"><Users className="h-5 w-5" /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Patient Directory</p>
                    <h3 className="text-xl font-extrabold text-slate-900">{stats.totalPatients}</h3>
                  </div>
                </div>
              </div>

              {/* Graphical Visualizations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Revenue Timeline */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Financial Statement</h3>
                    <h4 className="text-sm font-extrabold text-slate-900">Platform Fee Inflows over Time</h4>
                  </div>
                  {platformFeeByDate.length === 0 ? (
                    <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">Waiting for online platform fee payments to display inflows.</div>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={platformFeeByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="revenue" name="Platform Fees Collected (₹)" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Bookings timelines */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Capacity Monitoring</h3>
                    <h4 className="text-sm font-extrabold text-slate-900">Appointment Volumes by Calendar Date</h4>
                  </div>
                  {appointmentsByDate.length === 0 ? (
                    <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">Waiting for bookings metadata to build metrics.</div>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={appointmentsByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                          <Bar dataKey="count" name="Appointments Booked" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: Manage Clinician Availabilities */}
          {hospitalTab === 'availabilities' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2.5">
                On-Duty Management & Availability Scheduling
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-100">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold">
                      <th className="p-3">Specialist</th>
                      {/* Fees are not shown or set here — they are settled at the
                          clinic desk. The chamber is the useful column instead:
                          one consultant can appear several times, one row per
                          address. */}
                      <th className="p-3">Chamber</th>
                      <th className="p-3">Video Consults</th>
                      <th className="p-3">Duty Status</th>
                      <th className="p-3">Scheduled Slots</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {doctors.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900">{doc.name}</div>
                          <div className="text-[10px] text-slate-400">{doc.specialty}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{doc.area || doc.district || '—'}</div>
                          <div className="text-[10px] text-slate-400 max-w-[180px] truncate">{doc.hospital}</div>
                        </td>
                        <td className="p-3">
                          {doc.videoEnabled ? (
                            <span className="text-emerald-600 text-[10px] font-bold">Enabled</span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Disabled</span>
                          )}
                        </td>
                        <td className="p-3">
                          {doc.isActive ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-2 py-0.5 text-[9px] font-bold">ACTIVE</span>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 text-[9px] font-bold">ON LEAVE</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {doc.slots.map((s, i) => (
                              <span key={i} className="bg-slate-100 border border-slate-150 px-1 py-0.5 rounded text-[8px] text-slate-600 font-bold">{s}</span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setEditingAvailabilityDocId(doc.id);
                              setDoctorAvailabilityForm({
                                isActive: doc.isActive !== false,
                                videoEnabled: doc.videoEnabled !== false,
                                slots: [...doc.slots]
                              });
                            }}
                            className="bg-indigo-600 text-white rounded px-3 py-1.5 text-[10px] font-bold hover:bg-indigo-500 cursor-pointer"
                          >
                            Update Availability
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Availability Editor Modal / Block */}
              {editingAvailabilityDocId && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mt-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Adjusting Care Parameters: {doctors.find(d => d.id === editingAvailabilityDocId)?.name}</h4>
                    <button onClick={() => setEditingAvailabilityDocId(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">Close</button>
                  </div>

                  {/* No consultation fee field: the fee is agreed and collected
                      at the clinic, so it is not configurable from any screen. */}
                  <form onSubmit={handleUpdateAvailability} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">On-Duty / Active status</label>
                      <select
                        value={doctorAvailabilityForm.isActive ? "true" : "false"}
                        onChange={e => setDoctorAvailabilityForm(p => ({ ...p, isActive: e.target.value === "true" }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                      >
                        <option value="true">Active & Booking Available</option>
                        <option value="false">On Leave / Temp Blocked</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Telehealth Video consultations</label>
                      <select
                        value={doctorAvailabilityForm.videoEnabled ? "true" : "false"}
                        onChange={e => setDoctorAvailabilityForm(p => ({ ...p, videoEnabled: e.target.value === "true" }))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled (In-Person Only)</option>
                      </select>
                    </div>

                    {/* Submit */}
                    <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEditingAvailabilityDocId(null)}
                        className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-xs font-bold hover:bg-indigo-500 cursor-pointer"
                      >
                        Save Availability Settings
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: Onboard Specialist doctor */}
          {hospitalTab === 'add_doctor' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-3xl mx-auto space-y-4">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <PlusCircle className="h-4.5 w-4.5 text-indigo-600" /> Onboard New Specialty Clinician
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Everything on a doctor's record, so the directory, the map and the booking flow have
                  what they need from day one. Only the name and specialty are required.
                </p>
              </div>

              <form onSubmit={handleCreateDoctor} className="space-y-5">
                <AvatarPicker
                  name={newDoctorForm.name}
                  image={newDoctorForm.image}
                  onChange={dataUrl => setNewDoctorForm(p => ({ ...p, image: dataUrl }))}
                  label="Profile photograph"
                />

                {/* --- Identity --------------------------------------------- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Amit Ranjan"
                      required
                      value={newDoctorForm.name}
                      onChange={e => setNewDoctorForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Specialty *</label>
                    <input
                      type="text"
                      list="specialty-suggestions"
                      required
                      placeholder="e.g. Consultant Urologist & Uro-Oncologist"
                      value={newDoctorForm.specialty}
                      onChange={e => setNewDoctorForm(p => ({ ...p, specialty: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                    />
                    {/* Free text with suggestions: the old fixed <select> could not
                        express a title like "General Physician & Intensivist". */}
                    <datalist id="specialty-suggestions">
                      <option>Cardiologist</option>
                      <option>Dermatologist</option>
                      <option>General Physician</option>
                      <option>Neurologist</option>
                      <option>Orthopedic Surgeon</option>
                      <option>Pediatrician</option>
                      <option>Urologist</option>
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
                    <input
                      type="text"
                      placeholder="e.g. Urology"
                      value={newDoctorForm.department}
                      onChange={e => setNewDoctorForm(p => ({ ...p, department: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Years of Experience</label>
                    <input
                      type="number" min={0} max={70}
                      value={newDoctorForm.experienceYears}
                      onChange={e => setNewDoctorForm(p => ({ ...p, experienceYears: e.target.value ? Number(e.target.value) : '' }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* --- Chamber ---------------------------------------------- */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Consulting Chamber</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {([
                      { key: 'hospital', label: 'Clinic / Hospital', placeholder: 'e.g. Mimansa Urocare, Line Bazar' },
                      { key: 'clinicPhone', label: 'Reception Phone', placeholder: 'e.g. +91 70914 47506' },
                      { key: 'addressLine', label: 'Address Line', placeholder: 'e.g. Bihar Talkies Road' },
                      { key: 'landmark', label: 'Landmark', placeholder: 'e.g. Opposite Panchvati Hotel' },
                      { key: 'area', label: 'Area / Locality', placeholder: 'e.g. Line Bazar' },
                      { key: 'district', label: 'District', placeholder: 'e.g. Purnea' },
                      { key: 'state', label: 'State', placeholder: 'e.g. Bihar' },
                      { key: 'pincode', label: 'PIN Code', placeholder: 'e.g. 854301' },
                    ] as const).map(field => (
                      <div key={field.key} className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">{field.label}</label>
                        <input
                          type="text"
                          placeholder={field.placeholder}
                          value={newDoctorForm[field.key]}
                          onChange={e => setNewDoctorForm(p => ({ ...p, [field.key]: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                        />
                      </div>
                    ))}

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
                      <input
                        type="number" step="any" placeholder="e.g. 25.7802"
                        value={newDoctorForm.latitude}
                        onChange={e => setNewDoctorForm(p => ({ ...p, latitude: e.target.value ? Number(e.target.value) : '' }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
                      <input
                        type="number" step="any" placeholder="e.g. 87.4718"
                        value={newDoctorForm.longitude}
                        onChange={e => setNewDoctorForm(p => ({ ...p, longitude: e.target.value ? Number(e.target.value) : '' }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Coordinates are optional — leave them blank and the map thumbnail is simply skipped
                    rather than dropping a pin in the wrong place.
                  </p>
                </div>

                {/* --- Practice parameters ---------------------------------- */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Practice Parameters</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Consultation Fee</label>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 font-bold select-none">
                        Collected at the clinic desk
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Patients Per Slot</label>
                      <input
                        type="number" min={1} max={20}
                        value={newDoctorForm.maxSchedulesPerSlot}
                        onChange={e => setNewDoctorForm(p => ({ ...p, maxSchedulesPerSlot: Number(e.target.value) || 1 }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      OPD Slot Timings <span className="normal-case font-medium text-slate-400">(comma separated)</span>
                    </label>
                    <input
                      type="text"
                      value={newDoctorForm.slotsRaw}
                      onChange={e => setNewDoctorForm(p => ({ ...p, slotsRaw: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs pt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox" checked={newDoctorForm.videoEnabled}
                        onChange={e => setNewDoctorForm(p => ({ ...p, videoEnabled: e.target.checked }))}
                        className="h-4 w-4 accent-indigo-600 cursor-pointer"
                      />
                      Offers telehealth video consultations
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                      <input
                        type="checkbox" checked={newDoctorForm.isActive}
                        onChange={e => setNewDoctorForm(p => ({ ...p, isActive: e.target.checked }))}
                        className="h-4 w-4 accent-indigo-600 cursor-pointer"
                      />
                      Accepting patients
                    </label>
                  </div>
                </div>

                <div className="space-y-1 text-xs border-t border-slate-100 pt-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Professional Summary</label>
                  <textarea
                    rows={4}
                    placeholder="Qualifications, sub-specialties, registration number, procedures offered…"
                    value={newDoctorForm.bio}
                    onChange={e => setNewDoctorForm(p => ({ ...p, bio: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Onboard Specialist
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      )}

      {/* ==================== 4. ADMIN VIEWS ==================== */}
      {activePersona === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Hospital Setup details */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 h-fit">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
              <Building className="h-4.5 w-4.5 text-indigo-600" /> Hospital Metadata Setup
            </h3>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Hospital Name</label>
                  <input
                    type="text"
                    value={hospitalConfig.name}
                    onChange={e => setHospitalConfig(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Billing Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.001"
                    value={hospitalConfig.taxRate}
                    onChange={e => setHospitalConfig(p => ({ ...p, taxRate: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Hotline</label>
                  <input
                    type="text"
                    value={hospitalConfig.contactNumber}
                    onChange={e => setHospitalConfig(p => ({ ...p, contactNumber: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Global Address Location</label>
                  <input
                    type="text"
                    value={hospitalConfig.address}
                    onChange={e => setHospitalConfig(p => ({ ...p, address: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <p className="font-bold text-slate-700">Application Level Configurations</p>
                
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-150">
                  <div>
                    <p className="font-bold text-slate-800">Simulate Care SMS Triggers</p>
                    <p className="text-[10px] text-slate-400">Trigger patient notifications upon bookings or prescriptions</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hospitalConfig.enableSms}
                    onChange={e => setHospitalConfig(p => ({ ...p, enableSms: e.target.checked }))}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded-sm"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-150">
                  <div>
                    <p className="font-bold text-slate-800">Enable Telehealth WebRTC Rooms</p>
                    <p className="text-[10px] text-slate-400">Enable peer video consultations and diagnostic chat sessions</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hospitalConfig.enableTelehealth}
                    onChange={e => setHospitalConfig(p => ({ ...p, enableTelehealth: e.target.checked }))}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-5 py-2.5 text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Global Configuration
                </button>
              </div>
            </form>
          </div>

          {/* Maintenance Actions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 h-fit">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
              <ShieldAlert className="h-4.5 w-4.5 text-rose-600" /> Administrative Actions
            </h3>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              Maintain clinic storage arrays, seed testing clinical histories, reset parameters, or wipe clinical records safely.
            </p>

            <div className="pt-2">
              <button
                onClick={handleSystemReset}
                className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl py-3 text-xs font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="h-4 w-4" /> Purge & Seed System Databases
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ==================== MODALS & BILLING RECEIPTS ==================== */}

      {/* MODAL 1: Payment Gateways */}
      {payingAppointment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative space-y-5 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="h-4.5 w-4.5 text-indigo-600" /> SECURE ONLINE CHECKOUT
              </h3>
              <button onClick={() => setPayingAppointment(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>
            </div>

            {paymentSuccess ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                <p className="text-sm font-extrabold text-slate-800">CONSULTATION PAYMENT CLEARED</p>
                <p className="text-xs text-slate-400">Updating medical invoice database logs...</p>
              </div>
            ) : (
              <form onSubmit={handlePaySubmit} className="space-y-4 text-xs">
                {/* Financial breakdown — the platform fee is the entire bill
                    this app can settle; the consultation fee is not charged
                    online and so is not itemised, only noted. */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-150 space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Online slot booking (platform) fee:</span>
                    <span className="font-bold text-slate-700">₹{PLATFORM_FEE}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 font-extrabold text-slate-900">
                    <span>TOTAL AMOUNT PAYABLE:</span>
                    <span>₹{PLATFORM_FEE}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500 pt-1">
                    {DOCTOR_FEE_NOTE} — it is not collected here.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cardholder / Account Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Aarav Patel"
                      value={paymentForm.name}
                      onChange={e => setPaymentForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Card Number</label>
                    <input
                      type="text"
                      required
                      maxLength={16}
                      placeholder="4111 2222 3333 4444"
                      value={paymentForm.number}
                      onChange={e => setPaymentForm(p => ({ ...p, number: e.target.value.replace(/\D/g, '') }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Expiry Date</label>
                      <input
                        type="text"
                        required
                        maxLength={5}
                        placeholder="MM/YY"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">CVV</label>
                      <input
                        type="password"
                        required
                        maxLength={3}
                        placeholder="123"
                        value={paymentForm.cvv}
                        onChange={e => setPaymentForm(p => ({ ...p, cvv: e.target.value.replace(/\D/g, '') }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-bold transition-all mt-2 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="h-4 w-4" /> Pay Platform Fee Online (₹{PLATFORM_FEE})
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: Printable receipts */}
      {viewingReceiptAppointment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-6 animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            
            {/* Header controls */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 noprint">
              <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Patient Invoicing</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1.5 text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Bill
                </button>
                <button onClick={() => setViewingReceiptAppointment(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">Close</button>
              </div>
            </div>

            {/* Invoicing card */}
            <div className="border border-slate-200 rounded-xl p-6 space-y-6 text-xs text-slate-700 bg-white" id="invoice-sheet">
              {/* Receipt Header */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h4 className="text-base font-extrabold text-slate-900 leading-none">{hospitalConfig.name}</h4>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wide leading-tight">{hospitalConfig.address}</p>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wide">Hotline: {hospitalConfig.contactNumber}</p>
                </div>
                <div className="text-right space-y-1">
                  <span className="inline-flex rounded bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">PAID STATEMENT</span>
                  <p className="text-[10px] text-slate-400 mt-1">Receipt No: REC-{viewingReceiptAppointment.id.toUpperCase()}</p>
                </div>
              </div>

              {/* Patient / doctor records */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                <div className="space-y-1">
                  <p className="font-extrabold text-slate-900">Billed Patient Profile:</p>
                  <p className="font-bold text-indigo-600">{viewingReceiptAppointment.patientName}</p>
                  <p className="text-slate-400">Age / Gender: {viewingReceiptAppointment.patientAge} y/o</p>
                  <p className="text-slate-400">Contact: {viewingReceiptAppointment.patientContact}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="font-extrabold text-slate-900">Clinical Specialist Node:</p>
                  <p className="font-bold text-slate-800">{doctors.find(d => d.id === viewingReceiptAppointment.doctorId)?.name || "Medical Consultant"}</p>
                  <p className="text-slate-400">Specialty: {doctors.find(d => d.id === viewingReceiptAppointment.doctorId)?.specialty}</p>
                  <p className="text-slate-400">Date Billed: {viewingReceiptAppointment.paymentDate || "N/A"}</p>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between font-extrabold text-slate-900 bg-slate-50 p-2.5 rounded-lg">
                  <span>Description of Medical Care</span>
                  <span>Amount Paid</span>
                </div>
                {/* This receipt covers the online slot reservation only — the
                    consultation fee is billed by the clinic and never appears
                    on it, not even as a line item. */}
                <div className="flex items-center justify-between p-2.5">
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-800">Online slot booking (platform) fee</p>
                    <p className="text-[10px] text-slate-400">Appointment ID: {viewingReceiptAppointment.id}</p>
                  </div>
                  <span className="font-bold text-slate-800">₹{PLATFORM_FEE.toFixed(2)}</span>
                </div>
              </div>

              {/* Invoice Totals */}
              <div className="pt-4 border-t border-slate-100 flex flex-col items-end gap-1.5 pr-2.5">
                <div className="flex items-center gap-8 border-t border-slate-200 pt-2 font-extrabold text-sm text-slate-900">
                  <span>Total Bill Settled:</span>
                  <span>₹{PLATFORM_FEE.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-slate-400">{DOCTOR_FEE_NOTE}</p>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-dashed border-slate-200 text-center text-slate-400 text-[10px] space-y-1">
                <p className="font-bold text-slate-700">Thank you for choosing {hospitalConfig.name}.</p>
                <p>This is an automated valid system invoice and digital pay receipt.</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Submit Care Feedback */}
      {feedbackAppointment && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-4.5 w-4.5 text-indigo-600" /> Share Consultation Experience
              </h3>
              <button onClick={() => setFeedbackAppointment(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4 text-xs">
              <div className="space-y-2">
                <p className="font-bold text-slate-700">Rate your care experience with {doctors.find(d => d.id === feedbackAppointment.doctorId)?.name}:</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="p-1 cursor-pointer transition-transform hover:scale-110"
                    >
                      <Star className={`h-6 w-6 ${star <= feedbackRating ? "text-amber-500 fill-amber-500" : "text-slate-300"}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Clinician Evaluation & Comments</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Share details about the consultant's diagnostics, clarity, or bedside manner..."
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-bold transition-all cursor-pointer"
              >
                Submit Care Evaluation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Patient Register Modal */}
      {/* The `canRegisterPatientProfile` guard is the backstop: every button that
          opens this modal is already hidden under the single-profile policy, so
          this only matters if stale state survives a persona switch. */}
      {showRegisterPatient && canRegisterPatientProfile && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="h-4.5 w-4.5 text-indigo-600" /> Create Patient Account
              </h3>
              <button onClick={() => setShowRegisterPatient(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleRegisterPatientSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Patient Full Name</label>
                <input
                  type="text" required placeholder="Rohan Gupta"
                  value={registerPatientForm.name}
                  onChange={e => setRegisterPatientForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Age</label>
                  <input
                    type="number" required placeholder="32"
                    value={registerPatientForm.age}
                    onChange={e => setRegisterPatientForm(p => ({ ...p, age: Number(e.target.value) }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Gender</label>
                  <select
                    value={registerPatientForm.gender}
                    onChange={e => setRegisterPatientForm(p => ({ ...p, gender: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-binary</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Phone</label>
                <input
                  type="text" required placeholder="+91 98765 43210"
                  value={registerPatientForm.contact}
                  onChange={e => setRegisterPatientForm(p => ({ ...p, contact: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Contact Email</label>
                <input
                  type="email" placeholder="rohan.gupta@gmail.com"
                  value={registerPatientForm.email}
                  onChange={e => setRegisterPatientForm(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-bold text-rose-800">Known Allergies (Comma-separated)</label>
                <input
                  type="text" placeholder="Penicillin, Latex"
                  value={registerPatientForm.allergiesRaw}
                  onChange={e => setRegisterPatientForm(p => ({ ...p, allergiesRaw: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Initial Diagnostic Notes / Summary</label>
                <textarea
                  rows={2} placeholder="Known conditions, medications, or history logs..."
                  value={registerPatientForm.notes}
                  onChange={e => setRegisterPatientForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs outline-hidden focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-bold transition-all cursor-pointer"
              >
                Register & Select Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Patient Appointment Reminder Settings */}
      {reminderModalAppt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 border border-slate-200">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Bell className="h-4.5 w-4.5 text-indigo-600" /> Configure Appointment Reminder
              </h3>
              <button onClick={() => setReminderModalAppt(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-xs space-y-1">
              <p className="font-extrabold text-slate-900">
                Dr. {doctors.find(d => d.id === reminderModalAppt.doctorId)?.name} ({doctors.find(d => d.id === reminderModalAppt.doctorId)?.specialty})
              </p>
              <p className="text-slate-500">
                Slot: <span className="font-bold text-slate-800">{reminderModalAppt.date} at {reminderModalAppt.timeSlot}</span>
              </p>
            </div>

            <form onSubmit={handleSaveReminder} className="space-y-4 text-xs">
              
              {/* Frequency Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Alert Frequency / Lead Time</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: '15_min', label: '15 Mins Before' },
                    { id: '1_hour', label: '1 Hour Before' },
                    { id: '3_hours', label: '3 Hours Before' },
                    { id: '12_hours', label: '12 Hours Before' },
                    { id: '1_day', label: '1 Day Before' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setReminderForm(p => ({ ...p, frequency: item.id as any }))}
                      className={`p-2 rounded-lg border font-bold text-center transition-all cursor-pointer ${
                        reminderForm.frequency === item.id 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Channel */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Notification Delivery Channel</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'whatsapp', label: '💬 WhatsApp', desc: 'Instant WhatsApp message' },
                    { id: 'sms', label: '📱 SMS Text', desc: 'Direct mobile SMS alert' },
                    { id: 'email', label: '✉️ Email', desc: 'Cal-invite & PDF link' },
                    { id: 'push', label: '🔔 Browser Push', desc: 'Pop-up browser alert' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setReminderForm(p => ({ ...p, channel: item.id as any }))}
                      className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        reminderForm.channel === item.id
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-extrabold'
                          : 'bg-white border-slate-200 text-slate-700 font-medium hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[9px] text-slate-500">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Phone Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Mobile Contact Number</label>
                <input
                  type="text"
                  required
                  value={reminderForm.phone}
                  onChange={e => setReminderForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+91 98201 45678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Email Address Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Notification Email Address</label>
                <input
                  type="email"
                  required
                  value={reminderForm.email}
                  onChange={e => setReminderForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="patient@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReminderNotice(`Test alert sent to ${reminderForm.phone} via ${reminderForm.channel.toUpperCase()}!`);
                    setTimeout(() => setReminderNotice(''), 4000);
                  }}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg py-2.5 font-bold transition-all cursor-pointer text-center"
                >
                  Test Alert
                </button>

                <button
                  type="submit"
                  className="w-2/3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Check className="h-4 w-4" /> Save & Activate Alert
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
