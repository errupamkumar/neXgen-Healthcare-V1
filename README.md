<p align="center">
  <img src="docs/readme/banner.png" alt="neXgen Healthcare — book any doctor for ₹50; the doctor's fee stays 100% theirs" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white" alt="Node 20+">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.8">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" alt="Express 4">
  <img src="https://img.shields.io/badge/Vercel-ready-000000?logo=vercel&logoColor=white" alt="Vercel ready">
  <img src="https://img.shields.io/badge/API_rules-23%2F23_passing-0d9488" alt="23 of 23 API rule checks passing">
  <img src="https://img.shields.io/badge/E2E-55%2F55_passing-0d9488" alt="55 of 55 end-to-end checks passing">
  <img src="https://img.shields.io/badge/UI-English_·_हिन्दी-1f57e0" alt="English and Hindi">
</p>

<p align="center">
  <b>Online OPD booking for every doctor in town.</b><br>
  Patients confirm a seat and get a token for a flat <b>₹50</b>. The doctor's consultation fee is paid at the clinic, exactly as today — the platform never sets, sees or takes a share of it.
</p>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-step-by-step-user-guide">User guide</a> ·
  <a href="#-video-for-doctors">Video for doctors</a> ·
  <a href="#-deploying">Deploy (Vercel)</a> ·
  <a href="#%EF%B8%8F-how-it-is-built">Architecture</a> ·
  <a href="#-quality">Quality</a>
</p>

---

## 📑 Contents

1. [The model — ₹50, and nothing else](#-the-model--50-and-nothing-else)
2. [Features at a glance](#-features-at-a-glance)
3. [Quick start](#-quick-start) — running in 4 steps
4. [Demo accounts](#-demo-accounts)
5. [Step-by-step user guide](#-step-by-step-user-guide) — 12 steps with screenshots
6. [Video for doctors](#-video-for-doctors)
7. [Booking rules](#-booking-rules-enforced-by-the-server)
8. [Deploying](#-deploying) — Vercel, VM, any Node host
9. [How it is built](#%EF%B8%8F-how-it-is-built) — architecture, storage, API, project structure
10. [Configuration](#%EF%B8%8F-configuration) · [Quality](#-quality) · [Commands](#-commands)
11. [Troubleshooting](#%EF%B8%8F-troubleshooting) · [Security & limitations](#-security--limitations) · [Roadmap](#%EF%B8%8F-roadmap)

---

## 💡 The model — ₹50, and nothing else

Doctors are understandably protective of their fees. neXgen is built around that:

| Who pays | What | To whom | When |
|---|---|---|---|
| Patient | **₹50 booking fee** — confirms the seat and issues an OPD token | neXgen (the platform) | Online, at booking (or at the counter) |
| Patient | **Doctor's consultation fee** — unchanged | The doctor | At the clinic, on the day — as always |
| Doctor | **Nothing.** Free to join, 0% commission | — | — |

```mermaid
flowchart LR
    P([Patient]) -- "₹50 booking fee<br/>(online)" --> N[neXgen platform]
    P -- "Consultation fee<br/>(at the clinic, 100%)" --> D([Doctor])
    N -- "Confirmed seat + OPD token<br/>reminders · waitlist · Rx vault" --> P
    N -- "Organised queue · new patients<br/>fewer no-shows · 0% commission" --> D
```

The server enforces this: whatever a client sends, a booking is charged exactly ₹50, revenue counts only paid-and-not-refunded bookings, and no patient-facing screen, receipt or onboarding form carries a doctor-fee field.

---

## ✨ Features at a glance

<table>
<tr>
<td width="33%" valign="top">

### 🧑 Patients
- Find doctors by speciality, area, symptom or name — see each doctor's **next free slot**
- Book in 3 steps, pay ₹50 (UPI, card, net banking) or hold the slot and pay at the counter
- Instant **OPD token** and booking number
- **My Appointments**: directions, call, calendar, receipt, free **reschedule**, **cancel with refund** (2 h+ before)
- Home page with next visit, countdown and "book again"
- Health vault, visit history, ratings

</td>
<td width="33%" valign="top">

### 🩺 Doctors
- Free self-onboarding from the website — admin verifies and publishes
- Dashboard: bookings today, chamber load, follow-ups, ratings
- Token-ordered queue with patient history and documents
- Digital prescriptions straight into the patient's vault
- Multiple chambers, each with its own address, map and timings
- Optional video consultations

</td>
<td width="33%" valign="top">

### 🏥 Front desk & admin
- Book on behalf of walk-in and phone patients
- Live queue per doctor with **tokens**; **collect ₹50** taken in cash
- Message every patient booked with a doctor ("running 20 min late")
- **Doctor Onboarding** review queue: approve & publish in one click
- Platform-fee analytics, capacity charts, doctor availability

</td>
</tr>
<tr>
<td valign="top">

### 🌐 Public website
- Full marketing site: hero search, specialities, doctor cards, pricing, FAQ
- "Join as a doctor" application form (no fee field — by design)
- Book from any doctor card → sign in / register with OTP → lands on that doctor's slots

</td>
<td valign="top">

### 🎨 Experience
- **English / हिन्दी** switch across the website and every patient screen
- **Light / dark** theme, remembered per device
- Responsive from 360 px phones to 4K (auto-scaled on QHD / 4K screens)
- Role-coloured identity: one logo, four console colours
- Login survives a refresh

</td>
<td valign="top">

### 🎬 Video for doctors
- 3½-minute animated presentation, built from scratch in the app itself
- 1080p MP4 with Indian-English voice-over and EN + HI subtitle tracks
- Hindi-captioned copy for WhatsApp sharing
- Plays on the website and live at `/doctors-video`

</td>
</tr>
</table>

<p align="center">
  <img src="docs/readme/01-website-hero.jpg" alt="Public website — hero with speciality and location search" width="49%">
  <img src="docs/readme/02-website-dark-hindi.jpg" alt="The same page in Hindi with the dark theme" width="49%">
</p>

---

## 🚀 Quick start

### Step 1 — Prerequisites

- **Node.js 20 or newer** (`node -v`)
- Google Chrome — only for the screenshot, QA and video scripts

### Step 2 — Install

```bash
npm install
```

### Step 3 — Configure (optional)

Copy `.env.example` to `.env`. Everything has a sensible default; the only secret is `GEMINI_API_KEY`, used by the optional AI document analysis. See [Configuration](#%EF%B8%8F-configuration).

### Step 4 — Run

```bash
npm run dev
```

Open **http://localhost:3001**. The same process serves the website, the app and the API; data lives in `data.json`.

> 💡 On Windows, scripts that call the API should use `http://127.0.0.1:3001` — Node resolves `localhost` to IPv6 first and the server listens on IPv4.

---

## 👤 Demo accounts

Open **Sign in → Need demo login credentials?** for one-click sign-in, or use:

| Role | Email | Password | Lands on |
|---|---|---|---|
| 🧑 Patient | rupam.kumar@gmail.com | `patient123` | Home — next visit, quick booking |
| 🧑 Patient (with history) | aarav.patel@gmail.com | `patient123` | Home |
| 🩺 Doctor | dr.santosh.kumar@nexgenhealth.in | `doctor123` | My Dashboard |
| 🩺 Doctor | dr.rajesh.sharma@nexgenhealth.in | `doctor123` | My Dashboard |
| 🏥 Front desk | frontdesk@nexgenhealth.in | `frontdesk123` | Desk Workspace |
| 🛡️ Admin | admin@nexgenhealth.in | `admin123` | Admin Workspace |

**Mobile + OTP:** any registered patient mobile, code `123456`. **New patient?** Register with just a name and mobile number (same OTP).

---

## 🧭 Step-by-step user guide

### 1️⃣ Find a doctor — public website

Search by speciality and location, or type a symptom, clinic or area. Every card shows rating, experience, chamber, consult modes and the **next free slot**.

<p align="center"><img src="docs/readme/03-website-doctors.jpg" alt="Doctor cards with next available slot and Book for ₹50" width="90%"></p>

### 2️⃣ See exactly what you pay

The pricing card spells it out: ₹50 to neXgen online, the doctor's fee at the clinic, no GST or convenience charge on top.

<p align="center"><img src="docs/readme/04-website-pricing.jpg" alt="How it works and pricing explainer" width="90%"></p>

### 3️⃣ Sign in — or register in 30 seconds

Tapping **Book for ₹50** remembers the doctor, opens sign-in on Mobile & OTP, and continues straight to that doctor's slots afterwards. New patients register with a name and mobile.

<p align="center"><img src="docs/readme/07-sign-in-to-book.jpg" alt="Sign-in screen showing 'Sign in to book Dr. …'" width="90%"></p>

### 4️⃣ Pick the doctor, day and time

Step 1 searches the directory; step 2 offers 14 days of slots with live seats-left counts. Full slots offer the waitlist; slots that have started are disabled.

<p align="center">
  <img src="docs/readme/08-book-step1-doctor.jpg" alt="Booking step 1 — choose a doctor" width="49%">
  <img src="docs/readme/09-book-step2-slot.jpg" alt="Booking step 2 — day and time" width="49%">
</p>

### 5️⃣ Review and pay ₹50

The review shows both faces, the exact chamber on a map, the slot, and the single amount payable. Choose UPI, card, net banking — or **hold the slot and pay at the counter**.

<p align="center"><img src="docs/readme/10-book-step3-review.jpg" alt="Booking review and payment" width="90%"></p>

### 6️⃣ Token, booking number, directions

The server issues the booking number and an **OPD token** in booking order (T-01, T-02 …). Reminders, delay alerts and a printable receipt follow.

<p align="center"><img src="docs/readme/11-booking-confirmed.jpg" alt="Booking confirmed with OPD token" width="90%"></p>

### 7️⃣ Manage it — My Appointments

Upcoming, past and cancelled tabs. **Reschedule** keeps the booking and the ₹50; **cancel** explains the refund rule before it happens.

<p align="center">
  <img src="docs/readme/12-my-appointments.jpg" alt="My Appointments with token, directions, reschedule and cancel" width="49%">
  <img src="docs/readme/13-cancel-refund-rules.jpg" alt="Cancel dialog explaining the refund" width="49%">
</p>

### 8️⃣ The patient's home

Next visit with countdown and token, quick search, fee-due nudges, profile completion, "book again" and speciality shortcuts — in English or Hindi, light or dark.

<p align="center">
  <img src="docs/readme/14-patient-home.jpg" alt="Patient home" width="49%">
  <img src="docs/readme/15-patient-home-dark-hindi.jpg" alt="Patient home in Hindi, dark theme" width="49%">
</p>

### 9️⃣ Front desk — tokens and the ₹50 at the counter

Per-doctor live queue showing each patient's token. Bookings still owing the ₹50 show **Collect**; the desk can book walk-ins and phone patients too.

<p align="center"><img src="docs/readme/19-desk-queue-tokens.jpg" alt="Front-desk queue with OPD tokens" width="90%"></p>

### 🔟 Doctors — dashboard and queue

A consultant lands on their own KPIs: booked today, still waiting, chamber load, follow-ups, video consults and ratings.

<p align="center"><img src="docs/readme/18-doctor-dashboard.jpg" alt="Doctor dashboard" width="90%"></p>

### 1️⃣1️⃣ Onboard doctors — apply, verify, publish

Doctors apply from the website (registration number, chamber, OPD timings — **no fee field**). Admins review in **Doctor Onboarding** and publish in one click.

<p align="center">
  <img src="docs/readme/06-join-as-doctor.jpg" alt="Join as a doctor form" width="49%">
  <img src="docs/readme/20-admin-doctor-onboarding.jpg" alt="Admin doctor onboarding queue" width="49%">
</p>

### 1️⃣2️⃣ On a phone

The website, booking and patient portal are built mobile-first, with a thumb-reach tab bar for patients.

<p align="center">
  <img src="docs/readme/16-mobile-website.jpg" alt="Website on a phone" width="30%">
  &nbsp;&nbsp;
  <img src="docs/readme/17-mobile-patient-hindi.jpg" alt="Patient home on a phone, in Hindi" width="30%">
</p>

---

## 🎬 Video for doctors

A 3½-minute presentation that walks a doctor through every benefit — discovery, fewer no-shows, the waitlist, tokens, video consults, digital Rx, ratings, multi-chamber dashboards, an illustrative revenue example and how to join.

<p align="center">
  <a href="public/media/nexgen-for-doctors.mp4"><img src="docs/readme/24-video-poster.jpg" alt="Play: neXgen for doctors (3½ min)" width="80%"></a>
</p>

<p align="center">
  <img src="docs/readme/21-video-your-fee.jpg" alt="Scene — your fee stays 100% yours" width="32%">
  <img src="docs/readme/22-video-be-found.jpg" alt="Scene — be found by every patient nearby" width="32%">
  <img src="docs/readme/23-video-revenue.jpg" alt="Scene — illustrative revenue example" width="32%">
</p>

| File | Use |
|---|---|
| [`public/media/nexgen-for-doctors.mp4`](public/media/nexgen-for-doctors.mp4) | 1920×1080 · 30 fps · H.264/AAC · English + Hindi subtitle tracks — played on the website |
| [`docs/video/nexgen-for-doctors-hindi-captions.mp4`](docs/video/nexgen-for-doctors-hindi-captions.mp4) | Hindi captions burned in — for WhatsApp and social sharing (not deployed) |
| `/doctors-video` | The live, animated version with synced narration and EN/HI caption toggle — ideal for presenting on a laptop |

Every frame is rendered from the app's own React stage (`src/components/presentation/`) — no stock footage. Edit the script in `narration.json` and rebuild with `npm run video` — see [`scripts/doctor-video/README.md`](scripts/doctor-video/README.md). The revenue scene (₹400 fee × 4 extra patients/day × 26 days) is labelled as an illustration on screen and in the narration.

---

## 🛡 Booking rules (enforced by the server)

| Rule | Behaviour |
|---|---|
| Platform fee | Always ₹50. Amounts sent by the client are ignored. |
| Pay at counter | Seat is held with the fee **due**; the desk marks it collected. Not counted as revenue until paid. |
| OPD token | Issued per doctor per day in booking order (`T-01`…). Never re-issued after a cancellation. |
| One booking per day | A patient can hold one scheduled booking per doctor per day (HTTP 409 otherwise). |
| Valid slots only | Doctor must be active; the slot must be one of the doctor's timings, in the future, with a free seat; video only if the doctor offers it. |
| Reschedule | Moves the booking in place — same booking number, the ₹50 carries over, a new token if the day changes, the old seat is offered to the waitlist. |
| Cancel | Patients: until the slot starts; refund of ₹50 if 2 h+ before. Staff cancels refund in full. |
| Feedback | Only after a completed visit; 1–5 stars. |
| Doctor onboarding | Applications are pending until an admin approves; duplicates by mobile or registration number are rejected. |

---

## 🚢 Deploying

### ▲ Vercel (website + API in one project)

The repository is Vercel-ready: `vercel.json` builds the Vite site to `dist/` and runs the **same Express API** (`server.ts`) as a serverless function at `api/index.ts`, with every `/api/*` request rewritten to it.

1. **Import the repository** in Vercel. Framework, build command (`npm run build:web`) and output (`dist`) come from `vercel.json`.
2. **Add durable storage** — Vercel's filesystem is read-only and resets on cold starts:
   - *Storage → Marketplace → Upstash (Redis)* and connect it to the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically
     (or set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` yourself).
   - The first API request seeds the store from `data.json`.
3. **Environment variables** (optional): `GEMINI_API_KEY` for AI document analysis, any `VITE_*` flags from `.env.example`.
4. **Deploy**, then open **`/api/health`**:

   ```json
   { "ok": true, "storage": "kv", "persistent": true, "vercel": true }
   ```

   `"storage": "tmp", "persistent": false` means no KV store is connected — the API still works on a copy of `data.json`, but changes are lost whenever the function cold-starts. Fine for a demo, not for real bookings.

```mermaid
flowchart LR
    B[Browser] -->|"/, /doctors-video, /assets, /media"| CDN[Vercel CDN<br/>dist/ from vite build]
    B -->|"/api/*  (rewrite)"| F["Serverless function<br/>api/index.ts → server.ts (Express)"]
    F <-->|"REST · one JSON document"| KV[(Upstash Redis /<br/>Vercel KV)]
    F -.->|"no KV configured"| T[("/tmp copy of data.json<br/>ephemeral")]
```

> **Why not the FastAPI `backend/`?** It predates the current booking engine (tokens, reschedule, refunds, doctor onboarding). The Express API is the one the frontend is built and tested against; `backend/` is kept for reference.

**Using a separately hosted API instead?** Point the first rewrite in `vercel.json` at it (`"destination": "https://your-api.example.com/api/$1"`) and remove the `functions` block.

### 🖥️ Linux VM

`npm run package` builds a small release tarball; [DEPLOYMENT.md](DEPLOYMENT.md) covers provisioning, systemd, TLS, backups and rollback. On a VM the API uses `data.json` on disk.

### 🧱 Any Node host (Render, Railway, a container)

```bash
npm run build                 # dist/ (site) + dist/server.cjs (API)
NODE_ENV=production PORT=8080 npm start
```

Give the service a persistent disk for `data.json`, or set the KV variables above.

---

## 🏗️ How it is built

### Architecture

```mermaid
flowchart TB
    subgraph Client["Browser — React 19 + Vite + Tailwind 4"]
        L[Public website] --> A[App shell · role-based rail]
        A --> PT[Patient: Home · Book · My Appointments · Vault]
        A --> DR[Doctor: Dashboard · Queue · Profile]
        A --> FD[Desk/Admin: Workspace · Queue · Messages · Onboarding]
        P[(Preferences<br/>lang · theme · session)] --- A
    end
    subgraph Server["Express API — server.ts"]
        R[Booking rules<br/>fee · tokens · slots · refunds] --> S[(Storage adapter<br/>file · kv · tmp)]
        G[Gemini document analysis]
    end
    Client -->|"fetch /api/*"| Server
```

### Booking journey

```mermaid
sequenceDiagram
    actor Pt as Patient
    participant W as Website / app
    participant API as Express API
    participant Doc as Clinic
    Pt->>W: Search speciality / area
    W->>API: GET /api/doctors, /api/appointments
    W-->>Pt: Doctor cards with next free slot
    Pt->>W: Book for ₹50 → sign in (OTP)
    Pt->>W: Pick day & slot, pay ₹50
    W->>API: POST /api/appointments
    API->>API: validate slot · one per day · charge ₹50 · issue token
    API-->>W: booking no. + token T-07
    Pt->>Doc: Arrives, shows token, pays the doctor's fee
    Doc->>API: Doctor closes visit + digital Rx
    API-->>Pt: Rx in health vault · rate the visit
```

### Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript 5.8, Tailwind CSS 4 (central light/dark theme), lucide-react, Recharts |
| Fonts | Plus Jakarta Sans · Noto Sans Devanagari · IBM Plex Mono |
| i18n | Typed English/Hindi dictionary (`src/i18n/strings.ts`) — a missing Hindi string is a compile error |
| API | Express 4 (`server.ts`), one JSON document per dataset |
| Storage | `data.json` locally · Upstash Redis / Vercel KV REST on serverless · `/tmp` demo fallback |
| AI | Google Gemini (optional) for medical-document summaries |
| Video | React stage + Playwright frame capture + Windows neural TTS + ffmpeg |
| Hosting | Vercel (static + serverless), Linux VM, or any Node host |

### API reference

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Storage mode and persistence check |
| `GET /api/doctors` · `POST /api/doctors` · `POST /api/doctors/:id/profile` · `POST /api/doctors/:id/availability` | Directory and doctor maintenance |
| `GET /api/appointments` · `POST /api/appointments` | List / book (₹50, token, validation) |
| `POST /api/appointments/:id/reschedule` · `/cancel` · `/pay` · `/feedback` · `/status` | Manage a booking |
| `GET /api/slots-tracker?doctorId&date` | Seats taken per slot |
| `GET/POST /api/waitlist` · `GET /api/notifications` | Waitlist and slot-opened alerts |
| `GET/POST /api/doctor-applications` · `POST /api/doctor-applications/:id/approve` · `/reject` | Doctor onboarding |
| `GET/POST /api/patients` · `GET/POST /api/documents` · `POST /api/documents/:id/analyze` | Patients, vault, AI analysis |
| `GET/POST /api/messages` · `POST /api/messages/:id/read` | Desk → patient messages |
| `GET/POST /api/hospital/config` · `GET /api/hospital/stats` | Settings and platform-fee stats |

### Project structure

```text
nexgen-Medical/
├── server.ts                    Express API — booking rules, storage adapter
├── api/index.ts                 Vercel serverless entry (wraps server.ts)
├── vercel.json                  Build, function and rewrite config
├── data.json                    Local dataset (seed for KV / tmp stores)
├── public/
│   ├── favicon.svg
│   └── media/                   Doctor video, narration, subtitles, poster
├── src/
│   ├── App.tsx                  Shell, navigation, session, routing
│   ├── i18n/strings.ts          English + Hindi strings
│   ├── lib/                     preferences (lang/theme), doctors, appointments, pricing
│   └── components/
│       ├── public/              Website, join-as-doctor form
│       ├── patient/             Home, My Appointments
│       ├── admin/               Doctor onboarding review
│       ├── brand/Logo.tsx       Role-coloured logo
│       ├── presentation/        The doctor video (stage + narration.json)
│       └── …                    Booking wizard, queues, dashboards, vault, messages
├── scripts/
│   ├── doctor-video/            Video build pipeline (TTS, capture, encode)
│   └── qa/                      API, end-to-end and Vercel-simulation tests
├── docs/                        README images, share video, user manual
├── backend/                     Legacy FastAPI prototype (not used by the frontend)
└── DEPLOYMENT.md                Linux VM guide
```

---

## ⚙️ Configuration

Copy `.env.example` → `.env`. Client flags (`VITE_*`) are read once at build time by `src/config.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | API + app port (local / VM) |
| `GEMINI_API_KEY` | — | Enables AI document analysis |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | — | Durable Redis store (Vercel KV / Upstash). Also accepts `UPSTASH_REDIS_REST_URL` / `_TOKEN` |
| `NEXGEN_DATA_KEY` | `nexgen:data` | Redis key holding the dataset |
| `VITE_DEMO_OTP` | `123456` | Sandbox OTP for sign-in and registration |
| `VITE_OTP_LOGIN_ENABLED` | `true` | Offer Mobile & OTP sign-in |
| `VITE_PATIENT_SELF_REGISTRATION` | `true` | Allow patients to register themselves |
| `VITE_SINGLE_PATIENT_PROFILE` | `true` | One profile per patient login |
| `VITE_DOCTOR_LIST_REQUIRE_SEARCH` | `true` | Hide the in-app directory until the patient searches |
| `VITE_DOCTOR_MAP_ENABLED` | `true` | Map thumbnails for chambers |

The full, commented list is in [`.env.example`](.env.example).

---

## ✅ Quality

| Check | Result | Run it |
|---|---|---|
| TypeScript | clean | `npm run lint` |
| Production build (site + API bundle) | passes | `npm run build` |
| API booking rules — fee, tokens, duplicates, slots, video, counter payment, reschedule, cancel/refund, feedback, onboarding | **23 / 23** | `npm run qa:api` |
| End-to-end in Chrome — website → OTP registration → book → reschedule → pay at counter → cancel; every role; phones; Hindi/English and light/dark persistence; video playback with both subtitle tracks | **55 / 55**, no console errors | `npm run qa:e2e` |
| Vercel simulation — the real `api/index.ts` handler with a KV store (both rewrite URL shapes, cold start, bad credentials) and the `/tmp` fallback | **23 / 23** in each mode | see `scripts/qa/vercel-sim/` |

> The QA scripts create real bookings — back up `data.json` (or run against a copy) first.

---

## 🧰 Commands

| Command | What it does |
|---|---|
| `npm run dev` | Website + app + API on port 3001 with hot reload |
| `npm run build` | `dist/` (site) and `dist/server.cjs` (API) |
| `npm run build:web` | Site only — what Vercel runs |
| `npm start` | Production server: API + built site |
| `npm run package` | Release tarball for the VM ([DEPLOYMENT.md](DEPLOYMENT.md)) |
| `npm run lint` | TypeScript check |
| `npm run qa:api` · `npm run qa:e2e` | Booking-rule and end-to-end tests |
| `npm run video` | Rebuild the doctor video (needs ffmpeg, Chrome, Windows TTS) |

---

## 🛠️ Troubleshooting

<details>
<summary><b>Vercel: <code>/api/…</code> returns 404</b></summary>

The project was deployed as a static site only. Make sure `vercel.json` and `api/index.ts` are committed, the Vercel project's root directory is this folder, and redeploy. `GET /api/health` should answer.
</details>

<details>
<summary><b>Vercel: bookings disappear after a while</b></summary>

`/api/health` shows `"storage": "tmp"` — no KV store is connected, so the function works on an ephemeral copy of `data.json`. Connect Upstash Redis / Vercel KV (sets `KV_REST_API_URL` + `KV_REST_API_TOKEN`) and redeploy.
</details>

<details>
<summary><b>Vercel: API returns 503 "data store is unavailable"</b></summary>

The KV URL or token is wrong, or the store is unreachable. Check the two variables in *Project → Settings → Environment Variables*.
</details>

<details>
<summary><b>Port 3001 is already in use</b></summary>

Another copy is running. Stop it, or start on another port: `PORT=3002 npm run dev`.
</details>

<details>
<summary><b>AI document analysis fails</b></summary>

Set `GEMINI_API_KEY` in `.env` (locally) or in the host's environment variables. Everything else works without it.
</details>

<details>
<summary><b>Start again with the demo data</b></summary>

Restore `data.json` from git (`git checkout data.json`), or use *Admin Workspace → System reset*. On Vercel with KV, delete the `nexgen:data` key to reseed from `data.json`.
</details>

---

## 🔐 Security & limitations

This is a production-shaped MVP, not yet a hardened production system:

- **No server-side authentication.** Sign-in is checked in the browser and the API is open — see [DEPLOYMENT.md §1](DEPLOYMENT.md#1-read-this-first--the-api-is-unauthenticated) before exposing it publicly.
- **Payments, OTP, SMS and WhatsApp are simulated.** No money moves and no messages leave the server.
- **One JSON document** holds all data, with last-write-wins on concurrent edits — suited to a single clinic network and demos, not high write volume.
- Staff-internal screens (doctor queue tools, desk analytics, admin settings) are in English; everything patient-facing is bilingual.

---

## 🗺️ Roadmap

- Server-side auth (JWT sessions, real OTP via an SMS gateway)
- Razorpay / UPI payment gateway with automatic refunds
- WhatsApp & SMS reminders through a real provider
- Relational database (MySQL/Postgres) in place of the JSON document
- Doctor self-service: timings, leave days and chamber management from the doctor console
- Hindi voice-over for the doctor video (needs a Hindi neural voice — see `scripts/doctor-video/README.md`)
- PWA install and offline token card

---

<p align="center">
  <sub>© neXgen Healthcare · Licensed under Apache-2.0 · Powered by <b>SRM ECO TECH</b></sub>
</p>
