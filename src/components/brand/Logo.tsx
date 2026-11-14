/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId } from 'react';
import { HeartPulse, Stethoscope, Building2, ShieldCheck } from 'lucide-react';
import type { LoggedInUser } from '../../types';

export type BrandRole = LoggedInUser['role'];

/**
 * One identity, four faces.
 *
 * The mark is the same everywhere — a rounded tile holding a medical cross
 * whose arm runs on into a heartbeat, with a coral "spark" in the corner (the
 * ₹50 booking that gets you seen). Each role gets its own gradient and a small
 * badge, so a doctor, a receptionist and an administrator can tell at a glance
 * which console they are in, while it still reads as one product.
 */
export const ROLE_THEME: Record<
  BrandRole,
  {
    label: string;
    tagline: string;
    stops: [string, string, string];
    accent: string;
    soft: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  }
> = {
  patient: {
    label: 'Patient',
    tagline: 'Care',
    stops: ['#1f57e0', '#1a7ee6', '#14b19b'],
    accent: '#14b19b',
    soft: 'rgba(20, 177, 155, 0.16)',
    icon: HeartPulse,
  },
  doctor: {
    label: 'Doctor',
    tagline: 'Clinic',
    stops: ['#0f3fb5', '#1f57e0', '#3dbdec'],
    accent: '#5f8ff8',
    soft: 'rgba(95, 143, 248, 0.18)',
    icon: Stethoscope,
  },
  hospital: {
    label: 'Front Desk',
    tagline: 'Desk',
    stops: ['#c2410c', '#f97316', '#fbbf24'],
    accent: '#fb923c',
    soft: 'rgba(251, 146, 60, 0.18)',
    icon: Building2,
  },
  admin: {
    label: 'Admin',
    tagline: 'Control',
    stops: ['#4c1d95', '#7c3aed', '#c084fc'],
    accent: '#a78bfa',
    soft: 'rgba(167, 139, 250, 0.18)',
    icon: ShieldCheck,
  },
};

/** What each role's workspace is called under the wordmark. */
const CONSOLE_NAME: Record<BrandRole, string> = {
  patient: 'Patient Portal',
  doctor: 'Doctor Console',
  hospital: 'Front Desk',
  admin: 'Admin Console',
};

const PUBLIC_STOPS: [string, string, string] = ['#1f57e0', '#1a7ee6', '#14b19b'];

interface LogoMarkProps {
  size?: number;
  role?: BrandRole;
  /** Show the small role badge at the corner of the tile. */
  showBadge?: boolean;
  className?: string;
}

export function LogoMark({ size = 40, role, showBadge = true, className = '' }: LogoMarkProps) {
  const gradientId = useId().replace(/:/g, '');
  const theme = role ? ROLE_THEME[role] : null;
  const stops = theme?.stops ?? PUBLIC_STOPS;
  const BadgeIcon = theme?.icon;
  const badgeSize = Math.round(size * 0.46);

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="neXgen Healthcare">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={stops[0]} />
            <stop offset="0.55" stopColor={stops[1]} />
            <stop offset="1" stopColor={stops[2]} />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
        {/* soft inner highlight for depth */}
        <rect x="1.5" y="1.5" width="45" height="22" rx="12.5" fill="#fff" opacity="0.10" />
        <path
          d="M17 13.5v21M8.5 24h12l3.2-6.5 4.6 13 3.4-6.5H39.5"
          fill="none"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="37.5" cy="11" r="3.6" fill="#ff7c5e" stroke="#fff" strokeWidth="1.6" />
      </svg>

      {theme && showBadge && BadgeIcon && size >= 28 && (
        <span
          aria-hidden="true"
          className="absolute flex items-center justify-center rounded-full bg-white shadow-sm ring-2 ring-white"
          style={{
            width: badgeSize,
            height: badgeSize,
            right: -Math.round(size * 0.14),
            bottom: -Math.round(size * 0.14),
          }}
        >
          <BadgeIcon style={{ width: badgeSize * 0.62, height: badgeSize * 0.62, color: stops[1] }} />
        </span>
      )}
    </span>
  );
}

interface LogoProps {
  role?: BrandRole;
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  /** Put the role name under the wordmark instead of "Healthcare". */
  showRoleLabel?: boolean;
  className?: string;
}

const SIZES = {
  sm: { mark: 32, word: 'text-[16px]', sub: 'text-[8.5px]' },
  md: { mark: 38, word: 'text-[19px]', sub: 'text-[9px]' },
  lg: { mark: 48, word: 'text-[24px]', sub: 'text-[10px]' },
};

/** Mark + wordmark. "neXgen", with the X picked out in the brand gradient. */
export default function Logo({ role, tone = 'light', size = 'md', showRoleLabel = false, className = '' }: LogoProps) {
  const s = SIZES[size];
  const isDark = tone === 'dark';
  const theme = role ? ROLE_THEME[role] : null;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={s.mark} role={role} />
      <span className="leading-none">
        <span
          className={`block font-sans font-extrabold tracking-tight ${s.word} ${isDark ? 'text-white' : 'text-slate-900'}`}
        >
          ne
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(135deg, ${theme ? theme.stops[1] : '#1f57e0'}, ${theme ? theme.stops[2] : '#14b19b'})`,
            }}
          >
            X
          </span>
          gen
        </span>
        <span
          className={`mt-1 block font-sans font-semibold uppercase tracking-[0.22em] ${s.sub}`}
          style={{ color: showRoleLabel && theme ? theme.accent : isDark ? 'rgba(255,255,255,0.55)' : '#5a6a85' }}
        >
          {showRoleLabel && role ? CONSOLE_NAME[role] : 'Healthcare'}
        </span>
      </span>
    </span>
  );
}
