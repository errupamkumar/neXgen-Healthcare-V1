/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side runtime configuration, sourced from .env.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so a missing variable is
 * `undefined` rather than an error — every reader below therefore carries the
 * same default that .env.example documents. Parsing happens once, at module
 * load, so a malformed value fails loudly in the console instead of silently
 * changing behaviour deep inside a render.
 */

const env = import.meta.env;

function readBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  console.warn(`[config] Expected a boolean, got "${raw}". Falling back to ${fallback}.`);
  return fallback;
}

function readNumber(raw: string | undefined, fallback: number, min?: number, max?: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.warn(`[config] Expected a number, got "${raw}". Falling back to ${fallback}.`);
    return fallback;
  }
  if (min !== undefined && parsed < min) return min;
  if (max !== undefined && parsed > max) return max;
  return parsed;
}

function readString(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value ? value : fallback;
}

function readEnum<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const value = raw?.trim().toLowerCase() as T | undefined;
  if (value && allowed.includes(value)) return value;
  if (value) {
    console.warn(`[config] "${raw}" is not one of ${allowed.join(' | ')}. Falling back to ${fallback}.`);
  }
  return fallback;
}

/**
 * Patient portal profile policy.
 *
 * `singleProfile` locks a signed-in patient to exactly one profile — their own.
 * With it on, the family-profile switchers disappear from the patient pages and
 * every "Register Patient" / "Add Patient" / "Register New Profile" action is
 * withdrawn, along with the registration modal behind them.
 *
 * Scope: the *patient* persona only. The front desk and admin consoles keep
 * full patient-directory access, since registering patients is a clinic desk
 * function rather than something a patient does to themselves.
 *
 * `bookingUsesLoggedInPatient` is the same policy applied to the booking flow:
 * a signed-in patient books for themselves, so the "Who is this appointment
 * for?" picker — saved profiles, "Someone new", and the name / age / mobile
 * fields — is replaced by their own profile. Kept separate from
 * `singleProfile` so the booking form can be opened up on its own if a patient
 * ever needs to book for a relative while the portal stays single-profile.
 */
export const patientPortalConfig = {
  singleProfile: readBool(env.VITE_SINGLE_PATIENT_PROFILE, true),
  bookingUsesLoggedInPatient: readBool(env.VITE_BOOKING_USE_LOGGED_IN_PATIENT, true),
} as const;

/**
 * Sign-in and self-registration.
 *
 * There is no auth server behind this build — sign-in matches against the demo
 * accounts and the patient directory in the browser. `demoOtp` is therefore a
 * fixed code every mobile number accepts, printed on screen so a tester can get
 * through the OTP flow without an SMS gateway.
 *
 * It is a TEST FIXTURE, not a security control. Wiring a real gateway means
 * moving verification server-side; this constant then goes away rather than
 * being changed to something secret.
 */
export const authConfig = {
  demoOtp: readString(env.VITE_DEMO_OTP, '123456'),
  otpLoginEnabled: readBool(env.VITE_OTP_LOGIN_ENABLED, true),
  selfRegistrationEnabled: readBool(env.VITE_PATIENT_SELF_REGISTRATION, true),
} as const;

/**
 * What a signed-in doctor sees in their own console.
 *
 * `hideRecordsMenu` withdraws the whole "Records" rail group — Clinical
 * Patients and the Document Vault — from the doctor persona. A doctor still
 * reaches everything clinically relevant through their appointment queue, where
 * the selected patient's history, documents and past visits are already shown
 * in context. Front desk and admin keep the Records group either way.
 *
 * `landOnDashboard` opens the doctor's session on their KPI dashboard rather
 * than their profile page.
 */
export const doctorPortalConfig = {
  hideRecordsMenu: readBool(env.VITE_DOCTOR_HIDE_RECORDS_MENU, true),
  landOnDashboard: readBool(env.VITE_DOCTOR_LAND_ON_DASHBOARD, true),
} as const;

/**
 * How the doctor directory behaves on step 1 of booking.
 *
 * `requireSearch` is the switch behind "don't show anyone until I search" — the
 * directory opens on a prompt rather than a full dump of every doctor on file.
 */
export const doctorDirectoryConfig = {
  requireSearch: readBool(env.VITE_DOCTOR_LIST_REQUIRE_SEARCH, true),
  minSearchChars: readNumber(env.VITE_DOCTOR_SEARCH_MIN_CHARS, 2, 1, 10),
  revealOnFilter: readBool(env.VITE_DOCTOR_REVEAL_ON_FILTER, true),
  /** 0 disables the cap. */
  maxResults: readNumber(env.VITE_DOCTOR_MAX_RESULTS, 24, 0),
} as const;

/** Map thumbnail / map-view settings for clinic locations. */
export const mapConfig = {
  enabled: readBool(env.VITE_DOCTOR_MAP_ENABLED, true),
  // 19 is the deepest zoom the standard OSM tile set renders.
  zoom: readNumber(env.VITE_DOCTOR_MAP_ZOOM, 16, 3, 19),
  linkProvider: readEnum(env.VITE_DOCTOR_MAP_LINK_PROVIDER, ['google', 'osm'] as const, 'google'),
  tileUrl: readString(env.VITE_MAP_TILE_URL, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  attribution: readString(env.VITE_MAP_TILE_ATTRIBUTION, '© OpenStreetMap contributors'),
} as const;

export type MapLinkProvider = (typeof mapConfig)['linkProvider'];
