/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Appointment, Doctor, PatientHistory } from '../types';

export interface ConsultationData {
  notes?: string;
  prescriptions?: string[];
  diagnosis?: string;
  advice?: string;
}

/**
 * Renders a consultation into the printable prescription the patient downloads.
 *
 * Shared deliberately: the doctor's review dialog and the copy written to the
 * vault both call this, so what is previewed is exactly what is saved.
 */
export function buildPrescriptionText(
  appt: Appointment,
  doctor: Doctor | undefined,
  patient: PatientHistory | undefined,
  data: ConsultationData,
  issuedOn: Date = new Date()
): string {
  const today = issuedOn.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rx = (data.prescriptions || []).map((p, i) => `${i + 1}. ${p}`).join('\n');

  return [
    'neXgen MULTISPECIALTY HEALTHCARE INSTITUTE',
    doctor?.hospital || 'Plot 12, Sector 18, Dwarka, New Delhi — 110075',
    '',
    'PRESCRIPTION',
    `Date: ${today}${appt.bookingNo ? `    Booking: ${appt.bookingNo}` : ''}`,
    '',
    `Patient: ${appt.patientName}, ${appt.patientAge} yrs${patient?.gender ? `, ${patient.gender}` : ''}`,
    `Contact: ${appt.patientContact}${patient?.abhaId ? `    ABHA: ${patient.abhaId}` : ''}`,
    `Consultant: ${doctor?.name || 'Consultant'}${doctor?.specialty ? `, ${doctor.specialty}` : ''}`,
    `Mode: ${appt.type === 'video' ? 'Video consultation' : 'In-person OPD visit'}`,
    '',
    data.diagnosis ? `DIAGNOSIS:\n${data.diagnosis}\n` : '',
    data.notes ? `CLINICAL NOTES:\n${data.notes}\n` : '',
    rx ? `Rx:\n${rx}\n` : '',
    patient?.allergies?.length ? `KNOWN ALLERGIES:\n${patient.allergies.join(', ')}\n` : '',
    data.advice ? `ADVICE & FOLLOW-UP:\n${data.advice}\n` : '',
    '---',
    `Issued by ${doctor?.name || 'Consultant'} via neXgen Healthcare on ${today}.`,
    'This is a digitally generated prescription and is valid without a signature.',
  ]
    .filter(seg => seg !== '')
    .join('\n');
}
