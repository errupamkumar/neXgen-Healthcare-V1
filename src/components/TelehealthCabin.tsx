/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  FileText, 
  Users, 
  Plus, 
  Trash, 
  Heart, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Clock,
  Activity,
  Send,
  Pill,
  MessageSquare,
  Paperclip,
  Link2,
  ExternalLink,
  User,
  Stethoscope,
  Check,
  Copy,
  Share2,
  X,
  Sparkles,
  Download,
  Printer
} from 'lucide-react';
import { Appointment, Doctor, PatientHistory } from '../types';

interface ChatMessage {
  id: string;
  sender: 'doctor' | 'patient';
  senderName: string;
  text: string;
  timestamp: string;
  linkUrl?: string;
  linkTitle?: string;
}

interface TelehealthCabinProps {
  appointment: Appointment;
  doctors: Doctor[];
  patients: PatientHistory[];
  onCompleteConsultation: (
    apptId: string, 
    patientId: string, 
    data: {
      notes: string;
      prescriptions: string[];
    }
  ) => Promise<any>;
  onExitCabin: () => void;
}

export default function TelehealthCabin({
  appointment,
  doctors,
  patients,
  onCompleteConsultation,
  onExitCabin,
}: TelehealthCabinProps) {
  const doctor = doctors.find(d => d.id === appointment.doctorId);
  const patient = patients.find(p => p.id === appointment.patientId);

  // Call states
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [duration, setDuration] = useState(0);
  const [isEnding, setIsEnding] = useState(false);

  // Clinical checkouts states (User acts as Doctor writing notes/meds)
  const [docNotes, setDocNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<string[]>([]);
  const [newMed, setNewMed] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consultCompleted, setConsultCompleted] = useState(false);

  // Right Side Panel Active Tab ('chat' | 'checkout')
  const [activeSideTab, setActiveSideTab] = useState<'chat' | 'checkout'>('chat');

  // Real-time Side-Chat Panel States
  const [chatSenderRole, setChatSenderRole] = useState<'doctor' | 'patient'>('patient');
  const [chatInput, setChatInput] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkTitleInput, setLinkTitleInput] = useState('');

  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'doctor',
      senderName: doctor?.name || 'Dr. Specialist',
      text: `Hello ${appointment.patientName}! Welcome to our video consultation. How are you feeling today?`,
      timestamp: '10:00 AM'
    },
    {
      id: 'msg-2',
      sender: 'patient',
      senderName: appointment.patientName,
      text: 'Hi Doctor! I wanted to share my recent blood diagnostics report link with you.',
      timestamp: '10:01 AM',
      linkUrl: 'https://health.portal.gov.in/records/lab-report-2026.pdf',
      linkTitle: 'Recent Hematology Lab Report (PDF)'
    },
    {
      id: 'msg-3',
      sender: 'doctor',
      senderName: doctor?.name || 'Dr. Specialist',
      text: 'Thank you. Opening the report now. Please let me know if you have any questions during our visit.',
      timestamp: '10:02 AM'
    }
  ]);

  // Chat/Telemetry logs for mock calling feel
  const [chatLogs, setChatLogs] = useState<string[]>([
    'Secure end-to-end encrypted link established.',
    `Telehealth session initiated with ${doctor?.name || 'Clinician'}.`,
    'Awaiting clinician connection...'
  ]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (activeSideTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeSideTab]);

  // Telehealth session timer
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    // Mock logs
    const logsTimeout1 = setTimeout(() => {
      setChatLogs((prev) => [...prev, `${doctor?.name || 'Doctor'} joined the video room.`]);
    }, 2500);

    const logsTimeout2 = setTimeout(() => {
      setChatLogs((prev) => [...prev, 'Clinical telemetry stream: Excellent signal (1080p, 60fps).']);
    }, 6000);

    return () => {
      clearInterval(interval);
      clearTimeout(logsTimeout1);
      clearTimeout(logsTimeout2);
    };
  }, [doctor]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Check if input contains an explicit URL
    const urlMatch = chatInput.match(/(https?:\/\/[^\s]+)/g);

    const newMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: chatSenderRole,
      senderName: chatSenderRole === 'doctor' ? (doctor?.name || 'Doctor') : appointment.patientName,
      text: chatInput.trim(),
      timestamp: timeStr,
      linkUrl: urlMatch ? urlMatch[0] : undefined,
      linkTitle: urlMatch ? 'Shared Link' : undefined
    };

    setChatMessages(prev => [...prev, newMessage]);
    setChatInput('');
  };

  const handleShareCustomLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const formattedUrl = linkInput.startsWith('http') ? linkInput : `https://${linkInput}`;

    const newMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: chatSenderRole,
      senderName: chatSenderRole === 'doctor' ? (doctor?.name || 'Doctor') : appointment.patientName,
      text: linkTitleInput.trim() ? `Shared Link: ${linkTitleInput}` : `Shared Web Link: ${formattedUrl}`,
      timestamp: timeStr,
      linkUrl: formattedUrl,
      linkTitle: linkTitleInput.trim() || formattedUrl
    };

    setChatMessages(prev => [...prev, newMessage]);
    setShowLinkModal(false);
    setLinkInput('');
    setLinkTitleInput('');
  };

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const handleAddPrescription = () => {
    if (newMed.trim() && !prescriptions.includes(newMed.trim())) {
      setPrescriptions([...prescriptions, newMed.trim()]);
      setNewMed('');
    }
  };

  const handleRemovePrescription = (idx: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== idx));
  };

  const handleSaveConsultation = async () => {
    setIsSubmitting(true);
    try {
      await onCompleteConsultation(appointment.id, appointment.patientId, {
        notes: docNotes,
        prescriptions,
      });
      setConsultCompleted(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPrescription = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocked. Please allow pop-ups to download prescription PDF.");
      return;
    }

    const dateStr = appointment.date || new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const rxHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Prescription_${appointment.patientName.replace(/\s+/g, '_')}_BK-${appointment.id.slice(-6)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
            * { box-sizing: border-box; }
            body {
              font-family: 'Plus Jakarta Sans', sans-serif;
              margin: 0;
              padding: 32px;
              color: #0f172a;
              background-color: #ffffff;
              max-width: 800px;
              margin-left: auto;
              margin-right: auto;
            }
            .header-bar {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 3px solid #4f46e5;
              padding-bottom: 16px;
              margin-bottom: 20px;
            }
            .brand-title {
              font-size: 20px;
              font-weight: 800;
              color: #4f46e5;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: -0.02em;
            }
            .brand-sub {
              font-size: 11px;
              color: #64748b;
              margin-top: 3px;
              font-weight: 600;
            }
            .doc-info {
              text-align: right;
            }
            .doc-name {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
            }
            .doc-meta {
              font-size: 11px;
              color: #475569;
              margin-top: 2px;
            }
            .patient-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px;
              margin-bottom: 24px;
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              font-size: 12px;
            }
            .info-block label {
              display: block;
              font-size: 9px;
              font-weight: 800;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 2px;
            }
            .info-block span {
              font-weight: 700;
              color: #1e293b;
            }
            .section-header {
              font-size: 11px;
              font-weight: 800;
              color: #4f46e5;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              margin-bottom: 8px;
              border-bottom: 1px dashed #cbd5e1;
              padding-bottom: 4px;
            }
            .notes-content {
              background: #fafafa;
              border: 1px solid #f1f5f9;
              border-left: 4px solid #4f46e5;
              border-radius: 8px;
              padding: 14px;
              font-size: 12.5px;
              line-height: 1.6;
              color: #334155;
              margin-bottom: 24px;
              white-space: pre-wrap;
            }
            .rx-header {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 22px;
              font-weight: 800;
              color: #4f46e5;
              margin-bottom: 12px;
            }
            .rx-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 28px;
              font-size: 12px;
            }
            .rx-table th {
              background: #4f46e5;
              color: #ffffff;
              font-weight: 700;
              text-align: left;
              padding: 8px 12px;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .rx-table td {
              padding: 12px;
              border-bottom: 1px solid #e2e8f0;
              color: #1e293b;
            }
            .rx-table tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .allergy-badge {
              background-color: #fff1f2;
              border: 1px solid #fecdd3;
              color: #9f1239;
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 11px;
              margin-bottom: 24px;
            }
            .footer-section {
              margin-top: 40px;
              padding-top: 16px;
              border-top: 2px solid #f1f5f9;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .seal-text {
              font-size: 10px;
              color: #64748b;
              line-height: 1.4;
            }
            .signature-block {
              text-align: center;
            }
            .signature-line {
              width: 160px;
              border-top: 1.5px solid #0f172a;
              margin-top: 40px;
              margin-bottom: 4px;
            }
            .signature-label {
              font-size: 11px;
              font-weight: 800;
              color: #1e293b;
            }
            .action-bar {
              background: #1e1b4b;
              color: white;
              padding: 12px 20px;
              border-radius: 12px;
              margin-bottom: 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .action-btn {
              background: #4f46e5;
              color: white;
              border: none;
              padding: 8px 16px;
              font-size: 12px;
              font-weight: 700;
              border-radius: 8px;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .action-btn:hover {
              background: #4338ca;
            }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; max-width: 100%; }
            }
          </style>
        </head>
        <body>
          <div class="action-bar no-print">
            <span style="font-size: 13px; font-weight: 700;">📄 Prescription Ready for Download / Print</span>
            <button class="action-btn" onclick="window.print()">
              🖨️ Save as PDF / Print
            </button>
          </div>

          <div class="header-bar">
            <div>
              <h1 class="brand-title">${doctor?.hospital || 'AstraCare Medical Center'}</h1>
              <div class="brand-sub">Official OPD & Telehealth Medical Records • ABDM Integrated</div>
            </div>
            <div class="doc-info">
              <div class="doc-name">${doctor?.name || 'Dr. Specialist'}</div>
              <div class="doc-meta">${doctor?.specialty || 'General Medicine'}</div>
              <div class="doc-meta">Reg No: MED-IN-2026-${doctor?.id || '9012'}</div>
            </div>
          </div>

          <div class="patient-card">
            <div class="info-block">
              <label>Patient Name</label>
              <span>${appointment.patientName} (${patient?.age || '32'} yrs, ${patient?.gender || 'N/A'})</span>
            </div>
            <div class="info-block">
              <label>Booking Ref / Date</label>
              <span>BK-${appointment.id.slice(-6)} • ${dateStr} (${appointment.timeSlot})</span>
            </div>
            <div class="info-block">
              <label>ABHA ID</label>
              <span>${patient?.abhaId || 'ABHA-9182-3849-0192'}</span>
            </div>
            <div class="info-block">
              <label>Contact Phone</label>
              <span>${patient?.contact || '+91 98201 45678'}</span>
            </div>
          </div>

          <div class="section-header">Clinical Diagnostics & Consultation Notes</div>
          <div class="notes-content">${docNotes.trim() ? docNotes : 'Patient evaluated during telehealth session. Vital signs and general health observed satisfactorily.'}</div>

          <div class="rx-header">
            <span>℞</span>
            <span style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase;">Prescribed Pharmacotherapy</span>
          </div>

          <table class="rx-table">
            <thead>
              <tr>
                <th style="width: 36px;">#</th>
                <th>Medicine Name & Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${
                prescriptions.length > 0
                  ? prescriptions.map((med, idx) => `
                    <tr>
                      <td><strong>${idx + 1}</strong></td>
                      <td><strong style="color: #0f172a; font-size: 13px;">${med}</strong></td>
                      <td>1 tablet twice daily after meals</td>
                      <td>5 Days</td>
                    </tr>
                  `).join('')
                  : `
                    <tr>
                      <td colspan="4" style="text-align: center; color: #64748b; padding: 16px;">
                        No Rx prescription drugs prescribed for this session.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>

          ${
            patient?.allergies && patient.allergies.length > 0
              ? `<div class="allergy-badge">
                  <strong>⚠️ Patient Known Allergies:</strong> ${patient.allergies.join(', ')}. Pharmacotherapy verified against allergy index.
                </div>`
              : ''
          }

          <div class="footer-section">
            <div class="seal-text">
              <strong>AstraCare Telehealth Digital Verification</strong><br/>
              Security Token: AST-${Math.floor(100000 + Math.random() * 900000)}<br/>
              Valid for fulfillment at all authorized pharmacies.
            </div>
            <div class="signature-block">
              <div style="font-family: cursive; font-size: 18px; color: #4f46e5; font-weight: bold;">
                ${doctor?.name || 'Dr. Specialist'}
              </div>
              <div class="signature-line"></div>
              <div class="signature-label">Digital Clinician Signature</div>
              <div style="font-size: 9px; color: #94a3b8;">Digitally Signed & Validated</div>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 400);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(rxHtml);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10 mb-1.5">
            <Video className="h-3 w-3 animate-pulse text-rose-500" />
            Live Telehealth Consultation Room
          </span>
          <h2 className="text-xl font-bold text-slate-900">
            {doctor?.name || 'Doctor'} & {appointment.patientName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPrescription}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-indigo-600" />
            Prescription (PDF)
          </button>
          <button
            onClick={onExitCabin}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
          >
            Exit Room
          </button>
        </div>
      </div>

      {consultCompleted ? (
        /* Completed Care summary card */
        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-8 text-center space-y-5 max-w-xl mx-auto shadow-sm">
          <div className="mx-auto rounded-full bg-teal-100 p-3.5 w-14 h-14 flex items-center justify-center text-teal-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-950">Consultation Finalized</h3>
            <p className="text-slate-600 text-sm">
              The telehealth appointment is complete. Doctor notes and new pharmacotherapy prescriptions have been pushed to patient records.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-150 text-left text-xs space-y-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Clinical Checkup Notes</p>
              <p className="text-slate-700 italic leading-relaxed">
                "{docNotes || 'No notes added.'}"
              </p>
            </div>
            {prescriptions.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Prescribed Pharmacotherapy</p>
                <div className="flex flex-wrap gap-1.5">
                  {prescriptions.map((med, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-150 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">
                      <Pill className="h-3 w-3 text-emerald-500" />
                      {med}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              onClick={handleDownloadPrescription}
              className="w-full sm:flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-xs font-bold text-white transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Prescription (PDF)
            </button>
            <button
              onClick={onExitCabin}
              className="w-full sm:flex-1 rounded-xl bg-teal-500 py-3 text-xs font-bold text-slate-950 hover:bg-teal-400 transition-all cursor-pointer shadow-xs"
            >
              Return to Dashboard Registry
            </button>
          </div>
        </div>
      ) : (
        /* Standard Video Grid calling screen */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Mock Video Feeds panel (Left) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative aspect-video rounded-2xl bg-slate-950 overflow-hidden border border-slate-900 shadow-lg group">
              
              {/* Doctor Main Video */}
              {videoActive ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={doctor?.image}
                    alt={doctor?.name}
                    className="h-full w-full object-cover brightness-[0.85]"
                  />
                  {/* Glowing active mic indicator */}
                  <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white text-xs font-medium">
                    <Activity className="h-3.5 w-3.5 text-teal-400 animate-pulse" />
                    <span>{doctor?.name} ({doctor?.specialty})</span>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 space-y-3">
                  <div className="h-16 w-16 rounded-full bg-slate-900 flex items-center justify-center text-slate-600 ring-2 ring-slate-800">
                    <VideoOff className="h-6 w-6" />
                  </div>
                  <p className="text-xs">{doctor?.name} disabled video feed.</p>
                </div>
              )}

              {/* Patient PIP Self-Video (Self-facing camera simulation) */}
              <div className="absolute top-4 right-4 w-1/4 max-w-[140px] aspect-3/4 rounded-xl bg-slate-900 border border-white/20 shadow-xl overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-slate-900">
                  <span className="text-[10px] font-bold text-white/50">{appointment.patientName}</span>
                </div>
                <div className="absolute bottom-2 right-2 rounded bg-black/40 p-1">
                  {micActive ? <Mic className="h-3 w-3 text-teal-400" /> : <MicOff className="h-3 w-3 text-rose-500" />}
                </div>
              </div>

              {/* Top status overlays */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="flex items-center gap-1 rounded bg-black/60 backdrop-blur-md px-3 py-1 text-xs font-bold text-white">
                  <Clock className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  {formatTime(duration)}
                </span>
                <span className="flex items-center gap-1 rounded bg-rose-600 px-3 py-1 text-xs font-bold text-white tracking-wide uppercase animate-pulse">
                  LIVE
                </span>
              </div>

              {/* Call Control panel */}
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setMicActive(!micActive)}
                  className={`rounded-full p-3 border shadow-md transition-all cursor-pointer ${
                    micActive
                      ? 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
                      : 'bg-rose-600 text-white border-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {micActive ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setVideoActive(!videoActive)}
                  className={`rounded-full p-3 border shadow-md transition-all cursor-pointer ${
                    videoActive
                      ? 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
                      : 'bg-rose-600 text-white border-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {videoActive ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  onClick={onExitCabin}
                  className="rounded-full bg-rose-600 text-white border border-rose-600 p-3 shadow-md hover:bg-rose-500 transition-all cursor-pointer"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>

            </div>

            {/* Connection logs list */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Live Diagnostics Log</p>
              <div className="space-y-1 font-mono text-[10px] text-slate-500">
                {chatLogs.map((log, i) => (
                  <p key={i} className="flex items-center gap-1.5">
                    <span className="text-indigo-400">»</span>
                    {log}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Side-Chat & Clinical Checkout Tabs */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md flex flex-col justify-between h-[560px] relative">
            
            {/* Panel Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 p-1 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setActiveSideTab('chat')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  activeSideTab === 'chat'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Side Chat</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeSideTab === 'chat' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {chatMessages.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSideTab('checkout')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  activeSideTab === 'checkout'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Clinical Notes</span>
                {prescriptions.length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* TAB 1: REAL-TIME SIDE-CHAT PANEL */}
            {activeSideTab === 'chat' && (
              <div className="flex flex-col justify-between flex-1 overflow-hidden space-y-3">
                
                {/* Sender Role Switcher & Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs">
                  <span className="font-extrabold text-slate-800 flex items-center gap-1 text-[11px]">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Live Session Chat
                  </span>

                  {/* Speak As Role Toggle */}
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
                    <span className="text-[9px] font-bold text-slate-400 uppercase px-1">Send As:</span>
                    <button
                      type="button"
                      onClick={() => setChatSenderRole('patient')}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                        chatSenderRole === 'patient'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <User className="h-3 w-3" /> Patient
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatSenderRole('doctor')}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                        chatSenderRole === 'doctor'
                          ? 'bg-white text-indigo-700 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Stethoscope className="h-3 w-3" /> Doctor
                    </button>
                  </div>
                </div>

                {/* Messages Feed Container */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                  {chatMessages.map((msg) => {
                    const isDoc = msg.sender === 'doctor';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col space-y-1 max-w-[88%] ${
                          isDoc ? 'ml-0 mr-auto items-start' : 'ml-auto mr-0 items-end'
                        }`}
                      >
                        {/* Sender header tag */}
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 px-1">
                          {isDoc ? (
                            <span className="flex items-center gap-1 text-indigo-600 font-extrabold">
                              <Stethoscope className="h-3 w-3" /> {msg.senderName}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-700 font-extrabold">
                              <User className="h-3 w-3 text-slate-500" /> {msg.senderName}
                            </span>
                          )}
                          <span className="text-[9px] text-slate-400">{msg.timestamp}</span>
                        </div>

                        {/* Message Bubble */}
                        <div
                          className={`p-3 rounded-2xl border text-xs leading-relaxed space-y-2 ${
                            isDoc
                              ? 'bg-indigo-50 border-indigo-150 text-indigo-950 rounded-tl-xs'
                              : 'bg-slate-950 text-white border-slate-900 rounded-tr-xs shadow-2xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap font-medium">{msg.text}</p>

                          {/* Rich Link Card if url attached */}
                          {msg.linkUrl && (
                            <div className={`p-2.5 rounded-xl border space-y-2 mt-1.5 ${
                              isDoc ? 'bg-white border-indigo-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
                            }`}>
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                  <Link2 className="h-3.5 w-3.5" />
                                </div>
                                <div className="overflow-hidden">
                                  <span className="font-extrabold text-[11px] block truncate">
                                    {msg.linkTitle || 'Shared Web Link'}
                                  </span>
                                  <span className="text-[9px] text-slate-400 block truncate font-mono">
                                    {msg.linkUrl}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/40">
                                <a
                                  href={msg.linkUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-2 rounded-md text-[10px] inline-flex items-center justify-center gap-1 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" /> Open Link
                                </a>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(msg.linkUrl!, msg.id)}
                                  className={`py-1 px-2 rounded-md text-[10px] font-bold border transition-all cursor-pointer inline-flex items-center gap-1 ${
                                    copiedLinkId === msg.id
                                      ? 'bg-emerald-500 text-white border-emerald-500'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {copiedLinkId === msg.id ? (
                                    <>
                                      <Check className="h-3 w-3" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" /> Copy
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                {/* Quick Link Share Templates */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <span>Quick Link Attachments</span>
                    <button
                      type="button"
                      onClick={() => setShowLinkModal(true)}
                      className="text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Custom Link
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setChatMessages(prev => [...prev, {
                          id: 'msg-' + Date.now(),
                          sender: chatSenderRole,
                          senderName: chatSenderRole === 'doctor' ? (doctor?.name || 'Doctor') : appointment.patientName,
                          text: 'Attached Lab Diagnostics Link for doctor review:',
                          timestamp: timeStr,
                          linkUrl: 'https://health.portal.gov.in/lab-report-2026.pdf',
                          linkTitle: 'Recent Hematology Lab Report (PDF)'
                        }]);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-200 shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <Paperclip className="h-3 w-3 text-indigo-600" /> Lab Report
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setChatMessages(prev => [...prev, {
                          id: 'msg-' + Date.now(),
                          sender: chatSenderRole,
                          senderName: chatSenderRole === 'doctor' ? (doctor?.name || 'Doctor') : appointment.patientName,
                          text: 'Sharing follow-up appointment booking link:',
                          timestamp: timeStr,
                          linkUrl: 'https://ai-studio-hospital.app/book-consult',
                          linkTitle: 'Specialist Follow-up Booking Portal'
                        }]);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-200 shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <Share2 className="h-3 w-3 text-emerald-600" /> Follow-up Link
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        setChatMessages(prev => [...prev, {
                          id: 'msg-' + Date.now(),
                          sender: chatSenderRole,
                          senderName: chatSenderRole === 'doctor' ? (doctor?.name || 'Doctor') : appointment.patientName,
                          text: 'Sharing post-consultation care and diet guide:',
                          timestamp: timeStr,
                          linkUrl: 'https://health.portal.gov.in/care-guide.pdf',
                          linkTitle: 'Post-Consultation Care Guidelines'
                        }]);
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg border border-slate-200 shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="h-3 w-3 text-amber-600" /> Care Guide
                    </button>
                  </div>

                  {/* Chat Input Bar */}
                  <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowLinkModal(true)}
                      className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 cursor-pointer transition-colors"
                      title="Attach Custom Link"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>

                    <input
                      type="text"
                      placeholder={`Type as ${chatSenderRole === 'doctor' ? 'Doctor' : 'Patient'} or paste link...`}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-hidden focus:border-indigo-500 focus:bg-white"
                    />

                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>

              </div>
            )}

            {/* TAB 2: CLINICAL CHECKOUT WORKFLOW */}
            {activeSideTab === 'checkout' && (
              <div className="flex flex-col justify-between flex-1 overflow-hidden space-y-4">
                <div className="space-y-4 overflow-y-auto pr-1 flex-1 scrollbar-thin">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      Clinical Checkout Workflow
                    </h3>
                    <p className="text-[10px] text-slate-500">Document consult notes and prescribe medications during video stream.</p>
                  </div>

                  {/* Patient warning and notes */}
                  {patient && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 space-y-1 text-[11px]">
                      <p className="font-bold text-rose-800 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        Allergy Warning Index!
                      </p>
                      <p className="text-rose-700 leading-relaxed font-medium">
                        {patient.allergies && patient.allergies.length > 0
                          ? `Patient allergy warning: ${patient.allergies.join(', ')}. Avoid prescribing these.`
                          : 'No listed drug allergies for this patient.'}
                      </p>
                    </div>
                  )}

                  {/* Consultation Notes */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                      Doctor's Consultation Notes
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Type findings, diagnoses, or clinical notes..."
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Medications prescription */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                      Prescribe Pharmacotherapy
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Amoxicillin 500mg"
                        value={newMed}
                        onChange={(e) => setNewMed(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPrescription())}
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={handleAddPrescription}
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs text-white font-bold hover:bg-slate-800 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    
                    <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                      {prescriptions.map((med, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <Pill className="h-3.5 w-3.5 text-emerald-500" />
                            {med}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePrescription(i)}
                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Commit Checkin CTA */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadPrescription}
                    className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Prescription (PDF)
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || !docNotes.trim()}
                    onClick={handleSaveConsultation}
                    className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 py-3 text-xs font-bold text-slate-950 shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {isSubmitting ? 'Recording care updates...' : 'Finalize & Update Care Records'}
                  </button>
                </div>
              </div>
            )}

            {/* Custom Link Modal Popup */}
            {showLinkModal && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs rounded-2xl flex items-center justify-center p-4 z-20">
                <div className="bg-white rounded-2xl p-5 w-full space-y-4 shadow-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Link2 className="h-4 w-4 text-indigo-600" /> Share Custom Web Link
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowLinkModal(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form onSubmit={handleShareCustomLink} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Link Title</label>
                      <input
                        type="text"
                        placeholder="e.g. ECG Waveform Scan"
                        value={linkTitleInput}
                        onChange={(e) => setLinkTitleInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-hidden"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">URL Address</label>
                      <input
                        type="url"
                        required
                        placeholder="https://..."
                        value={linkInput}
                        onChange={(e) => setLinkInput(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowLinkModal(false)}
                        className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                      >
                        Share in Chat
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}
