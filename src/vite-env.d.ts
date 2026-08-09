/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />

/**
 * Every client-visible setting from .env. Declaring them here means a typo in
 * src/config.ts is a compile error rather than a silently-undefined value at
 * runtime. All values arrive as strings — parsing lives in src/config.ts.
 */
interface ImportMetaEnv {
  readonly VITE_DEMO_OTP?: string;
  readonly VITE_OTP_LOGIN_ENABLED?: string;
  readonly VITE_PATIENT_SELF_REGISTRATION?: string;
  readonly VITE_SINGLE_PATIENT_PROFILE?: string;
  readonly VITE_BOOKING_USE_LOGGED_IN_PATIENT?: string;
  readonly VITE_DOCTOR_HIDE_RECORDS_MENU?: string;
  readonly VITE_DOCTOR_LAND_ON_DASHBOARD?: string;
  readonly VITE_DOCTOR_LIST_REQUIRE_SEARCH?: string;
  readonly VITE_DOCTOR_SEARCH_MIN_CHARS?: string;
  readonly VITE_DOCTOR_REVEAL_ON_FILTER?: string;
  readonly VITE_DOCTOR_MAX_RESULTS?: string;
  readonly VITE_DOCTOR_MAP_ENABLED?: string;
  readonly VITE_DOCTOR_MAP_ZOOM?: string;
  readonly VITE_DOCTOR_MAP_LINK_PROVIDER?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
