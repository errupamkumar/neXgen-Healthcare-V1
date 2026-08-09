/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  department?: string;
  state?: string;
  district?: string;
  image: string;
  rating: number;
  hospital: string;
  bio: string;
  videoEnabled: boolean;
  slots: string[]; // e.g. ["09:00 AM", "10:00 AM", "11:00 AM", "02:00 PM", "03:00 PM", "04:00 PM"]
  maxSchedulesPerSlot: number; // e.g. 3
  fee?: number;
  isActive?: boolean;
  experienceYears?: number;

  // --- Consulting location -------------------------------------------------
  // The same doctor can hold OPD at more than one chamber, so each Doctor row
  // carries its own address. Name alone is NOT a unique identifier in the
  // directory — the address is what tells two "Dr. Rajesh Sharma" rows apart.
  /** Street / building line, e.g. "Shop 14, First Floor, Sinha Complex, Line Bazar". */
  addressLine?: string;
  /** Nearby landmark patients actually navigate by, e.g. "Opposite Sadar Hospital main gate". */
  landmark?: string;
  /** Locality or area within the district, e.g. "Line Bazar". */
  area?: string;
  /** e.g. "854301" */
  pincode?: string;
  /** Decimal degrees (WGS84) — drives the pin-pointed map thumbnail. */
  latitude?: number;
  longitude?: number;
  /** Optional override for the "Open in Maps" link (a Plus Code or share URL). */
  mapUrl?: string;
  /** Reception / chamber phone number shown alongside the address. */
  clinicPhone?: string;
}

export interface PatientHistory {
  id: string;
  name: string;
  email: string;
  age: number;
  gender: string;
  contact: string;
  /** Optional profile photograph. Falls back to initials wherever it is absent. */
  image?: string;
  allergies: string[];
  medications: string[];
  medicalConditions: string[];
  notes: string;
  abhaId?: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
}

export interface MedicalDocument {
  id: string;
  patientId: string;
  title: string;
  category: 'Lab Report' | 'Prescription' | 'Referral' | 'Vaccine Card' | 'Other';
  uploadDate: string;
  fileName: string;
  fileSize: string;
  fileContentText: string; // The text content of the document (entered or OCR'd)
  analysis?: {
    summary: string;
    keyFindings: string[];
    extractedAllergies: string[];
    extractedMedications: string[];
    suggestedFollowUp: string;
    riskLevel: 'Low' | 'Medium' | 'High';
    analyzedAt: string;
  };
}

/**
 * What the doctor recorded when they closed a consultation.
 *
 * Kept on the appointment rather than flattened into the patient's notes field,
 * so each visit stays a discrete, dated record: which doctor, at which chamber,
 * what was found and what was prescribed. The patient profile renders these as
 * a visit history.
 */
export interface ConsultationRecord {
  /** ISO timestamp stamped by the server when the consultation was closed. */
  completedAt: string;
  doctorId: string;
  doctorName?: string;
  specialty?: string;
  /** The chamber the visit actually happened at — doctors sit at several. */
  chamber?: string;
  chamberArea?: string;
  diagnosis?: string;
  notes?: string;
  advice?: string;
  prescriptions: string[];
  /**
   * Who actually closed the visit.
   *
   * The front desk may mark an appointment completed — a patient was seen and
   * has left — but it may not record a diagnosis, advice or prescription. A
   * record closed by the desk is therefore an ADMINISTRATIVE close, and the
   * completed-visit card says so rather than presenting an empty clinical note
   * as though the consultant had written nothing.
   */
  closedByRole?: 'doctor' | 'hospital' | 'admin';
  closedByName?: string;
}

export interface Appointment {
  id: string;
  bookingNo?: string;
  doctorId: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "10:00 AM"
  status: 'scheduled' | 'completed' | 'cancelled' | 'active-video';
  type: 'visiting' | 'video';
  patientName: string;
  patientAge: number;
  patientContact: string;
  notes: string;
  documentIds?: string[];
  isRevisit?: boolean;
  previousBookingId?: string;
  uploadedReportNames?: string[];
  prescriptionNames?: string[];
  feePaid?: boolean;
  amountPaid?: number;
  baseFee?: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount?: number;
  paymentMethod?: string;
  paymentDate?: string;
  feedbackRating?: number;
  feedbackText?: string;
  invoiceAmount?: number;
  /** Present once the doctor has closed this consultation. */
  consultation?: ConsultationRecord;
}

export interface WaitlistEntry {
  id: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  patientContact: string;
  date: string;
  timeSlot: string;
  type: 'visiting' | 'video';
  status: 'waiting' | 'notified' | 'claimed' | 'expired';
  createdAt: string;
  notifiedAt?: string;
}

export interface InAppNotification {
  id: string;
  patientId?: string;
  patientName?: string;
  title: string;
  message: string;
  doctorId: string;
  doctorName?: string;
  date: string;
  timeSlot: string;
  type?: 'slot_available' | 'appointment' | 'system';
  timestamp: string;
  read: boolean;
  waitlistId?: string;
}

/* ==========================================================================
   Front-desk outbound messaging
   ========================================================================== */

/**
 * Where a desk message is pushed.
 *
 * `portal` is the only channel this build actually delivers — it lands in the
 * patient's Messages inbox. Email / SMS / WhatsApp are SIMULATED: the send is
 * recorded against the recipient with the address it would have gone to, but
 * nothing leaves the box. Swapping in a real gateway means replacing
 * `simulateDelivery()` in server.ts and nothing else.
 */
export type MessageChannel = 'portal' | 'email' | 'sms' | 'whatsapp';

/** Why the desk is writing. Drives the badge colour and the default subject. */
export type MessageCategory = 'delay' | 'reschedule' | 'closure' | 'general';

/** How the desk chose who to write to. Kept so the outbox can explain a send. */
export type MessageAudience = 'all' | 'selected' | 'doctor-day';

/** One channel attempt against one recipient. */
export interface MessageDelivery {
  channel: MessageChannel;
  /**
   * `skipped` is not a failure — it means the patient has no address on file
   * for that channel, which the desk needs to see so they can phone instead.
   */
  status: 'sent' | 'skipped';
  /** Where it went ("+91 98765 43210"), or why it could not go. */
  detail: string;
  at: string;
}

export interface MessageRecipient {
  patientId: string;
  patientName: string;
  contact?: string;
  email?: string;
  deliveries: MessageDelivery[];
  /** ISO timestamp the patient opened it in the portal. Absent = unread. */
  readAt?: string;
}

export interface DeskMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'hospital' | 'admin';
  audience: MessageAudience;
  /** Human-readable audience, e.g. "Dr Rajesh Sharma · 2026-08-09 (7 booked)". */
  audienceLabel: string;
  category: MessageCategory;
  subject: string;
  body: string;
  channels: MessageChannel[];
  sentAt: string;
  recipients: MessageRecipient[];
}

export interface HospitalConfig {
  name: string;
  address: string;
  taxRate: number;
  contactNumber: string;
  enableSms: boolean;
  enableTelehealth: boolean;
}

export interface LoggedInUser {
  role: 'patient' | 'doctor' | 'hospital' | 'admin';
  id: string;
  name: string;
  email: string;
  specialty?: string;
}

export interface AppState {
  doctors: Doctor[];
  patients: PatientHistory[];
  documents: MedicalDocument[];
  appointments: Appointment[];
}
