/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
// NOTE: vite is imported lazily inside startServer(), not here. A top-level
// import compiles to a require() that runs even in production, which would
// force a deployed VM to install vite and its native rollup/esbuild/lightningcss
// binaries just to serve static files.

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const DATA_FILE = path.join(process.cwd(), 'data.json');

/**
 * The online slot reservation fee — the only money this system ever handles.
 * Kept in step with the client's src/lib/pricing.ts; duplicated rather than
 * imported so the server bundle stays free of any src/ dependency.
 */
const PLATFORM_FEE = 50;

/**
 * The local moment a "2026-08-09" + "03:00 PM" slot begins.
 *
 * Mirrors src/lib/appointments.ts on the client. Both read the clock in the
 * host's local timezone, so a deployment must run the server in the clinic's
 * timezone for this comparison to mean what the front desk expects. An
 * unreadable slot falls back to the end of its day rather than to midnight, so
 * a malformed record is never rejected as "already started".
 */
function slotStartTime(date: string, timeSlot: string): Date {
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return new Date(0);

  const parsed = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((timeSlot || '').trim());
  if (!parsed) {
    start.setHours(23, 59, 0, 0);
    return start;
  }

  let hours = parseInt(parsed[1], 10) % 12;
  if (/pm/i.test(parsed[3])) hours += 12;
  start.setHours(hours, parseInt(parsed[2], 10), 0, 0);
  return start;
}

/** A patient may cancel for a full refund of the ₹50 up to this long before the slot. */
const FREE_CANCEL_HOURS = 2;

/** Last ten digits — "+91 98201 45678" and "9820145678" are the same phone. */
function phoneKey(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

/**
 * A booking number that is unique across the data file. The client used to
 * mint its own random number, so two tabs could, in principle, collide.
 */
function generateBookingNo(data: any): string {
  const taken = new Set((data.appointments || []).map((a: any) => a.bookingNo));
  for (let i = 0; i < 50; i++) {
    const candidate = `BK-NXG-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `BK-NXG-${Date.now().toString().slice(-8)}`;
}

/**
 * OPD token for a doctor's day, issued in booking order: T-01, T-02, ...
 *
 * Cancelled bookings keep their number (a token handed to a patient is never
 * re-issued to someone else), so the next token is one past the highest issued.
 */
function nextTokenNo(data: any, doctorId: string, date: string): string {
  const issued = (data.appointments || [])
    .filter((a: any) => a.doctorId === doctorId && a.date === date && a.tokenNo)
    .map((a: any) => parseInt(String(a.tokenNo).replace(/\D/g, ''), 10))
    .filter((n: number) => Number.isFinite(n));
  const next = (issued.length ? Math.max(...issued) : 0) + 1;
  return `T-${String(next).padStart(2, '0')}`;
}

/**
 * Everything that makes a doctor + date + slot bookable, shared by booking and
 * rescheduling so the two can never drift apart. Returns an error message, or
 * null when the slot can be taken. `ignoreAppointmentId` lets a reschedule
 * leave its own seat out of the capacity count.
 */
function slotProblem(
  data: any,
  doctor: any,
  date: string,
  timeSlot: string,
  type: string,
  ignoreAppointmentId?: string
): string | null {
  if (!doctor) return 'Selected doctor not found.';
  if (doctor.isActive === false) return `${doctor.name} is not taking bookings right now.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 'Please choose a valid date.';
  if (Array.isArray(doctor.slots) && doctor.slots.length > 0 && !doctor.slots.includes(timeSlot)) {
    return `${timeSlot} is not one of ${doctor.name}'s OPD timings.`;
  }
  if (type === 'video' && !doctor.videoEnabled) {
    return `${doctor.name} does not offer video consultations.`;
  }
  // A booking must start in the future. The forms already grey out slots that
  // have begun, but a stale browser tab left open past a slot would otherwise
  // post one — and every "upcoming" list in the app assumes this holds.
  if (slotStartTime(date, timeSlot).getTime() <= Date.now()) {
    return 'That slot has already started. Please choose a later time.';
  }
  const bookedCount = (data.appointments || []).filter(
    (a: any) =>
      a.id !== ignoreAppointmentId &&
      a.doctorId === doctor.id &&
      a.date === date &&
      a.timeSlot === timeSlot &&
      a.status !== 'cancelled'
  ).length;
  if (bookedCount >= (doctor.maxSchedulesPerSlot || 1)) {
    return `Slot is fully booked. Only ${doctor.maxSchedulesPerSlot} bookings are allowed per slot for ${doctor.name}.`;
  }
  return null;
}

app.use(express.json({ limit: '2mb' }));

// Initialize Gemini SDK lazily to avoid crashing on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Initial/default data
const DEFAULT_DOCTORS = [
  {
    id: 'doc-1',
    name: 'Dr. Rajesh Sharma',
    specialty: 'Senior Consultant Cardiologist',
    department: 'Cardiology',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=800',
    rating: 4.9,
    hospital: 'neXgen Heart Care Clinic, Line Bazar',
    addressLine: 'Shop 14, First Floor, Sinha Complex, Line Bazar Main Road',
    area: 'Line Bazar',
    landmark: 'Opposite Sadar Hospital main gate, beside Zila School Chowk',
    pincode: '854301',
    latitude: 25.7794,
    longitude: 87.4726,
    clinicPhone: '+91 6454 240 118',
    bio: 'Interventional cardiologist with 18 years in preventive heart care, angioplasty and heart-failure clinics. Morning OPD at the Line Bazar chamber.',
    videoEnabled: true,
    slots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM'],
    maxSchedulesPerSlot: 3,
    fee: 1200,
    isActive: true,
    experienceYears: 18,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-8',
    name: 'Dr. Rajesh Sharma',
    specialty: 'Senior Consultant Cardiologist',
    department: 'Cardiology',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=800',
    rating: 4.9,
    hospital: 'neXgen Cardiac & Critical Care Centre, Khushkibagh',
    addressLine: 'NH-27 Service Road, Khushkibagh Chowk',
    area: 'Khushkibagh',
    landmark: 'Near Purnia Junction railway station, above Bank of Baroda branch',
    pincode: '854301',
    latitude: 25.7649,
    longitude: 87.4531,
    clinicPhone: '+91 6454 242 907',
    bio: 'Same consultant, second chamber — evening cath-lab OPD at the Khushkibagh critical care centre, next to the emergency wing.',
    videoEnabled: true,
    slots: ['05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'],
    maxSchedulesPerSlot: 2,
    fee: 1400,
    isActive: true,
    experienceYears: 18,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-11',
    name: 'Dr. Rajesh Sharma',
    specialty: 'Senior Consultant Cardiologist',
    department: 'Cardiology',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=800',
    rating: 4.7,
    hospital: 'Gulabbagh Community Heart Camp',
    addressLine: 'Ward 12, Gulabbagh Mandi Road, Purnea East',
    area: 'Gulabbagh',
    landmark: 'Beside Gulabbagh Grain Market Gate No. 2, near Sahara Chowk',
    pincode: '854326',
    latitude: 25.7951,
    longitude: 87.4386,
    clinicPhone: '+91 94318 20514',
    bio: 'Weekend subsidised heart camp run by the same consultant for patients from the Gulabbagh and Kasba belt. Cash-light, walk-in friendly.',
    videoEnabled: false,
    slots: ['10:00 AM', '11:00 AM', '12:00 PM'],
    maxSchedulesPerSlot: 4,
    fee: 500,
    isActive: true,
    experienceYears: 18,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-2',
    name: 'Dr. Ananya Mukherjee',
    specialty: 'Pediatrician & Child Specialist',
    department: 'Pediatrics',
    image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=800',
    rating: 4.8,
    hospital: "neXgen Children's Care, Bhatta Bazar",
    addressLine: 'R.N. Saw Lane, Bhatta Bazar Chowk',
    area: 'Bhatta Bazar',
    landmark: 'Near Bhatta Bazar Jama Masjid, above Sharma Medical Store',
    pincode: '854301',
    latitude: 25.7858,
    longitude: 87.4709,
    clinicPhone: '+91 6454 241 330',
    bio: 'Paediatric immunisation, neonatal care and growth-milestone tracking. Twelve years across Purnea and Katihar districts.',
    videoEnabled: true,
    slots: ['09:00 AM', '10:00 AM', '11:30 AM', '01:30 PM', '03:00 PM', '04:30 PM'],
    maxSchedulesPerSlot: 2,
    fee: 900,
    isActive: true,
    experienceYears: 12,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-9',
    name: 'Dr. Ananya Mukherjee',
    specialty: 'Pediatrician & Child Specialist',
    department: 'Pediatrics',
    image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=800',
    rating: 4.8,
    hospital: 'Madhubani Child & Vaccination Clinic',
    addressLine: 'Madhubani Main Road, Near Purnia College',
    area: 'Madhubani',
    landmark: 'Opposite Purnia College main gate, beside Axis Bank ATM',
    pincode: '854301',
    latitude: 25.7838,
    longitude: 87.4633,
    clinicPhone: '+91 94312 55806',
    bio: 'Second chamber of the same paediatrician — dedicated vaccination and well-baby clinic, closer to the Madhubani and Rambagh colonies.',
    videoEnabled: false,
    slots: ['05:00 PM', '06:00 PM', '07:00 PM'],
    maxSchedulesPerSlot: 3,
    fee: 700,
    isActive: true,
    experienceYears: 12,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-3',
    name: 'Dr. Vikramaditya Verma',
    specialty: 'Dermatologist & Cosmetologist',
    department: 'Dermatology',
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=800',
    rating: 4.7,
    hospital: 'neXgen Skin & Hair Clinic, Rambagh',
    addressLine: 'House No. 22, Rambagh Chowk, Kaptanpul Road',
    area: 'Rambagh',
    landmark: 'Near Rambagh petrol pump, 200 m from Kaptan Pul bridge',
    pincode: '854301',
    latitude: 25.7731,
    longitude: 87.4629,
    clinicPhone: '+91 6454 243 615',
    bio: 'Treats chronic eczema, acne scarring, fungal infections common to the Kosi belt monsoon, plus laser and hair-restoration therapy.',
    videoEnabled: true,
    slots: ['10:00 AM', '11:00 AM', '12:00 PM', '03:00 PM', '05:00 PM'],
    maxSchedulesPerSlot: 3,
    fee: 800,
    isActive: true,
    experienceYears: 10,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-4',
    name: 'Dr. Priya Sundaram',
    specialty: 'General Physician & Family Medicine',
    department: 'General Medicine',
    image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=800',
    rating: 4.6,
    hospital: 'neXgen Family Wellness Centre, Purnea City',
    addressLine: 'Sipahi Tola Road, Purnea City',
    area: 'Purnea City',
    landmark: 'Near Purnea Court railway halt, beside the Jain Mandir',
    pincode: '854302',
    latitude: 25.7511,
    longitude: 87.4768,
    clinicPhone: '+91 6454 245 220',
    bio: 'Family medicine, diabetes and hypertension follow-up, seasonal fever and dengue management for households across Purnea City.',
    videoEnabled: true,
    slots: ['08:30 AM', '09:30 AM', '10:30 AM', '04:00 PM', '05:00 PM', '06:00 PM'],
    maxSchedulesPerSlot: 4,
    fee: 600,
    isActive: true,
    experienceYears: 8,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-5',
    name: 'Dr. Arvind Rao',
    specialty: 'Orthopedic & Joint Replacement Surgeon',
    department: 'Orthopedics',
    image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=800',
    rating: 4.8,
    hospital: 'neXgen Ortho & Spine Hospital, Marangi',
    addressLine: 'Katihar Road, Marangi More, Purnea East',
    area: 'Marangi',
    landmark: 'Opposite Marangi bus stand, next to the Indian Oil petrol pump',
    pincode: '854301',
    latitude: 25.7706,
    longitude: 87.4881,
    clinicPhone: '+91 6454 246 780',
    bio: 'Knee and hip replacement, sports injuries and road-accident trauma. Runs the in-patient ortho ward at the Marangi facility.',
    videoEnabled: false,
    slots: ['09:00 AM', '11:00 AM', '02:00 PM', '04:00 PM'],
    maxSchedulesPerSlot: 2,
    fee: 1100,
    isActive: true,
    experienceYears: 15,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-10',
    name: 'Dr. Arvind Rao',
    specialty: 'Orthopedic & Joint Replacement Surgeon',
    department: 'Orthopedics',
    image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=800',
    rating: 4.8,
    hospital: 'Purnea Ortho & Trauma Chamber, Zila School Chowk',
    addressLine: 'Sadar Hospital Road, Zila School Chowk',
    area: 'Sadar Hospital Road',
    landmark: 'Opposite Sadar Hospital OPD block, above Kosi Diagnostics',
    pincode: '854301',
    latitude: 25.7782,
    longitude: 87.4701,
    clinicPhone: '+91 94310 77245',
    bio: 'Consulting-only chamber of the same surgeon — fracture review, plaster removal and post-operative physiotherapy planning.',
    videoEnabled: true,
    slots: ['06:00 PM', '07:00 PM', '08:00 PM'],
    maxSchedulesPerSlot: 3,
    fee: 900,
    isActive: true,
    experienceYears: 15,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-6',
    name: 'Dr. Sunita Banerjee',
    specialty: 'Gynecologist & Obstetrician',
    department: 'Gynecology',
    image: 'https://images.unsplash.com/photo-1591604021695-0c69b7c05981?auto=format&fit=crop&q=80&w=800',
    rating: 4.9,
    hospital: "neXgen Women's Health Clinic, Jail Chowk",
    addressLine: 'Jail Chowk, Purnea Sadar',
    area: 'Jail Chowk',
    landmark: 'Near the District Jail gate, above the Union Bank branch',
    pincode: '854301',
    latitude: 25.7825,
    longitude: 87.4671,
    clinicPhone: '+91 6454 247 004',
    bio: 'High-risk pregnancy care, antenatal ultrasound review, PCOS and infertility counselling. Seventeen years of practice in north Bihar.',
    videoEnabled: true,
    slots: ['10:00 AM', '11:00 AM', '12:30 PM', '04:00 PM', '05:30 PM'],
    maxSchedulesPerSlot: 2,
    fee: 950,
    isActive: true,
    experienceYears: 17,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-7',
    name: 'Dr. Rohan Kapoor',
    specialty: 'Consultant Neurologist',
    department: 'Neurology',
    image: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&q=80&w=800',
    rating: 4.9,
    hospital: 'neXgen Neurosciences Centre, Polytechnic Chowk',
    addressLine: 'Chunapur Road, Polytechnic Chowk',
    area: 'Polytechnic Chowk',
    landmark: 'Beside Government Polytechnic, on the Purnia airport road junction',
    pincode: '854301',
    latitude: 25.7663,
    longitude: 87.4349,
    clinicPhone: '+91 6454 248 512',
    bio: 'Epilepsy care, stroke recovery, migraine therapy and neuro-rehabilitation, with EEG and nerve-conduction testing on site.',
    videoEnabled: true,
    slots: ['09:00 AM', '10:30 AM', '01:00 PM', '03:00 PM'],
    maxSchedulesPerSlot: 2,
    fee: 1300,
    isActive: true,
    experienceYears: 13,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    id: 'doc-12',
    name: 'Dr. Nusrat Parveen',
    specialty: 'ENT Surgeon & Audiologist',
    department: 'ENT & Otolaryngology',
    image: 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&q=80&w=800',
    rating: 4.7,
    hospital: 'Kosi ENT & Hearing Centre, Kasba',
    addressLine: 'Kasba Road, Sahayak Thana Chowk, Kasba',
    area: 'Kasba',
    landmark: 'Near Kasba block office, opposite the SBI Kasba branch',
    pincode: '854330',
    latitude: 25.8546,
    longitude: 87.5391,
    clinicPhone: '+91 94314 60927',
    bio: 'Ear infections, sinus surgery, tonsillectomy and hearing-aid fitting, with a free audiometry camp on the first Sunday of each month.',
    videoEnabled: true,
    slots: ['09:30 AM', '11:00 AM', '12:30 PM', '04:30 PM'],
    maxSchedulesPerSlot: 3,
    fee: 750,
    isActive: true,
    experienceYears: 11,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    // Transcribed from the clinic signboard. Everything down to `clinicPhone`
    // comes off the board itself; the fields below it are demo placeholders,
    // because the board carries no rating, fee, OPD timings or years of
    // practice. Registration number and qualifications live in the bio, which
    // is the only free-text field the Doctor record has.
    id: 'doc-13',
    name: 'Dr. Santosh Kumar',
    specialty: 'General Physician & Intensivist',
    department: 'General Medicine',
    // Placeholder stock portrait, used at the client's request until a real
    // photograph of the consultant is supplied. Swap this URL, don't add code.
    image: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&q=80&w=800',
    hospital: 'K D Hospital, Line Bazar',
    // No "Line Bazar" here — `area` supplies it, and formatFullAddress joins
    // the two, which would otherwise print the locality twice.
    addressLine: 'Bihar Talkies Road',
    area: 'Line Bazar',
    landmark: 'Near Hotel Jamuna Palace',
    pincode: '854301',
    // Locality-level pin for Line Bazar, NOT a surveyed position for this
    // chamber — the printed address above is the authoritative part. Replace
    // both numbers once the exact spot is known.
    latitude: 25.7788,
    longitude: 87.4712,
    clinicPhone: '+91 73670 29673',
    bio: 'MBBS (JIPMER), DNB, with a Fellowship in Diabetes & Intensive Care. General physician and intensivist at K D Hospital, a 24-hour facility on Bihar Talkies Road. Medical Council Reg. No. BMC-53391.',
    rating: 4.8,
    videoEnabled: true,
    slots: ['10:00 AM', '11:30 AM', '01:00 PM', '05:00 PM', '07:00 PM'],
    maxSchedulesPerSlot: 4,
    fee: 700,
    isActive: true,
    state: 'Bihar',
    district: 'Purnea',
  },
  {
    // Transcribed from the clinic letterhead. As with doc-13, everything down to
    // `clinicPhone` is off the letterhead; rating, fee, slots and capacity are
    // demo placeholders it does not carry. Qualifications and the registration
    // number live in the bio — the Doctor record has no field for either.
    id: 'doc-14',
    name: 'Dr. Amit Ranjan',
    specialty: 'Consultant Urologist & Uro-Oncologist',
    department: 'Urology',
    image: '',
    hospital: 'Mimansa Urocare, Line Bazar',
    addressLine: 'Bihar Talkies Road',
    area: 'Line Bazar',
    landmark: 'Opposite Panchvati Hotel',
    pincode: '854301',
    // Locality-level pin for Line Bazar, not a surveyed position — replace once
    // the exact chamber location is known.
    latitude: 25.7802,
    longitude: 87.4718,
    clinicPhone: '+91 70914 47506',
    bio: 'MBBS, MS (General Surgery), MCh (Urology). Reconstructive urologist, uro-oncologist and uro-gynaecologist at Mimansa Urocare — a kidney, uro and prostate centre. Laser surgery for prostate and stones, and keyhole (endoscopic) surgery for kidney, ureter and bladder stones. Regd. No. 49207.',
    rating: 4.8,
    videoEnabled: true,
    slots: ['10:00 AM', '11:00 AM', '12:00 PM', '05:00 PM', '06:00 PM'],
    maxSchedulesPerSlot: 3,
    fee: 800,
    isActive: true,
    state: 'Bihar',
    district: 'Purnea',
  }
];

// Default hospital config
const DEFAULT_HOSPITAL_CONFIG = {
  name: 'neXgen Multispecialty Healthcare Institute, Purnea',
  address: 'Sadar Hospital Road, Zila School Chowk, Line Bazar, Purnea, Bihar – 854301',
  phone: '+91 6454 240 100 / 1800 11 9999',
  emergencyContact: '+91 94318 20500 / 102',
  currency: 'INR',
  taxRate: 18,
  telehealthPlatformName: 'neXgen Tele-Health India',
  announcementText: 'Please keep your 14-digit ABHA Health ID and Aadhaar ready for fast OPD registration & digital prescriptions.',
};

// Helper to load/save JSON data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed.hospitalConfig) {
        parsed.hospitalConfig = DEFAULT_HOSPITAL_CONFIG;
      }
      if (!parsed.waitlist) {
        parsed.waitlist = [];
      }
      if (!parsed.notifications) {
        parsed.notifications = [];
      }
      if (!parsed.messages) {
        parsed.messages = [];
      }
      if (!parsed.doctorApplications) {
        parsed.doctorApplications = [];
      }
      return parsed;
    }
  } catch (err) {
    console.error('Error reading data file:', err);
  }

  // Fallback initial state
  const initialState = {
    doctors: DEFAULT_DOCTORS,
    patients: [],
    documents: [],
    appointments: [],
    waitlist: [],
    notifications: [],
    messages: [],
    doctorApplications: [],
    hospitalConfig: DEFAULT_HOSPITAL_CONFIG,
  };
  saveData(initialState);
  return initialState;
}

function processWaitlistNotifications(data: any, doctorId: string, date: string, timeSlot: string) {
  if (!data.waitlist) data.waitlist = [];
  if (!data.notifications) data.notifications = [];

  const doctor = data.doctors?.find((d: any) => d.id === doctorId);
  const doctorName = doctor ? doctor.name : 'your doctor';

  const matchingEntries = data.waitlist.filter(
    (w: any) => w.doctorId === doctorId && w.date === date && w.timeSlot === timeSlot && w.status === 'waiting'
  );

  matchingEntries.forEach((w: any) => {
    w.status = 'notified';
    w.notifiedAt = new Date().toISOString();

    const notification = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      patientId: w.patientId,
      patientName: w.patientName,
      title: '⚡ Slot Opening Alert!',
      message: `A slot just freed up with ${doctorName} on ${date} at ${timeSlot}! Book now before it gets claimed.`,
      doctorId: w.doctorId,
      doctorName,
      date: w.date,
      timeSlot: w.timeSlot,
      type: 'slot_available',
      timestamp: new Date().toISOString(),
      read: false,
      waitlistId: w.id
    };

    data.notifications.unshift(notification);
  });
}

function saveData(data: any) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing data file:', err);
  }
}

// Ensure the data file is initialized on startup
loadData();

// ================= API ENDPOINTS =================

// Doctors
app.get('/api/doctors', (req, res) => {
  const data = loadData();
  res.json(data.doctors);
});

// Patients (Patient History Hub)
app.get('/api/patients', (req, res) => {
  const data = loadData();
  res.json(data.patients);
});

app.post('/api/patients', (req, res) => {
  const data = loadData();
  const {
    id, name, email, age, gender, contact, allergies, medications, medicalConditions, notes,
    // Profile fields a patient fills in themselves after self-registering.
    bloodGroup, address, emergencyContact, abhaId, image,
  } = req.body;

  /**
   * Self-registration only supplies a name and a mobile number, so every other
   * field has to survive being absent. `Number(undefined)` is NaN, which would
   * serialise into data.json as null and render as "NaN y/o" — 0 reads as
   * "not stated yet", which is what an incomplete profile actually means.
   */
  const safeAge = Number.isFinite(Number(age)) ? Number(age) : 0;

  /** Only overwrite an optional field when the caller actually sent one. */
  const keepOrSet = (incoming: any, existing: any) => (incoming !== undefined ? incoming : existing);

  let patient;
  if (id) {
    // Update existing
    const idx = data.patients.findIndex((p: any) => p.id === id);
    if (idx !== -1) {
      const previous = data.patients[idx];
      data.patients[idx] = {
        ...previous,
        name,
        email,
        age: safeAge,
        gender,
        contact,
        allergies: Array.isArray(allergies) ? allergies : [],
        medications: Array.isArray(medications) ? medications : [],
        medicalConditions: Array.isArray(medicalConditions) ? medicalConditions : [],
        notes: notes || '',
        bloodGroup: keepOrSet(bloodGroup, previous.bloodGroup),
        address: keepOrSet(address, previous.address),
        emergencyContact: keepOrSet(emergencyContact, previous.emergencyContact),
        abhaId: keepOrSet(abhaId, previous.abhaId),
        image: keepOrSet(image, previous.image),
      };
      patient = data.patients[idx];
    } else {
      return res.status(404).json({ error: 'Patient not found' });
    }
  } else {
    // Create new
    patient = {
      id: 'patient-' + Date.now(),
      name,
      email: email || '',
      age: safeAge,
      gender: gender || '',
      contact: contact || '',
      allergies: Array.isArray(allergies) ? allergies : [],
      medications: Array.isArray(medications) ? medications : [],
      medicalConditions: Array.isArray(medicalConditions) ? medicalConditions : [],
      notes: notes || '',
      bloodGroup: bloodGroup || '',
      address: address || '',
      emergencyContact: emergencyContact || '',
      abhaId: abhaId || '',
      image: image || '',
    };
    data.patients.push(patient);
  }

  saveData(data);
  res.json(patient);
});

// Documents
app.get('/api/documents', (req, res) => {
  const data = loadData();
  res.json(data.documents);
});

app.post('/api/documents', (req, res) => {
  const data = loadData();
  const { patientId, title, category, fileContentText, fileName, fileSize } = req.body;

  if (!patientId || !title || !category || !fileContentText) {
    return res.status(400).json({ error: 'Missing required fields for document upload.' });
  }

  const document = {
    id: 'doc-' + Date.now(),
    patientId,
    title,
    category,
    uploadDate: new Date().toISOString().split('T')[0],
    fileName: fileName || 'medical_record.txt',
    fileSize: fileSize || '1 KB',
    fileContentText,
  };

  data.documents.push(document);
  saveData(data);
  res.json(document);
});

// AI Document Analyzer using Gemini API
app.post('/api/documents/:id/analyze', async (req, res) => {
  const data = loadData();
  const docId = req.params.id;
  const doc = data.documents.find((d: any) => d.id === docId);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  try {
    const ai = getGeminiClient();
    const prompt = `You are an expert clinical medical assistant. Analyze the following medical document text:
-----
Title: ${doc.title}
Category: ${doc.category}
Content:
${doc.fileContentText}
-----
Please extract relevant clinical insights and output a JSON object with the following schema:
- summary: A brief summary of the document (under 100 words) written in a clear, professional way.
- keyFindings: An array of key physical observations, lab results, or health statuses found in this document.
- extractedAllergies: An array of allergies explicitly noted in this document. If none are specified, return an empty array.
- extractedMedications: An array of medications prescribed or currently taken as noted in this document. If none are specified, return an empty array.
- suggestedFollowUp: A short recommendation for the next medical action, test, or lifestyle modification.
- riskLevel: Based on findings, evaluate the alert/risk level as 'Low', 'Medium', or 'High'.

Strictly return ONLY a valid JSON object matching the requested schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            keyFindings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            extractedAllergies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            extractedMedications: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedFollowUp: { type: Type.STRING },
            riskLevel: {
              type: Type.STRING,
              description: 'Must be Low, Medium, or High',
            },
          },
          required: ['summary', 'keyFindings', 'extractedAllergies', 'extractedMedications', 'suggestedFollowUp', 'riskLevel'],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('No response text received from Gemini');
    }

    const analysis = JSON.parse(resultText);
    analysis.analyzedAt = new Date().toISOString().split('T')[0];

    // Save back to database
    doc.analysis = analysis;
    saveData(data);

    res.json({ success: true, document: doc });
  } catch (err: any) {
    console.error('Gemini medical document analysis failed:', err);
    res.status(500).json({ error: `Medical analysis failed: ${err.message || err}` });
  }
});

// Appointments & Slots Booking
app.get('/api/appointments', (req, res) => {
  const data = loadData();
  res.json(data.appointments);
});

// Slots tracker (check booked count for a date, doctor and slot)
app.get('/api/slots-tracker', (req, res) => {
  const data = loadData();
  const { doctorId, date } = req.query;

  if (!doctorId || !date) {
    return res.status(400).json({ error: 'Missing doctorId or date query parameters.' });
  }

  // Filter all active appointments for this doctor on this date
  const doctorAppointments = data.appointments.filter(
    (appt: any) => appt.doctorId === doctorId && appt.date === date && appt.status !== 'cancelled'
  );

  // Group by slot
  const slotBookings: Record<string, number> = {};
  doctorAppointments.forEach((appt: any) => {
    slotBookings[appt.timeSlot] = (slotBookings[appt.timeSlot] || 0) + 1;
  });

  res.json(slotBookings);
});

app.post('/api/appointments', (req, res) => {
  const data = loadData();
  const {
    doctorId,
    patientId,
    date,
    timeSlot,
    type,
    patientName,
    patientAge,
    patientContact,
    notes,
    documentIds,
    isRevisit,
    previousBookingId,
    uploadedReportNames,
    prescriptionNames,
    paymentMethod,
    baseFee,
    discountAmount,
    taxAmount,
    totalAmount,
    bookingNo,
  } = req.body;

  if (!doctorId || !date || !timeSlot || !String(patientName || '').trim() || !patientAge || !patientContact) {
    return res.status(400).json({ error: 'Missing required appointment booking fields.' });
  }
  const ageNumber = Number(patientAge);
  if (!Number.isFinite(ageNumber) || ageNumber <= 0 || ageNumber > 120) {
    return res.status(400).json({ error: 'Please enter a valid age between 1 and 120.' });
  }
  if (phoneKey(patientContact).length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }

  const doctor = data.doctors.find((d: any) => d.id === doctorId);
  if (!doctor) {
    return res.status(404).json({ error: 'Selected doctor not found.' });
  }
  const problem = slotProblem(data, doctor, date, timeSlot, type || 'visiting');
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  // Ensure patient profile exists or create one automatically
  let resolvedPatientId = patientId && patientId !== 'new' ? patientId : '';
  if (resolvedPatientId) {
    const profile = data.patients.find((p: any) => p.id === resolvedPatientId);
    if (!profile) {
      return res.status(404).json({ error: 'Patient profile not found. Please sign in again.' });
    }
    // A self-registered profile starts without an age; the booking form asks
    // for it, so keep it on the profile too.
    if (!Number(profile.age)) profile.age = ageNumber;
  }
  if (!resolvedPatientId) {
    // Same person = same name on the same phone (compared on the last ten
    // digits, so "+91 98201 45678" matches "9820145678").
    const existingPatient = data.patients.find(
      (p: any) =>
        String(p.name || '').toLowerCase() === String(patientName).trim().toLowerCase() &&
        phoneKey(p.contact) === phoneKey(patientContact)
    );
    if (existingPatient) {
      resolvedPatientId = existingPatient.id;
    } else {
      // Create new patient
      const newPatient = {
        id: 'patient-' + Date.now(),
        name: patientName,
        email: '',
        age: Number(patientAge),
        gender: 'Other',
        contact: patientContact,
        allergies: [],
        medications: [],
        medicalConditions: [],
        notes: 'Profile automatically created during appointment booking.',
      };
      data.patients.push(newPatient);
      resolvedPatientId = newPatient.id;
    }
  }

  // One booking per patient, per doctor, per day. A double-tap on "Pay" or a
  // second tab would otherwise take two seats and charge ₹50 twice.
  const duplicate = data.appointments.find(
    (a: any) =>
      a.patientId === resolvedPatientId &&
      a.doctorId === doctorId &&
      a.date === date &&
      a.status === 'scheduled'
  );
  if (duplicate) {
    return res.status(409).json({
      error: `You already have a booking with ${doctor.name} on this day (${duplicate.timeSlot}, ${duplicate.bookingNo}). Reschedule it instead of booking again.`,
    });
  }

  // Money: the ₹50 platform fee is the only amount this system ever charges,
  // whatever the client sends. "Pay at counter" holds the seat with the fee
  // still due — it is not money received.
  const payAtCounter = /counter/i.test(String(paymentMethod || ''));
  const nowIso = new Date().toISOString();

  const appointment = {
    id: 'appt-' + Date.now(),
    bookingNo: generateBookingNo(data),
    tokenNo: nextTokenNo(data, doctorId, date),
    doctorId,
    patientId: resolvedPatientId,
    date,
    timeSlot,
    status: 'scheduled',
    type: type === 'video' ? 'video' : 'visiting',
    patientName: String(patientName).trim(),
    patientAge: ageNumber,
    patientContact: String(patientContact).trim(),
    notes: notes || '',
    documentIds: Array.isArray(documentIds) ? documentIds : [],
    isRevisit: Boolean(isRevisit),
    previousBookingId: previousBookingId || '',
    uploadedReportNames: Array.isArray(uploadedReportNames) ? uploadedReportNames : [],
    prescriptionNames: Array.isArray(prescriptionNames) ? prescriptionNames : [],
    paymentMethod: paymentMethod || 'UPI Instant',
    platformFee: PLATFORM_FEE,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: PLATFORM_FEE,
    feePaid: !payAtCounter,
    amountPaid: payAtCounter ? 0 : PLATFORM_FEE,
    paymentDate: payAtCounter ? undefined : nowIso,
    bookedAt: nowIso,
    bookedBy: ['hospital', 'admin'].includes(req.body.bookedByRole) ? req.body.bookedByRole : 'patient',
  };

  data.appointments.push(appointment);
  saveData(data);
  res.json(appointment);
});

/**
 * Whether cancelling now earns the ₹50 back. Exported as a rule rather than
 * computed on the client so the receipt, the patient card and the desk all
 * agree.
 */
function refundDue(appt: any): boolean {
  if (!appt.feePaid) return false;
  const hoursAhead = (slotStartTime(appt.date, appt.timeSlot).getTime() - Date.now()) / 3_600_000;
  return hoursAhead >= FREE_CANCEL_HOURS;
}

// Cancel appointment
app.post('/api/appointments/:id/cancel', (req, res) => {
  const data = loadData();
  const apptId = req.params.id;
  const appt = data.appointments.find((a: any) => a.id === apptId);

  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  if (appt.status !== 'scheduled') {
    return res.status(400).json({ error: `This appointment is already ${appt.status} and cannot be cancelled.` });
  }

  // Staff may cancel a slot that has started (the patient never turned up, the
  // doctor was called away); a patient cannot cancel once the slot has begun.
  const actorRole = req.body?.actorRole;
  const isStaff = ['hospital', 'admin', 'doctor'].includes(actorRole);
  if (!isStaff && slotStartTime(appt.date, appt.timeSlot).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'This slot has already started and can no longer be cancelled online. Please contact the clinic.' });
  }

  const refund = refundDue(appt) || (isStaff && appt.feePaid);
  appt.status = 'cancelled';
  appt.cancelledAt = new Date().toISOString();
  appt.cancelledBy = isStaff ? actorRole : 'patient';
  appt.cancelReason = String(req.body?.reason || '').slice(0, 300);
  if (refund) {
    appt.refundStatus = 'initiated';
    appt.refundAmount = PLATFORM_FEE;
  }

  // Trigger waitlist alert
  processWaitlistNotifications(data, appt.doctorId, appt.date, appt.timeSlot);
  saveData(data);
  res.json(appt);
});

/**
 * Move a booking to another date/slot with the same doctor.
 *
 * The ₹50 already paid carries over — rescheduling used to cancel the old
 * booking and create a new one, charging the fee again and losing the original
 * if the new slot turned out to be full.
 */
app.post('/api/appointments/:id/reschedule', (req, res) => {
  const data = loadData();
  const appt = data.appointments.find((a: any) => a.id === req.params.id);
  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  if (appt.status !== 'scheduled') {
    return res.status(400).json({ error: `Only scheduled appointments can be rescheduled (this one is ${appt.status}).` });
  }

  const { date, timeSlot, type } = req.body || {};
  const doctorId = req.body?.doctorId || appt.doctorId;
  const doctor = data.doctors.find((d: any) => d.id === doctorId);
  const newType = type === 'video' || type === 'visiting' ? type : appt.type;

  if (doctorId === appt.doctorId && date === appt.date && timeSlot === appt.timeSlot && newType === appt.type) {
    return res.status(400).json({ error: 'Please pick a different date or time.' });
  }

  const problem = slotProblem(data, doctor, date, timeSlot, newType, appt.id);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const from = { doctorId: appt.doctorId, date: appt.date, timeSlot: appt.timeSlot, type: appt.type, tokenNo: appt.tokenNo };
  const dayChanged = doctorId !== appt.doctorId || date !== appt.date;
  // Issue the new day's token BEFORE moving the row, so its old token (from
  // another day) is not counted against the new day's sequence.
  const newToken = dayChanged ? nextTokenNo(data, doctorId, date) : appt.tokenNo;

  appt.rescheduleHistory = [...(appt.rescheduleHistory || []), { ...from, at: new Date().toISOString() }];
  appt.doctorId = doctorId;
  appt.date = date;
  appt.timeSlot = timeSlot;
  appt.type = newType;
  appt.tokenNo = newToken;

  // The seat they left is now free for someone on the waitlist.
  processWaitlistNotifications(data, from.doctorId, from.date, from.timeSlot);
  saveData(data);
  res.json(appt);
});

// Update appointment status
app.post('/api/appointments/:id/status', (req, res) => {
  const data = loadData();
  const apptId = req.params.id;
  const { status, consultation, actorRole, actorName } = req.body;

  const appt = data.appointments.find((a: any) => a.id === apptId);
  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  if (!['scheduled', 'completed', 'cancelled', 'active-video'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  /**
   * Prescribing authority.
   *
   * The front desk may close a visit — the patient was seen and has gone home —
   * but it may not practise medicine. Diagnosis, advice and prescriptions are
   * clinical acts reserved for the attending consultant.
   *
   * Deny by default: only an explicit clinical actorRole unlocks those fields,
   * so a caller that forgets to identify itself gets refused rather than
   * silently granted. The refusal is loud (403) rather than a quiet strip,
   * because a desk client that regressed into sending clinical content is a bug
   * the operator needs to hear about — and a doctor whose notes vanished
   * silently would be far worse.
   */
  const CLINICAL_ROLES = ['doctor', 'admin'];
  const isClinician = CLINICAL_ROLES.includes(actorRole);

  if (status === 'completed' && consultation && !isClinician) {
    const carriesClinicalContent =
      (Array.isArray(consultation.prescriptions) && consultation.prescriptions.length > 0) ||
      Boolean((consultation.diagnosis || '').trim()) ||
      Boolean((consultation.advice || '').trim());

    if (carriesClinicalContent) {
      return res.status(403).json({
        error:
          'The front desk cannot record a diagnosis, advice or prescription. ' +
          'Only the attending consultant can close a consultation clinically — ' +
          'the desk may mark the appointment completed with a handover note.',
      });
    }
  }

  appt.status = status;

  // Closing a consultation files the doctor's record against this appointment.
  // completedAt is stamped here rather than trusted from the client, so the
  // visit history is ordered by when the clinic actually closed the visit.
  if (status === 'completed' && consultation) {
    // Doctor identity and chamber are taken from the appointment's own doctor
    // record, not from the client payload — a visit record must say who
    // actually held the OPD, whatever the caller claims.
    const doctor = data.doctors.find((d: any) => d.id === appt.doctorId);
    appt.consultation = {
      completedAt: new Date().toISOString(),
      doctorId: appt.doctorId,
      doctorName: doctor?.name || consultation.doctorName || '',
      specialty: doctor?.specialty || consultation.specialty || '',
      chamber: doctor?.hospital || consultation.chamber || '',
      chamberArea: doctor?.area || doctor?.district || consultation.chamberArea || '',
      diagnosis: (consultation.diagnosis || '').trim(),
      notes: (consultation.notes || '').trim(),
      advice: (consultation.advice || '').trim(),
      prescriptions: Array.isArray(consultation.prescriptions) ? consultation.prescriptions : [],
      // Stamped from the guard above, so the completed-visit card can tell an
      // administrative close apart from a consultant's clinical one.
      closedByRole: isClinician ? actorRole : 'hospital',
      closedByName: actorName || '',
    };
  }

  if (status === 'cancelled') {
    processWaitlistNotifications(data, appt.doctorId, appt.date, appt.timeSlot);
  }
  saveData(data);
  res.json(appt);
});

// ================= WAITLIST & NOTIFICATIONS API =================
app.get('/api/waitlist', (req, res) => {
  const data = loadData();
  res.json(data.waitlist || []);
});

app.post('/api/waitlist', (req, res) => {
  const data = loadData();
  const { doctorId, patientId, patientName, patientContact, date, timeSlot, type } = req.body;

  if (!doctorId || !date || !timeSlot || !patientName) {
    return res.status(400).json({ error: 'Missing required waitlist fields' });
  }

  if (!data.waitlist) data.waitlist = [];

  // Check if already on waitlist
  const existing = data.waitlist.find(
    (w: any) => w.doctorId === doctorId && w.date === date && w.timeSlot === timeSlot && w.patientName.toLowerCase() === patientName.toLowerCase() && w.status === 'waiting'
  );

  if (existing) {
    return res.json(existing);
  }

  const entry = {
    id: 'wl-' + Date.now(),
    doctorId,
    // 'new' is the booking form's "someone new" picker value, not an id.
    patientId: patientId && patientId !== 'new' ? patientId : '',
    patientName,
    patientContact: patientContact || '',
    date,
    timeSlot,
    type: type || 'visiting',
    status: 'waiting',
    createdAt: new Date().toISOString()
  };

  data.waitlist.push(entry);
  saveData(data);
  res.json(entry);
});

app.delete('/api/waitlist/:id', (req, res) => {
  const data = loadData();
  if (data.waitlist) {
    data.waitlist = data.waitlist.filter((w: any) => w.id !== req.params.id);
    saveData(data);
  }
  res.json({ success: true });
});

app.get('/api/notifications', (req, res) => {
  const data = loadData();
  res.json(data.notifications || []);
});

app.post('/api/notifications/:id/read', (req, res) => {
  const data = loadData();
  if (data.notifications) {
    const notif = data.notifications.find((n: any) => n.id === req.params.id);
    if (notif) {
      notif.read = true;
      saveData(data);
    }
  }
  res.json({ success: true });
});

// ================= FRONT-DESK MESSAGING API =================
/**
 * Outbound messages the front desk sends to patients — "Dr Sharma is running
 * 40 minutes late", "the clinic is closed on Thursday", and so on.
 *
 * Only the `portal` channel truly delivers anything: the message lands in the
 * patient's Messages inbox. Email, SMS and WhatsApp are SIMULATED — the attempt
 * is recorded against the recipient along with the address it would have gone
 * to, but nothing leaves this process. Wiring a real gateway is a change to
 * `simulateDelivery` alone; every caller and every stored row stays as is.
 */
const CHANNEL_NAMES: Record<string, string> = {
  portal: 'Patient portal',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

const VALID_CHANNELS = Object.keys(CHANNEL_NAMES);
const VALID_CATEGORIES = ['delay', 'reschedule', 'closure', 'general'];

/**
 * One channel attempt against one patient.
 *
 * `skipped` is deliberately not an error: a patient with no email on file has
 * not suffered a delivery failure, they simply cannot be reached that way. The
 * desk needs to see the difference so they know who still needs a phone call.
 */
function simulateDelivery(channel: string, patient: any, at: string) {
  if (channel === 'portal') {
    return { channel, status: 'sent', detail: 'Delivered to portal inbox', at };
  }
  if (channel === 'email') {
    return patient.email
      ? { channel, status: 'sent', detail: `Simulated email to ${patient.email}`, at }
      : { channel, status: 'skipped', detail: 'No email address on file', at };
  }
  // sms | whatsapp — both ride the mobile number.
  return patient.contact
    ? { channel, status: 'sent', detail: `Simulated ${CHANNEL_NAMES[channel]} to ${patient.contact}`, at }
    : { channel, status: 'skipped', detail: 'No mobile number on file', at };
}

/**
 * Turn the desk's audience choice into a concrete patient list.
 *
 * `doctor-day` is the one that earns its keep: "everybody booked with Dr Sharma
 * today" is precisely the group a delay notice is for, and asking the desk to
 * tick twelve names by hand under pressure is how the wrong patient gets missed.
 */
function resolveRecipients(data: any, body: any) {
  const patients = data.patients || [];
  const { audience, patientIds, doctorId, date } = body;

  if (audience === 'all') {
    return { patients, label: `All registered patients (${patients.length})` };
  }

  if (audience === 'doctor-day') {
    const doctor = (data.doctors || []).find((d: any) => d.id === doctorId);
    const booked = (data.appointments || []).filter(
      (a: any) => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled'
    );
    // A patient with two slots that day must not be written to twice.
    const ids = [...new Set(booked.map((a: any) => a.patientId))];
    const matched = patients.filter((p: any) => ids.includes(p.id));
    return {
      patients: matched,
      label: `${doctor?.name || 'Doctor'} · ${date} (${matched.length} booked)`,
    };
  }

  const ids: string[] = Array.isArray(patientIds) ? patientIds : [];
  const matched = patients.filter((p: any) => ids.includes(p.id));
  return {
    patients: matched,
    label:
      matched.length === 1
        ? matched[0].name
        : `${matched.length} selected patient${matched.length === 1 ? '' : 's'}`,
  };
}

app.get('/api/messages', (req, res) => {
  const data = loadData();
  const all = data.messages || [];
  const { patientId } = req.query;

  // A patient may only see sends they were actually a recipient of.
  if (patientId) {
    return res.json(
      all.filter((m: any) => (m.recipients || []).some((r: any) => r.patientId === patientId))
    );
  }
  res.json(all);
});

app.post('/api/messages', (req, res) => {
  const data = loadData();
  if (!data.messages) data.messages = [];

  const {
    senderId, senderName, senderRole,
    audience, category, subject, body, channels,
  } = req.body;

  if (!subject || !String(subject).trim()) {
    return res.status(400).json({ error: 'A subject is required' });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'A message body is required' });
  }
  if (!['all', 'selected', 'doctor-day'].includes(audience)) {
    return res.status(400).json({ error: 'Invalid audience' });
  }

  const requestedChannels: string[] = Array.isArray(channels) ? channels : [];
  const cleanChannels = requestedChannels.filter(c => VALID_CHANNELS.includes(c));
  if (cleanChannels.length === 0) {
    return res.status(400).json({ error: 'Pick at least one delivery channel' });
  }

  const { patients: recipientPatients, label } = resolveRecipients(data, req.body);
  if (recipientPatients.length === 0) {
    return res.status(400).json({ error: 'No patients matched that audience — nothing was sent' });
  }

  const at = new Date().toISOString();

  const message = {
    id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    senderId: senderId || 'desk',
    senderName: senderName || 'Front Desk',
    senderRole: senderRole === 'admin' ? 'admin' : 'hospital',
    audience,
    audienceLabel: label,
    category: VALID_CATEGORIES.includes(category) ? category : 'general',
    subject: String(subject).trim(),
    body: String(body).trim(),
    channels: cleanChannels,
    sentAt: at,
    recipients: recipientPatients.map((p: any) => ({
      patientId: p.id,
      patientName: p.name,
      contact: p.contact || '',
      email: p.email || '',
      deliveries: cleanChannels.map(c => simulateDelivery(c, p, at)),
    })),
  };

  data.messages.unshift(message);
  saveData(data);

  // The summary is what the desk sees in the confirmation toast — how many were
  // reached on each channel, and how many could not be.
  const summary = cleanChannels.map(channel => {
    const rows = message.recipients.flatMap((r: any) =>
      r.deliveries.filter((d: any) => d.channel === channel)
    );
    return {
      channel,
      label: CHANNEL_NAMES[channel],
      sent: rows.filter((d: any) => d.status === 'sent').length,
      skipped: rows.filter((d: any) => d.status === 'skipped').length,
    };
  });

  res.json({ message, recipientCount: message.recipients.length, summary });
});

app.post('/api/messages/:id/read', (req, res) => {
  const data = loadData();
  const { patientId } = req.body;
  const message = (data.messages || []).find((m: any) => m.id === req.params.id);

  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }

  // Read state is per recipient — one patient opening a broadcast must not mark
  // it read for the other two hundred.
  const recipient = (message.recipients || []).find((r: any) => r.patientId === patientId);
  if (!recipient) {
    return res.status(404).json({ error: 'Not a recipient of this message' });
  }

  if (!recipient.readAt) {
    recipient.readAt = new Date().toISOString();
    saveData(data);
  }
  res.json({ success: true });
});

app.post('/api/waitlist/simulate-cancellation', (req, res) => {
  const data = loadData();
  const { doctorId, date, timeSlot } = req.body;

  if (!doctorId || !date || !timeSlot) {
    return res.status(400).json({ error: 'Missing doctorId, date, or timeSlot' });
  }

  // Find an active appointment for this doctor/date/timeslot and cancel it, or just trigger notifications
  const appt = data.appointments.find(
    (a: any) => a.doctorId === doctorId && a.date === date && a.timeSlot === timeSlot && a.status !== 'cancelled'
  );

  if (appt) {
    appt.status = 'cancelled';
  }

  processWaitlistNotifications(data, doctorId, date, timeSlot);
  saveData(data);
  res.json({ success: true, message: 'Slot cancelled and waitlisted patients notified!' });
});

// Create new doctor
app.post('/api/doctors', (req, res) => {
  const data = loadData();
  const {
    name, specialty, fee, bio, slots, videoEnabled, image,
    // A doctor may hold OPD at more than one chamber, so the consulting address
    // belongs to the doctor row rather than to the hospital record.
    department, hospital, addressLine, area, landmark, district, state, pincode,
    latitude, longitude, clinicPhone,
    // Practice parameters the admin onboarding form now collects in full.
    rating, experienceYears, maxSchedulesPerSlot, isActive,
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Doctor name is required' });
  }

  const newDoc = {
    id: 'doc-' + Date.now(),
    name,
    specialty: specialty || 'General Physician',
    department: department || specialty || 'General Medicine',
    fee: Number(fee) || 150,
    bio: bio || '',
    // Empty rather than a stock portrait: the cards fall back to an initials
    // avatar, which is honest about there being no photograph on file. A stock
    // face on a real clinician's profile is worse than none.
    image: image || '',
    // 0 means "no reviews yet" and renders as such, which beats minting a
    // perfect 5.0 for a doctor nobody has rated.
    rating: rating !== undefined && rating !== '' ? Number(rating) : 0,
    hospital: hospital || data.hospitalConfig?.name || 'neXgen Multispecialty Healthcare Institute, Purnea',
    addressLine: addressLine || '',
    area: area || '',
    landmark: landmark || '',
    district: district || 'Purnea',
    state: state || 'Bihar',
    pincode: pincode || '',
    // Left undefined when not supplied — the map thumbnail is skipped rather
    // than dropping a pin on (0, 0) in the Gulf of Guinea.
    latitude: latitude !== undefined && latitude !== '' ? Number(latitude) : undefined,
    longitude: longitude !== undefined && longitude !== '' ? Number(longitude) : undefined,
    clinicPhone: clinicPhone || '',
    experienceYears:
      experienceYears !== undefined && experienceYears !== '' ? Number(experienceYears) : undefined,
    videoEnabled: videoEnabled !== false,
    isActive: isActive !== false,
    slots: Array.isArray(slots) && slots.length > 0 ? slots : ['09:00 AM', '10:00 AM', '02:00 PM', '04:00 PM'],
    maxSchedulesPerSlot: Number(maxSchedulesPerSlot) > 0 ? Number(maxSchedulesPerSlot) : 3,
  };

  data.doctors.push(newDoc);
  saveData(data);
  res.json(newDoc);
});

// Doctor availability & parameters update
app.post('/api/doctors/:id/availability', (req, res) => {
  const data = loadData();
  const docId = req.params.id;
  const { slots, fee, videoEnabled } = req.body;

  const doc = data.doctors.find((d: any) => d.id === docId);
  if (!doc) {
    return res.status(404).json({ error: 'Doctor not found' });
  }

  if (Array.isArray(slots)) {
    doc.slots = slots;
  }
  if (fee !== undefined) {
    doc.fee = Number(fee);
  }
  if (videoEnabled !== undefined) {
    doc.videoEnabled = Boolean(videoEnabled);
  }

  saveData(data);
  res.json(doc);
});

/**
 * Doctor profile update — what a consultant edits about themselves, plus the
 * same fields the admin onboarding form collects.
 *
 * Deliberately a patch: only keys present in the body are written, so a form
 * that submits a subset cannot blank out the rest of the record. `id` is never
 * writable.
 */
app.post('/api/doctors/:id/profile', (req, res) => {
  const data = loadData();
  const doc = data.doctors.find((d: any) => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Doctor not found' });
  }

  const textFields = [
    'name', 'specialty', 'department', 'bio', 'image', 'hospital',
    'addressLine', 'area', 'landmark', 'district', 'state', 'pincode', 'clinicPhone',
  ];
  for (const field of textFields) {
    if (req.body[field] !== undefined) doc[field] = req.body[field];
  }

  const numberFields = ['fee', 'rating', 'experienceYears', 'maxSchedulesPerSlot', 'latitude', 'longitude'];
  for (const field of numberFields) {
    if (req.body[field] === undefined) continue;
    // An empty string clears the value rather than writing NaN — it is how a
    // form says "I left this blank".
    doc[field] = req.body[field] === '' ? undefined : Number(req.body[field]);
  }

  if (req.body.videoEnabled !== undefined) doc.videoEnabled = Boolean(req.body.videoEnabled);
  if (req.body.isActive !== undefined) doc.isActive = Boolean(req.body.isActive);
  if (Array.isArray(req.body.slots)) doc.slots = req.body.slots;

  saveData(data);
  res.json(doc);
});

// ================= DOCTOR ONBOARDING =================
/**
 * "Join as a doctor" — a public application a clinician submits from the
 * website. Nothing goes live until an administrator approves it, at which point
 * the application becomes a real Doctor row in the directory.
 *
 * There is deliberately no fee field anywhere in this flow: the platform never
 * sets, sees or touches a doctor's consultation charge. Patients pay the doctor
 * at the clinic exactly as before; the platform only takes its ₹50 booking fee.
 */
const APPLICATION_TEXT_FIELDS = [
  'name', 'specialty', 'department', 'qualification', 'registrationNo', 'phone', 'email',
  'hospital', 'addressLine', 'area', 'landmark', 'district', 'state', 'pincode', 'bio',
];

app.get('/api/doctor-applications', (req, res) => {
  const data = loadData();
  res.json(data.doctorApplications || []);
});

app.post('/api/doctor-applications', (req, res) => {
  const data = loadData();
  const body = req.body || {};
  const clean: Record<string, string> = {};
  for (const field of APPLICATION_TEXT_FIELDS) {
    clean[field] = String(body[field] ?? '').trim().slice(0, field === 'bio' ? 1000 : 200);
  }

  if (!clean.name || !clean.specialty || !clean.registrationNo || !clean.hospital) {
    return res.status(400).json({ error: 'Name, speciality, medical registration number and clinic name are required.' });
  }
  if (phoneKey(clean.phone).length < 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const open = (data.doctorApplications || []).find(
    (a: any) => a.status === 'pending' && (phoneKey(a.phone) === phoneKey(clean.phone) || a.registrationNo.toLowerCase() === clean.registrationNo.toLowerCase())
  );
  if (open) {
    return res.status(409).json({ error: 'An application with this mobile number or registration number is already under review. We will call you shortly.' });
  }

  const slots = Array.isArray(body.slots)
    ? body.slots.map((s: any) => String(s).trim()).filter((s: string) => /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(s))
    : [];

  const application = {
    id: 'app-' + Date.now(),
    ...clean,
    district: clean.district || 'Purnea',
    state: clean.state || 'Bihar',
    experienceYears: Number(body.experienceYears) > 0 ? Math.min(70, Number(body.experienceYears)) : undefined,
    videoEnabled: body.videoEnabled !== false,
    slots: slots.length ? slots : ['10:00 AM', '11:00 AM', '12:00 PM', '05:00 PM', '06:00 PM'],
    maxSchedulesPerSlot: Number(body.maxSchedulesPerSlot) > 0 ? Math.min(20, Number(body.maxSchedulesPerSlot)) : 4,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  };

  data.doctorApplications.unshift(application);
  saveData(data);
  res.json(application);
});

app.post('/api/doctor-applications/:id/approve', (req, res) => {
  const data = loadData();
  const application = (data.doctorApplications || []).find((a: any) => a.id === req.params.id);
  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (application.status !== 'pending') {
    return res.status(400).json({ error: `This application was already ${application.status}.` });
  }

  const name = /^dr\.?\s/i.test(application.name) ? application.name : `Dr. ${application.name}`;
  const bioParts = [
    application.qualification,
    application.bio,
    application.registrationNo && `Medical Council Reg. No. ${application.registrationNo}.`,
  ].filter(Boolean);

  const doctor = {
    id: 'doc-' + Date.now(),
    name,
    specialty: application.specialty,
    department: application.department || application.specialty,
    image: '',
    rating: 0,
    hospital: application.hospital,
    addressLine: application.addressLine,
    area: application.area,
    landmark: application.landmark,
    pincode: application.pincode,
    clinicPhone: application.phone,
    bio: bioParts.join(' '),
    videoEnabled: application.videoEnabled !== false,
    slots: application.slots,
    maxSchedulesPerSlot: application.maxSchedulesPerSlot || 4,
    isActive: true,
    experienceYears: application.experienceYears,
    state: application.state,
    district: application.district,
    onboardedAt: new Date().toISOString(),
  };

  data.doctors.push(doctor);
  application.status = 'approved';
  application.reviewedAt = new Date().toISOString();
  application.doctorId = doctor.id;
  saveData(data);
  res.json({ application, doctor });
});

app.post('/api/doctor-applications/:id/reject', (req, res) => {
  const data = loadData();
  const application = (data.doctorApplications || []).find((a: any) => a.id === req.params.id);
  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (application.status !== 'pending') {
    return res.status(400).json({ error: `This application was already ${application.status}.` });
  }
  application.status = 'rejected';
  application.reviewedAt = new Date().toISOString();
  application.reviewNote = String(req.body?.note || '').slice(0, 300);
  saveData(data);
  res.json(application);
});

// Hospital Config Get & Post
app.get('/api/hospital/config', (req, res) => {
  const data = loadData();
  res.json(data.hospitalConfig || DEFAULT_HOSPITAL_CONFIG);
});

app.post('/api/hospital/config', (req, res) => {
  const data = loadData();
  data.hospitalConfig = {
    ...DEFAULT_HOSPITAL_CONFIG,
    ...data.hospitalConfig,
    ...req.body,
  };
  saveData(data);
  res.json(data.hospitalConfig);
});

// Hospital Stats
app.get('/api/hospital/stats', (req, res) => {
  const data = loadData();
  const appointments = data.appointments || [];
  const doctors = data.doctors || [];
  const patients = data.patients || [];

  const totalAppointments = appointments.filter((a: any) => a.status !== 'cancelled').length;
  // Revenue means platform fees only. A doctor's consultation fee is collected
  // at the clinic desk, never through this system, so it must not be totalled
  // here — see src/lib/pricing.ts.
  // Refunded bookings returned their fee, so they are excluded.
  const totalRevenue = appointments.filter((a: any) => a.feePaid && !a.refundStatus).length * PLATFORM_FEE;
  const activeDoctors = doctors.length;
  const totalPatients = patients.length;
  const completedConsultations = appointments.filter((a: any) => a.status === 'completed').length;

  res.json({
    totalAppointments,
    totalRevenue,
    activeDoctors,
    totalPatients,
    completedConsultations,
  });
});

// Process Appointment Invoice Payment
app.post('/api/appointments/:id/pay', (req, res) => {
  const data = loadData();
  const apptId = req.params.id;
  const { amountPaid, paymentMethod } = req.body;

  const appt = data.appointments.find((a: any) => a.id === apptId);
  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  if (appt.status === 'cancelled') {
    return res.status(400).json({ error: 'This appointment was cancelled — there is nothing to pay.' });
  }
  if (appt.feePaid) {
    return res.json(appt);
  }

  // Only the ₹50 platform fee is ever collected through the app; the amount
  // the client sends is ignored. `feePaid` is what every screen reads — the
  // endpoint used to set an unused `paymentStatus`, so a paid booking kept
  // showing as UNPAID.
  void amountPaid;
  appt.feePaid = true;
  appt.paymentStatus = 'paid';
  appt.amountPaid = PLATFORM_FEE;
  appt.totalAmount = PLATFORM_FEE;
  appt.paymentMethod = paymentMethod || 'UPI';
  appt.paymentDate = new Date().toISOString();
  appt.paidAt = appt.paymentDate;

  saveData(data);
  res.json(appt);
});

// Submit Appointment Feedback
app.post('/api/appointments/:id/feedback', (req, res) => {
  const data = loadData();
  const apptId = req.params.id;
  const { rating, text } = req.body;

  const appt = data.appointments.find((a: any) => a.id === apptId);
  if (!appt) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  if (appt.status !== 'completed') {
    return res.status(400).json({ error: 'You can rate a visit once the consultation is completed.' });
  }

  // `feedbackRating` is the field every screen reads (the doctor dashboard's
  // average, the history card's "Rated 4★"); this used to write `rating`, so
  // feedback was saved but never shown anywhere.
  const stars = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
  appt.feedbackRating = stars;
  appt.feedbackText = String(text || '').slice(0, 1000);
  appt.feedbackAt = new Date().toISOString();

  saveData(data);
  res.json(appt);
});

// System Purge & Factory Reset
app.post('/api/system/reset', (req, res) => {
  const initialState = {
    doctors: DEFAULT_DOCTORS,
    patients: [
      {
        id: 'patient-1',
        name: 'Aarav Patel',
        email: 'aarav.patel@gmail.com',
        age: 34,
        gender: 'Male',
        contact: '+91 98201 45678',
        abhaId: '91-2345-6789-0123',
        city: 'Mumbai',
        allergies: ['Penicillin', 'Dust Mites'],
        medications: ['Telmisartan 40mg (Morning)'],
        medicalConditions: ['Stage 1 Essential Hypertension', 'Mild Seasonal Asthma'],
        notes: 'Aarav resides in Bandra West, Mumbai. Experiencing mild exertion tightness. Blood pressure is tracked weekly via digital BP monitor.',
      },
      {
        id: 'patient-2',
        name: 'Suresh Kumar',
        email: 'suresh.kumar@outlook.com',
        age: 62,
        gender: 'Male',
        contact: '+91 94140 88210',
        abhaId: '91-5678-1234-9876',
        city: 'Bengaluru',
        allergies: ['Sulfa Drugs'],
        medications: ['Metformin 500mg (Post Lunch)', 'Atorvastatin 10mg (Night)'],
        medicalConditions: ['Type 2 Diabetes Mellitus', 'Hyperlipidemia'],
        notes: 'Suresh lives in Indiranagar, Bengaluru. Under quarterly HbA1c screening. Shows good glycemic control with regular morning walks.',
      },
      {
        id: 'patient-3',
        name: 'Ananya Iyer',
        email: 'deepa.iyer@yahoo.in',
        age: 10,
        gender: 'Female',
        contact: '+91 97112 33445',
        abhaId: '91-9988-7766-5544',
        city: 'Chennai',
        allergies: ['Peanuts', 'Pollen'],
        medications: ['Asthalin Inhaler (SOS)'],
        medicalConditions: ['Pediatric Bronchial Asthma'],
        notes: 'Pediatric asthma care managed under Dr. Ananya Mukherjee. Mother reports seasonal triggers during winter transitions.',
      },
      {
        id: 'patient-4',
        name: 'Pooja Gupta',
        email: 'pooja.gupta@rediffmail.com',
        age: 29,
        gender: 'Female',
        contact: '+91 99580 12345',
        abhaId: '91-4433-2211-0099',
        city: 'New Delhi',
        allergies: ['None'],
        medications: ['Multivitamins', 'Vitamin D3 60k IU'],
        medicalConditions: ['Vitamin D Deficiency', 'Mild Seasonal Rhinitis'],
        notes: 'Resident of Vasant Kunj, Delhi. Visiting for routine annual executive health checkup and vitamin panel review.',
      },
      {
        // The default patient sign-in — see demoAccounts in Login.tsx.
        // Demographics are placeholders; the clinical fields are deliberately
        // empty because inventing a diagnosis for the demo's headline patient
        // is not the same as inventing a phone number. They fill in from the
        // portal's own "Complete Profile" form.
        id: 'patient-5',
        name: 'Rupam Kumar',
        email: 'rupam.kumar@gmail.com',
        age: 32,
        gender: 'Male',
        contact: '+91 90312 44781',
        bloodGroup: 'B+',
        address: 'Line Bazar, Purnea, Bihar',
        emergencyContact: '+91 90312 44782 (Family Primary Contact)',
        city: 'Purnea',
        allergies: [],
        medications: [],
        medicalConditions: [],
        notes: '',
      },
    ],
    documents: [
      {
        id: 'doc-101',
        patientId: 'patient-1',
        title: '12-Lead Electrocardiogram (EKG) Report',
        category: 'Lab Report',
        uploadDate: '2026-06-15',
        fileName: 'ekg_report_aarav.txt',
        fileSize: '2.4 KB',
        fileContentText:
          'PATIENT: Aarav Patel\nABHA ID: 91-2345-6789-0123\nDATE: June 15, 2026\nFACILITY: neXgen Cardiac Sciences, Dwarka, New Delhi\nTEST: 12-Lead Electrocardiogram (EKG)\nFINDINGS: Normal sinus rhythm with a resting heart rate of 72 bpm. PR interval: 160ms, QRS duration: 90ms, QTc: 410ms. No ST-segment elevation or ischaemic changes. Borderline blood pressure recorded at 138/85 mmHg.',
        analysis: {
          summary: '12-lead EKG shows stable normal sinus rhythm at 72 bpm with borderline elevated blood pressure.',
          keyFindings: [
            'Normal sinus rhythm (72 bpm)',
            'Stable cardiac electrical profile',
            'Borderline blood pressure of 138/85 mmHg',
            'No acute ST segment changes',
          ],
          extractedAllergies: [],
          extractedMedications: ['Telmisartan'],
          suggestedFollowUp: 'Monitor blood pressure weekly via digital log and re-evaluate in 3 months with Dr. Rajesh Sharma.',
          riskLevel: 'Low',
          analyzedAt: '2026-06-15',
        },
      },
      {
        id: 'doc-102',
        patientId: 'patient-2',
        title: 'Metabolic Panel & HbA1c Profile',
        category: 'Lab Report',
        uploadDate: '2026-06-20',
        fileName: 'metabolic_panel_suresh.txt',
        fileSize: '1.8 KB',
        fileContentText:
          'PATIENT: Suresh Kumar\nABHA ID: 91-5678-1234-9876\nDATE: June 20, 2026\nPANEL: Comprehensive Diabetic & Lipid Panel\nRESULTS:\nFasting Blood Glucose: 112 mg/dL (Slightly Elevated)\nHbA1c: 6.8% (Target < 7.0% for controlled diabetes)\nTotal Cholesterol: 185 mg/dL (Normal)\nLDL Cholesterol: 95 mg/dL (Desirable)\nHHDL Cholesterol: 42 mg/dL\nTriglycerides: 160 mg/dL (Normal-Borderline)\nRECOMMENDATION: Maintain low glycemic Indian diet and continue Metformin compliance.',
        analysis: {
          summary:
            'Lab results indicate well-controlled diabetes with HbA1c at 6.8% and desirable lipid profile under Atorvastatin therapy.',
          keyFindings: [
            'HbA1c at 6.8% showing controlled diabetes',
            'Fasting glucose elevated at 112 mg/dL',
            'LDL cholesterol at desirable level of 95 mg/dL',
            'Triglycerides at 160 mg/dL',
          ],
          extractedAllergies: [],
          extractedMedications: ['Metformin', 'Atorvastatin'],
          suggestedFollowUp:
            'Maintain healthy low-glycemic Indian diet, regular physical activity, and continue current dosage of Metformin. Recheck HbA1c in 3 months.',
          riskLevel: 'Medium',
          analyzedAt: '2026-06-20',
        },
      },
    ],
    appointments: [
      {
        id: 'appt-201',
        doctorId: 'doc-1',
        patientId: 'patient-1',
        date: '2026-08-05',
        timeSlot: '09:00 AM',
        status: 'scheduled',
        type: 'video',
        patientName: 'Aarav Patel',
        patientAge: 34,
        patientContact: '+91 98201 45678',
        notes: 'Experiencing mild chest tightness during morning jogging. Requesting Dr. Sharma to review latest EKG report.',
        documentIds: ['doc-101'],
        invoiceAmount: 1200,
        feePaid: false,
      },
      {
        id: 'appt-202',
        doctorId: 'doc-1',
        patientId: 'patient-4',
        date: '2026-08-05',
        timeSlot: '10:00 AM',
        status: 'scheduled',
        type: 'visiting',
        patientName: 'Pooja Gupta',
        patientAge: 29,
        patientContact: '+91 99580 12345',
        notes: 'Routine executive cardiovascular assessment and family history consultation.',
        documentIds: [],
        invoiceAmount: 1200,
        feePaid: true,
        paymentMethod: 'UPI / GPay',
        amountPaid: 50,
      },
      {
        id: 'appt-203',
        doctorId: 'doc-1',
        patientId: 'patient-2',
        date: '2026-08-05',
        timeSlot: '11:00 AM',
        status: 'scheduled',
        type: 'visiting',
        patientName: 'Suresh Kumar',
        patientAge: 62,
        patientContact: '+91 94140 88210',
        notes: 'Diabetic neuropathy follow-up and quarterly HbA1c review.',
        documentIds: ['doc-102'],
        invoiceAmount: 1200,
        feePaid: false,
      },
      {
        id: 'appt-204',
        doctorId: 'doc-2',
        patientId: 'patient-3',
        date: '2026-08-05',
        timeSlot: '09:00 AM',
        status: 'scheduled',
        type: 'visiting',
        patientName: 'Ananya Iyer',
        patientAge: 10,
        patientContact: '+91 97112 33445',
        notes: 'Asthalin inhaler refill and checkup for seasonal asthma.',
        documentIds: [],
        invoiceAmount: 900,
        feePaid: true,
        paymentMethod: 'Paytm UPI',
        amountPaid: 50,
      },
    ],
    hospitalConfig: DEFAULT_HOSPITAL_CONFIG,
  };

  saveData(initialState);
  res.json({ success: true });
});

// Initialize dev server or production hosting
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Dev only: pulled in on demand so it never enters the production graph.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
