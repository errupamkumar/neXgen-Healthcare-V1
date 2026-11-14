/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HeartPulse,
  Baby,
  Sparkles,
  Stethoscope,
  Bone,
  Flower2,
  Brain,
  Ear,
  Droplets,
  Eye,
  Smile,
  Activity,
  Pill,
  Microscope,
  type LucideIcon,
} from 'lucide-react';
import type { Appointment, Doctor } from '../types';
import { isFutureAppointment, todayLocal } from './appointments';

/** Only doctors who are taking bookings. Inactive rows stay in the data for history. */
export function bookableDoctors(doctors: Doctor[]): Doctor[] {
  return doctors.filter(d => d.isActive !== false);
}

/** Department → icon, matched on keywords so new departments still get a sensible glyph. */
const DEPARTMENT_ICONS: Array<[RegExp, LucideIcon]> = [
  [/cardio|heart/i, HeartPulse],
  [/pediatric|paediatric|child/i, Baby],
  [/derma|skin|cosmet/i, Sparkles],
  [/ortho|bone|joint|spine/i, Bone],
  [/gyn|obstet|women/i, Flower2],
  [/neuro|brain/i, Brain],
  [/ent|otolaryng|ear/i, Ear],
  [/uro|kidney|nephro/i, Droplets],
  [/eye|ophthal/i, Eye],
  [/dent|oral/i, Smile],
  [/patho|lab/i, Microscope],
  [/psych|mental/i, Activity],
  [/pharm/i, Pill],
];

export function departmentIcon(department?: string): LucideIcon {
  if (!department) return Stethoscope;
  for (const [pattern, icon] of DEPARTMENT_ICONS) {
    if (pattern.test(department)) return icon;
  }
  return Stethoscope;
}

/** "Dr. Rajesh Sharma" → "RS". */
export function doctorInitials(name: string): string {
  return (
    name
      .replace(/^Dr\.?\s*/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'Dr'
  );
}

/** YYYY-MM-DD for today + offset days, in the local calendar. */
export function dateOffset(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayLocal(d);
}

export type UiLang = 'en' | 'hi';

/** Locale for Intl date formatting in each UI language. */
export function localeOf(lang: UiLang = 'en'): string {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

/** "Wed, 5 Aug" — or "बुध, 5 अग॰" in Hindi. */
export function friendlyDate(iso: string, lang: UiLang = 'en'): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Today" / "Tomorrow" / "Wed, 5 Aug" */
export function relativeDay(iso: string, lang: UiLang = 'en'): string {
  if (iso === todayLocal()) return lang === 'hi' ? 'आज' : 'Today';
  if (iso === dateOffset(1)) return lang === 'hi' ? 'कल' : 'Tomorrow';
  return friendlyDate(iso, lang);
}

/** Seats already taken for a doctor's slot (cancelled bookings free their seat). */
export function bookedCount(appointments: Appointment[], doctorId: string, date: string, slot: string): number {
  return appointments.filter(
    a => a.doctorId === doctorId && a.date === date && a.timeSlot === slot && a.status !== 'cancelled'
  ).length;
}

export interface NextSlot {
  date: string;
  slot: string;
  seatsLeft: number;
}

/**
 * The first slot from now that still has a seat, looking `horizonDays` ahead.
 * Drives the "Next available: Today, 05:00 PM" line on every doctor card.
 */
export function nextAvailableSlot(
  doctor: Doctor,
  appointments: Appointment[],
  horizonDays = 14
): NextSlot | null {
  if (doctor.isActive === false || !doctor.slots?.length) return null;
  const sortedSlots = [...doctor.slots].sort((a, b) => slotMinutes(a) - slotMinutes(b));
  for (let i = 0; i < horizonDays; i++) {
    const date = dateOffset(i);
    for (const slot of sortedSlots) {
      if (!isFutureAppointment({ date, timeSlot: slot })) continue;
      const left = (doctor.maxSchedulesPerSlot || 1) - bookedCount(appointments, doctor.id, date, slot);
      if (left > 0) return { date, slot, seatsLeft: left };
    }
  }
  return null;
}

function slotMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((slot || '').trim());
  if (!m) return 24 * 60;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
}

/** Morning / Afternoon / Evening — how patients actually think about OPD timings. */
export function slotPeriod(slot: string): 'Morning' | 'Afternoon' | 'Evening' {
  const minutes = slotMinutes(slot);
  if (minutes < 12 * 60) return 'Morning';
  if (minutes < 16 * 60) return 'Afternoon';
  return 'Evening';
}

export function sortSlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => slotMinutes(a) - slotMinutes(b));
}

/** Unique, sorted departments actually offered by the doctors on file. */
export function departmentsOf(doctors: Doctor[]): string[] {
  return Array.from(new Set(doctors.map(d => d.department).filter(Boolean) as string[])).sort();
}

/** Time left until an appointment, in friendly words: "in 2 days", "in 3 h 20 min". */
export function timeUntil(target: Date, now: Date = new Date(), lang: UiLang = 'en'): string {
  const hi = lang === 'hi';
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return hi ? 'अभी' : 'now';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return hi ? `${minutes} मिनट में` : `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    if (hi) return rest ? `${hours} घंटे ${rest} मिनट में` : `${hours} घंटे में`;
    return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
  }
  const days = Math.round(hours / 24);
  if (hi) return `${days} दिन में`;
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
