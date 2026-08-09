/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * When an appointment actually starts, and whether that is still ahead of us.
 *
 * Every "upcoming" list in the app used to compare dates alone, so a 09:00 slot
 * stayed "upcoming" at six in the evening. These helpers compare the whole
 * moment — date *and* slot time — so a booking drops out of every upcoming list
 * the minute its slot begins, in the patient, doctor and front-desk portals
 * alike.
 */

/**
 * Today in the clinic's LOCAL calendar, as YYYY-MM-DD.
 *
 * The obvious way to write this — `new Date().toISOString().split('T')[0]` — is
 * wrong, and was the bug behind "today's appointment shows under Upcoming":
 * toISOString converts to UTC *first*. East of Greenwich (IST is UTC+05:30)
 * every local moment between midnight and 05:30 reports YESTERDAY's date, so a
 * booking dated today failed `date === today` and passed `date >= today` —
 * dropping out of Today and into Upcoming.
 *
 * Reading getFullYear/getMonth/getDate keeps the key on the same calendar the
 * person looking at the screen is on. Appointment dates are stored as plain
 * local calendar days, so this is the only correct way to compare against them.
 */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Minimal shape needed to place an appointment on a clock. */
interface Slotted {
  date: string; // YYYY-MM-DD
  timeSlot: string; // "09:00 AM"
  status?: string;
}

/** "09:00 AM" -> 540. Returns NaN when the slot cannot be read. */
export function slotToMinutes(slot: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((slot || '').trim());
  if (!m) return Number.NaN;
  let hours = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) hours += 12;
  return hours * 60 + parseInt(m[2], 10);
}

/**
 * The local wall-clock moment the appointment begins.
 *
 * An unreadable slot falls back to the very end of its day rather than to
 * midnight: a booking with a malformed time should stay listed for the whole of
 * its date instead of vanishing the moment that date starts.
 */
export function appointmentStart(appt: Slotted): Date {
  const start = new Date(`${appt.date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Date(0);

  const minutes = slotToMinutes(appt.timeSlot);
  start.setMinutes(Number.isNaN(minutes) ? 23 * 60 + 59 : minutes);
  return start;
}

/** True while the slot is still ahead of `now`. */
export function isFutureAppointment(appt: Slotted, now: Date = new Date()): boolean {
  return appointmentStart(appt).getTime() > now.getTime();
}

/**
 * Upcoming = still booked AND yet to begin.
 *
 * Cancelled and completed bookings are never upcoming however far in the future
 * they sit; a live video consultation is in progress, not upcoming.
 */
export function isUpcomingAppointment(appt: Slotted, now: Date = new Date()): boolean {
  if (appt.status && appt.status !== 'scheduled') return false;
  return isFutureAppointment(appt, now);
}

/** Soonest first. Use for any upcoming list. */
export function byStartTimeAscending(a: Slotted, b: Slotted): number {
  return appointmentStart(a).getTime() - appointmentStart(b).getTime();
}
