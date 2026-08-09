/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Money model for the whole application.
 *
 * The platform fee is the ONLY amount this app quotes, collects or prints. A
 * doctor's consultation fee is settled in person at the clinic desk: it never
 * appears on a screen, an invoice or a receipt, and no screen can configure it.
 * The figure still exists on the Doctor record for the clinic's own back-office
 * use, but treat it as write-once data, not something to render.
 */
export const PLATFORM_FEE = 50;

/** The single sentence that stands in for every hidden consultation fee. */
export const DOCTOR_FEE_NOTE = 'Doctor’s fee is paid at the clinic';
