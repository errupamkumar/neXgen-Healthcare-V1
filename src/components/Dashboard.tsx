/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Calendar, 
  Users, 
  FileText, 
  Video, 
  ArrowRight, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Activity,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  X,
  Share2,
  QrCode,
  Copy,
  Check,
  Download,
  ExternalLink,
  Printer,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Appointment, Doctor, PatientHistory, MedicalDocument } from '../types';
import { isUpcomingAppointment, byStartTimeAscending } from '../lib/appointments';
import DoctorBooking from './DoctorBooking';

interface DashboardProps {
  appointments: Appointment[];
  doctors: Doctor[];
  patients: PatientHistory[];
  documents: MedicalDocument[];
  onNavigate: (tab: string) => void;
  onJoinVideo: (appointment: Appointment) => void;
  onCancelAppointment: (id: string) => void;
  onBookAppointment: (bookingData: any) => Promise<any>;
}

// Helper to parse date and timeSlot into a Date object
function parseApptDateTime(dateStr: string, timeSlotStr: string): Date | null {
  if (!dateStr) return null;
  const cleanDate = dateStr.split('T')[0];
  let hours = 9;
  let minutes = 0;
  if (timeSlotStr) {
    const match = timeSlotStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      hours = parseInt(match[1], 10);
      minutes = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    }
  }
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

// Helper to determine if an appointment is within the next 2 hours
function getUrgentBadgeInfo(dateStr: string, timeSlotStr: string): {
  isWithin2Hours: boolean;
  badgeLabel: string;
} {
  const target = parseApptDateTime(dateStr, timeSlotStr);
  if (!target) return { isWithin2Hours: false, badgeLabel: '' };

  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  const isToday =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  // If appointment is within -30 mins (in progress) to +120 mins (2 hours from now)
  if (diffMinutes >= -30 && diffMinutes <= 120) {
    if (diffMinutes > 0) {
      return { isWithin2Hours: true, badgeLabel: `In ${diffMinutes}m (Next 2 Hours)` };
    } else {
      return { isWithin2Hours: true, badgeLabel: 'Starting Now / In Progress' };
    }
  }

  // If appointment date is today's date
  if (isToday) {
    return { isWithin2Hours: true, badgeLabel: 'Starting Soon (Today)' };
  }

  return { isWithin2Hours: false, badgeLabel: '' };
}

export default function Dashboard({
  appointments,
  doctors,
  patients,
  documents,
  onNavigate,
  onJoinVideo,
  onCancelAppointment,
  onBookAppointment,
}: DashboardProps) {
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [shareModalAppt, setShareModalAppt] = useState<Appointment | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Stats
  const activePatients = patients.length;
  const totalAppointments = appointments.filter(a => a.status !== 'cancelled').length;
  // Upcoming means the slot is still ahead of the clock, not merely today or
  // later — see src/lib/appointments.ts.
  const upcomingAppointments = appointments
    .filter(a => isUpcomingAppointment(a))
    .sort(byStartTimeAscending);
  const totalDocuments = documents.length;
  const analyzedDocs = documents.filter(d => d.analysis).length;

  const imminentAppointments = upcomingAppointments.filter(
    a => getUrgentBadgeInfo(a.date, a.timeSlot).isWithin2Hours
  );

  const getDoctorName = (docId: string) => {
    const doc = doctors.find(d => d.id === docId);
    return doc ? doc.name : 'Unknown Doctor';
  };

  const getDoctorSpecialty = (docId: string) => {
    const doc = doctors.find(d => d.id === docId);
    return doc ? doc.specialty : '';
  };

  // Format date nicely
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-xl space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400 ring-1 ring-inset ring-teal-500/20">
            <Activity className="h-3.5 w-3.5" />
            Clinical Management Suite
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Clinical Portal & Care Center</h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Centralized appointment schedules, patients medical histories, dynamic slot booking tracking, and AI-powered document intelligence.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('book')}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm hover:bg-teal-400 transition-all cursor-pointer"
            >
              <Calendar className="h-4 w-4" />
              Book Appointment
            </button>
            <button
              onClick={() => onNavigate('patients')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Add Patient Profile
            </button>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-teal-400 via-indigo-900 to-transparent pointer-events-none"></div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-lg bg-teal-50 dark:bg-teal-950/60 p-3 text-teal-600 dark:text-teal-400">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Bookings</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalAppointments}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/60 p-3 text-indigo-600 dark:text-indigo-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Patients On-File</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{activePatients}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 p-3 text-emerald-600 dark:text-emerald-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Document Vault</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{totalDocuments}</h3>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex items-center gap-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/60 p-3 text-amber-600 dark:text-amber-400">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">AI Analyzed Files</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{analyzedDocs} <span className="text-xs font-normal text-slate-400 dark:text-slate-500">/ {totalDocuments}</span></h3>
          </div>
        </div>
      </div>

      {/* Two Columns */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Appointments Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upcoming Appointments</h2>
            <button 
              onClick={() => onNavigate('book')} 
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 cursor-pointer"
            >
              Book New <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {/* Urgent 2-Hour Alert Notification Banner */}
          {imminentAppointments.length > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-indigo-500/10 border border-rose-300 dark:border-rose-900/60 p-4 flex items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-500 text-white rounded-xl animate-pulse shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <span className="font-extrabold text-rose-700 dark:text-rose-300 text-sm block">
                    ⚡ {imminentAppointments.length} {imminentAppointments.length === 1 ? 'Appointment' : 'Appointments'} Scheduled Within Next 2 Hours!
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Please prepare patient files or join telehealth video room on time.
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            {upcomingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 dark:text-slate-500 space-y-3">
                <Calendar className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm">No scheduled appointments found.</p>
                <button
                  onClick={() => onNavigate('book')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-medium"
                >
                  Create your first booking
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcomingAppointments.map((appt) => {
                  const badgeInfo = getUrgentBadgeInfo(appt.date, appt.timeSlot);
                  return (
                    <div 
                      key={appt.id} 
                      className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        badgeInfo.isWithin2Hours 
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70 dark:hover:bg-rose-950/30' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{appt.patientName}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">• Age {appt.patientAge}</span>
                          
                          {/* 2-Hour Imminent Appointment Visual Badge */}
                          {badgeInfo.isWithin2Hours && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 px-2.5 py-0.5 text-[10px] font-extrabold border border-rose-200 dark:border-rose-800 animate-pulse shadow-2xs">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                              </span>
                              <Clock className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                              <span>{badgeInfo.badgeLabel}</span>
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {getDoctorName(appt.doctorId)} <span className="text-slate-400 dark:text-slate-500">({getDoctorSpecialty(appt.doctorId)})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                            <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                            {formatDate(appt.date)}
                          </span>
                          <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                            <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                            {appt.timeSlot}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            appt.type === 'video' 
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-600/10' 
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/10'
                          }`}>
                            {appt.type === 'video' ? 'Video Consult' : 'In-Person Visit'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                        {appt.type === 'video' && (
                          <button
                            onClick={() => onJoinVideo(appt)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/80 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900 transition-all cursor-pointer border border-teal-200 dark:border-teal-800"
                          >
                            <Video className="h-3.5 w-3.5" />
                            Join Video
                          </button>
                        )}
                        <button
                          onClick={() => setShareModalAppt(appt)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/80 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900 transition-all cursor-pointer border border-sky-200 dark:border-sky-800 shadow-2xs"
                        >
                          <QrCode className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                          <span>Share QR</span>
                        </button>
                        <button
                          onClick={() => setRescheduleAppt(appt)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-all cursor-pointer border border-indigo-200 dark:border-indigo-800 shadow-2xs"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Reschedule</span>
                        </button>
                        <button
                          onClick={() => onCancelAppointment(appt.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-600 dark:hover:text-rose-400 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Insights Column */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Health Insights</h2>
          
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
            {documents.filter(d => d.analysis).length === 0 ? (
              <div className="text-center py-6 text-slate-400 dark:text-slate-500 space-y-2">
                <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm">No medical records analyzed yet.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto">Upload and analyze lab reports, prescriptions, or files using Gemini AI in the Documents section.</p>
                <button
                  onClick={() => onNavigate('documents')}
                  className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                >
                  Analyze reports now
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recent AI Extractions</p>
                {documents.filter(d => d.analysis).slice(0, 2).map((doc) => (
                  <div key={doc.id} className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{doc.title}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                        doc.analysis?.riskLevel === 'High' 
                          ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 ring-1 ring-inset ring-rose-600/10'
                          : doc.analysis?.riskLevel === 'Medium'
                          ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/10'
                          : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/10'
                      }`}>
                        {doc.analysis?.riskLevel} Alert
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic">
                      "{doc.analysis?.summary}"
                    </p>
                    {doc.analysis?.extractedMedications && doc.analysis.extractedMedications.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        <span className="text-slate-400 dark:text-slate-500 font-medium">Meds:</span>
                        {doc.analysis.extractedMedications.map((med, i) => (
                          <span key={i} className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px]">
                            {med}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => onNavigate('documents')}
                  className="w-full text-center text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold block pt-2 border-t border-slate-100 dark:border-slate-800 cursor-pointer"
                >
                  View All Analyzed Records
                </button>
              </div>
            )}
          </div>

          {/* Quick Doctor cards for booking */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Featured Care Specialists</h3>
            <div className="space-y-2.5">
              {doctors.slice(0, 2).map(doc => (
                <div key={doc.id} className="flex items-center gap-3">
                  <img src={doc.image} alt={doc.name} className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-100 dark:ring-slate-800" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{doc.specialty} • {doc.hospital}</p>
                  </div>
                  <button
                    onClick={() => onNavigate('book')}
                    className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-500 cursor-pointer"
                  >
                    Book
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal Overlay */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 md:p-6 my-8 max-h-[90vh] overflow-y-auto">
            <DoctorBooking
              doctors={doctors}
              patients={patients}
              initialAppointment={rescheduleAppt}
              onCloseModal={() => setRescheduleAppt(null)}
              onBookAppointment={async (bookingData) => {
                if (rescheduleAppt) {
                  await onCancelAppointment(rescheduleAppt.id);
                }
                const res = await onBookAppointment(bookingData);
                return res;
              }}
            />
          </div>
        </div>
      )}

      {/* Share Booking Link & Check-In QR Modal Overlay */}
      {shareModalAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-sky-100 dark:border-slate-800 p-6 space-y-6 my-8 animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  <QrCode className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Share Booking Link & Check-In QR</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fast-track OPD queue check-in pass for patient</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShareModalAppt(null);
                  setCopiedLink(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Appointment Summary Box */}
            <div className="bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/50 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-sky-900 dark:text-sky-200 text-sm">{shareModalAppt.patientName}</span>
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-200 dark:bg-sky-900 text-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-800">
                  {shareModalAppt.tokenNo || `Token #BK-${shareModalAppt.id.slice(-4)}`}
                </span>
              </div>
              <div className="text-slate-600 dark:text-slate-300 flex items-center justify-between">
                <span>Doctor: <strong className="text-slate-800 dark:text-slate-100">{getDoctorName(shareModalAppt.doctorId)}</strong></span>
                <span className="text-slate-500">{getDoctorSpecialty(shareModalAppt.doctorId)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 pt-1 border-t border-sky-200/60 dark:border-sky-900/40">
                <span className="flex items-center gap-1 font-medium"><Calendar className="h-3.5 w-3.5 text-sky-600" /> {formatDate(shareModalAppt.date)}</span>
                <span className="flex items-center gap-1 font-medium"><Clock className="h-3.5 w-3.5 text-sky-600" /> {shareModalAppt.timeSlot}</span>
              </div>
            </div>

            {/* Centered QR Code */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
              <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-200 inline-block">
                <QRCodeSVG
                  value={`${window.location.origin}/?action=checkin&id=${shareModalAppt.id}&bookingNo=${encodeURIComponent(shareModalAppt.bookingNo || shareModalAppt.id)}`}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium text-center max-w-xs">
                Scan this QR code at hospital OPD registration desk or kiosk for instant queue verification.
              </p>
            </div>

            {/* Direct Booking Link Copy Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Shareable Patient Check-In Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/?action=checkin&id=${shareModalAppt.id}&bookingNo=${encodeURIComponent(shareModalAppt.bookingNo || shareModalAppt.id)}`}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 font-mono focus:outline-none"
                />
                <button
                  onClick={() => {
                    const checkInUrl = `${window.location.origin}/?action=checkin&id=${shareModalAppt.id}&bookingNo=${encodeURIComponent(shareModalAppt.bookingNo || shareModalAppt.id)}`;
                    navigator.clipboard.writeText(checkInUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  className="shrink-0 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Hello ${shareModalAppt.patientName}, here is your OPD appointment booking pass and check-in QR code for ${getDoctorName(shareModalAppt.doctorId)} on ${shareModalAppt.date} at ${shareModalAppt.timeSlot}: ${window.location.origin}/?action=checkin&id=${shareModalAppt.id}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Share2 className="h-4 w-4" />
                <span>Share via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print Check-In Pass</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
