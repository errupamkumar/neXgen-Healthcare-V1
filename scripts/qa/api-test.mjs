// API-level checks for the booking rules in server.ts.
//   node scripts/qa/api-test.mjs [baseUrl]   (default http://localhost:3001)
// Creates its own test patient, bookings and a doctor application — back up
// data.json first. Use 127.0.0.1 rather than localhost on Windows (IPv6).
const BASE = process.argv[2] || 'http://127.0.0.1:3001';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); }
};
const post = async (url, body) => {
  const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};
const get = async url => (await fetch(BASE + url)).json();

const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const doctors = await get('/api/doctors');
const doc = doctors.find(d => d.id === 'doc-4'); // 4 per slot, video enabled
const noVideo = doctors.find(d => d.videoEnabled === false);
const D2 = day(2), D3 = day(3);
const stamp = Date.now().toString().slice(-6);
const phone = `98${stamp}11`;

// Create a fresh patient
const pat = (await post('/api/patients', { name: `QA Patient ${stamp}`, contact: phone, age: 30, gender: 'Male' })).body;
check('create patient', pat && pat.id);

const base = { doctorId: doc.id, patientId: pat.id, date: D2, timeSlot: doc.slots[0], type: 'visiting', patientName: pat.name, patientAge: 30, patientContact: phone, paymentMethod: 'UPI Instant', totalAmount: 99999 };

const b1 = await post('/api/appointments', base);
check('book ok', b1.status === 200, JSON.stringify(b1.body));
check('fee forced to 50', b1.body.amountPaid === 50 && b1.body.totalAmount === 50 && b1.body.feePaid === true, JSON.stringify(b1.body));
check('token issued', /^T-\d\d$/.test(b1.body.tokenNo || ''), b1.body.tokenNo);
check('booking no', /^BK-NXG-\d+$/.test(b1.body.bookingNo || ''), b1.body.bookingNo);

const dup = await post('/api/appointments', { ...base, timeSlot: doc.slots[1] });
check('duplicate same doctor/day rejected', dup.status === 409, JSON.stringify(dup.body));

const badSlot = await post('/api/appointments', { ...base, date: D3, timeSlot: '03:17 AM' });
check('slot not in timings rejected', badSlot.status === 400, JSON.stringify(badSlot.body));

const past = await post('/api/appointments', { ...base, date: day(-1) });
check('past slot rejected', past.status === 400);

const badAge = await post('/api/appointments', { ...base, date: D3, patientAge: 0 });
check('invalid age rejected', badAge.status === 400);

if (noVideo) {
  const v = await post('/api/appointments', { ...base, doctorId: noVideo.id, date: D3, timeSlot: noVideo.slots[0], type: 'video' });
  check('video on non-video doctor rejected', v.status === 400, JSON.stringify(v.body));
}

const counter = await post('/api/appointments', { ...base, date: D3, paymentMethod: 'Pay at OPD Counter' });
check('counter booking held unpaid', counter.status === 200 && counter.body.feePaid === false && counter.body.amountPaid === 0, JSON.stringify(counter.body));
const paid = await post(`/api/appointments/${counter.body.id}/pay`, { amountPaid: 1200, paymentMethod: 'UPI' });
check('pay marks feePaid and 50', paid.body.feePaid === true && paid.body.amountPaid === 50, JSON.stringify(paid.body));

// Reschedule b1 to D3 slot 2 -> conflicts with duplicate rule? reschedule is allowed (same appointment)
const rs = await post(`/api/appointments/${b1.body.id}/reschedule`, { date: day(4), timeSlot: doc.slots[1] });
check('reschedule ok, fee carried', rs.status === 200 && rs.body.date === day(4) && rs.body.feePaid === true && (rs.body.rescheduleHistory || []).length === 1, JSON.stringify(rs.body));
const rsSame = await post(`/api/appointments/${b1.body.id}/reschedule`, { date: day(4), timeSlot: doc.slots[1] });
check('reschedule to same slot rejected', rsSame.status === 400);

// Cancel with refund (>2h away)
const c = await post(`/api/appointments/${b1.body.id}/cancel`, {});
check('cancel ok with refund', c.status === 200 && c.body.status === 'cancelled' && c.body.refundStatus === 'initiated', JSON.stringify(c.body));
const c2 = await post(`/api/appointments/${b1.body.id}/cancel`, {});
check('double cancel rejected', c2.status === 400);

// Feedback only after completion
const fb = await post(`/api/appointments/${counter.body.id}/feedback`, { rating: 4, text: 'x' });
check('feedback before completion rejected', fb.status === 400);
await post(`/api/appointments/${counter.body.id}/status`, { status: 'completed', actorRole: 'doctor', consultation: { diagnosis: 'QA', prescriptions: [] } });
const fb2 = await post(`/api/appointments/${counter.body.id}/feedback`, { rating: 9, text: 'Great' });
check('feedback saved as feedbackRating (clamped)', fb2.status === 200 && fb2.body.feedbackRating === 5, JSON.stringify(fb2.body));

// Doctor application
const appBody = { name: `QA Doctor ${stamp}`, specialty: 'Dentist', registrationNo: `REG-${stamp}`, hospital: 'QA Dental Care', phone: `97${stamp}22`, slots: ['10:00 AM', '11:00 AM'] };
const ap = await post('/api/doctor-applications', appBody);
check('doctor application created', ap.status === 200 && ap.body.status === 'pending', JSON.stringify(ap.body));
const apDup = await post('/api/doctor-applications', appBody);
check('duplicate application rejected', apDup.status === 409);
const apBad = await post('/api/doctor-applications', { name: 'x' });
check('incomplete application rejected', apBad.status === 400);
const appr = await post(`/api/doctor-applications/${ap.body.id}/approve`, {});
check('approve creates doctor', appr.status === 200 && appr.body.doctor && appr.body.doctor.name.startsWith('Dr.'), JSON.stringify(appr.body));
const docsAfter = await get('/api/doctors');
check('approved doctor listed', docsAfter.some(d => d.id === appr.body.doctor.id));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(JSON.stringify({ patientId: pat.id, doctorId: appr.body?.doctor?.id, applicationId: ap.body?.id }));
process.exit(fail ? 1 : 0);
