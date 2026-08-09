/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  Search, 
  UserPlus, 
  AlertTriangle, 
  Pill, 
  Heart, 
  FileText, 
  Calendar, 
  Clock, 
  Edit3, 
  Plus, 
  Check, 
  X,
  UserCheck,
  Activity,
  TrendingUp,
  BarChart2,
  PlusCircle,
  Trash2,
  Sliders,
  Flame,
  Stethoscope
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { PatientHistory, Appointment, MedicalDocument } from '../types';
import ConsultationHistory from './ConsultationHistory';

interface VitalEntry {
  id: string;
  date: string;
  systolic: number; // BP mmHg
  diastolic: number; // BP mmHg
  pulse: number; // BPM
  glucose: number; // Fasting Glucose mg/dL
  spO2: number; // %
  hemoglobin: number; // g/dL
}

const INITIAL_VITALS: Record<string, VitalEntry[]> = {
  default: [
    { id: 'v1', date: 'Mar 10', systolic: 138, diastolic: 88, pulse: 78, glucose: 118, spO2: 97, hemoglobin: 13.2 },
    { id: 'v2', date: 'Apr 02', systolic: 132, diastolic: 85, pulse: 75, glucose: 112, spO2: 98, hemoglobin: 13.5 },
    { id: 'v3', date: 'May 14', systolic: 126, diastolic: 82, pulse: 72, glucose: 106, spO2: 98, hemoglobin: 13.8 },
    { id: 'v4', date: 'Jun 22', systolic: 122, diastolic: 80, pulse: 70, glucose: 102, spO2: 99, hemoglobin: 14.1 },
    { id: 'v5', date: 'Jul 18', systolic: 118, diastolic: 78, pulse: 68, glucose: 98, spO2: 99, hemoglobin: 14.0 },
    { id: 'v6', date: 'Aug 01', systolic: 120, diastolic: 79, pulse: 71, glucose: 100, spO2: 98, hemoglobin: 14.2 }
  ]
};

interface PatientRecordsProps {
  patients: PatientHistory[];
  appointments: Appointment[];
  documents: MedicalDocument[];
  onSavePatient: (patientData: Partial<PatientHistory>) => Promise<any>;
}

export default function PatientRecords({
  patients,
  appointments,
  documents,
  onSavePatient,
}: PatientRecordsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    patients[0]?.id || ''
  );
  
  // Edit mode / creation states
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('Male');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  
  // Lists for arrays in patient history
  const [allergies, setAllergies] = useState<string[]>([]);
  const [newAllergy, setNewAllergy] = useState('');
  const [medications, setMedications] = useState<string[]>([]);
  const [newMedication, setNewMedication] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recharts Vitals Trends State
  const [patientVitals, setPatientVitals] = useState<Record<string, VitalEntry[]>>(INITIAL_VITALS);
  const [vitalsMetricTab, setVitalsMetricTab] = useState<'bp_pulse' | 'glucose_spo2' | 'lab_hemoglobin'>('bp_pulse');
  const [showAddVitalModal, setShowAddVitalModal] = useState(false);

  // New Vital Reading Form State
  const [newVitalDate, setNewVitalDate] = useState(new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' }));
  const [newSystolic, setNewSystolic] = useState<number | ''>(120);
  const [newDiastolic, setNewDiastolic] = useState<number | ''>(80);
  const [newPulse, setNewPulse] = useState<number | ''>(72);
  const [newGlucose, setNewGlucose] = useState<number | ''>(100);
  const [newSpO2, setNewSpO2] = useState<number | ''>(98);
  const [newHemoglobin, setNewHemoglobin] = useState<number | ''>(14.0);

  const currentPatientVitals = selectedPatientId
    ? (patientVitals[selectedPatientId] || INITIAL_VITALS.default)
    : [];

  const latestVital = currentPatientVitals[currentPatientVitals.length - 1];

  const handleAddVitalReading = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId) return;

    const newEntry: VitalEntry = {
      id: 'vital-' + Date.now(),
      date: newVitalDate || 'Today',
      systolic: Number(newSystolic) || 120,
      diastolic: Number(newDiastolic) || 80,
      pulse: Number(newPulse) || 72,
      glucose: Number(newGlucose) || 100,
      spO2: Number(newSpO2) || 98,
      hemoglobin: Number(newHemoglobin) || 14.0
    };

    setPatientVitals(prev => {
      const existing = prev[selectedPatientId] || [...INITIAL_VITALS.default];
      return {
        ...prev,
        [selectedPatientId]: [...existing, newEntry]
      };
    });

    setShowAddVitalModal(false);
  };

  const handleDeleteVital = (vitalId: string) => {
    if (!selectedPatientId) return;
    setPatientVitals(prev => {
      const existing = prev[selectedPatientId] || [...INITIAL_VITALS.default];
      return {
        ...prev,
        [selectedPatientId]: existing.filter(v => v.id !== vitalId)
      };
    });
  };

  const CustomVitalsTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1">
          <p className="font-extrabold text-indigo-300 border-b border-slate-800 pb-1">{label}</p>
          {payload.map((pld: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pld.color }} />
                {pld.name}:
              </span>
              <span className="font-mono font-bold text-white">
                {pld.value} {pld.unit || ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Search filter
  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.contact.includes(searchQuery)
  );

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // Set selected patient id on load if none selected
  React.useEffect(() => {
    if (patients.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  const handleStartEdit = (p?: PatientHistory) => {
    if (p) {
      setEditId(p.id);
      setName(p.name);
      setEmail(p.email || '');
      setAge(p.age);
      setGender(p.gender);
      setContact(p.contact);
      setAllergies(p.allergies || []);
      setMedications(p.medications || []);
      setConditions(p.medicalConditions || []);
      setNotes(p.notes || '');
    } else {
      setEditId(null);
      setName('');
      setEmail('');
      setAge('');
      setGender('Male');
      setContact('');
      setAllergies([]);
      setMedications([]);
      setConditions([]);
      setNotes('');
    }
    setIsEditing(true);
  };

  const handleAddAllergy = () => {
    if (newAllergy.trim() && !allergies.includes(newAllergy.trim())) {
      setAllergies([...allergies, newAllergy.trim()]);
      setNewAllergy('');
    }
  };

  const handleRemoveAllergy = (idx: number) => {
    setAllergies(allergies.filter((_, i) => i !== idx));
  };

  const handleAddMedication = () => {
    if (newMedication.trim() && !medications.includes(newMedication.trim())) {
      setMedications([...medications, newMedication.trim()]);
      setNewMedication('');
    }
  };

  const handleRemoveMedication = (idx: number) => {
    setMedications(medications.filter((_, i) => i !== idx));
  };

  const handleAddCondition = () => {
    if (newCondition.trim() && !conditions.includes(newCondition.trim())) {
      setConditions([...conditions, newCondition.trim()]);
      setNewCondition('');
    }
  };

  const handleRemoveCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !age || !contact) return;

    setIsSubmitting(true);
    try {
      const data: Partial<PatientHistory> = {
        name,
        email,
        age: Number(age),
        gender,
        contact,
        allergies,
        medications,
        medicalConditions: conditions,
        notes,
      };
      if (editId) {
        data.id = editId;
      }

      const saved = await onSavePatient(data);
      if (saved && saved.id) {
        setSelectedPatientId(saved.id);
      }
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Linked items
  const patientAppointments = appointments.filter(
    appt => appt.patientId === selectedPatientId
  ).sort((a,b) => b.date.localeCompare(a.date));

  const patientDocuments = documents.filter(
    doc => doc.patientId === selectedPatientId
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      
      {/* Search & Select column */}
      <div className="space-y-4 lg:col-span-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            Patient Register
          </h2>
          <button
            onClick={() => handleStartEdit()}
            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search patients by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Patient Cards List */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {filteredPatients.length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400 border border-dashed rounded-lg bg-white">
              No matching clinical profiles found.
            </p>
          ) : (
            filteredPatients.map(p => {
              const isSelected = p.id === selectedPatientId;
              const medsCount = p.medications?.length || 0;
              const allergiesCount = p.allergies?.length || 0;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPatientId(p.id);
                    setIsEditing(false);
                  }}
                  className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/20 shadow-sm'
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{p.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Age {p.age} • {p.gender}
                      </p>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                      ID: {p.id.split('-')[1] || p.id.substring(0, 8)}
                    </span>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center gap-3 text-[9px] text-slate-500">
                    <span className="flex items-center gap-0.5">
                      <Pill className="h-3 w-3 text-emerald-500" />
                      {medsCount} Meds
                    </span>
                    <span className="flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3 text-rose-500" />
                      {allergiesCount} Allergies
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Centralized Medical Records Hub Details (Right Column) */}
      <div className="lg:col-span-2">
        {isEditing ? (
          /* Create / Edit Patient Form */
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                {editId ? 'Modify Clinical File' : 'Register Clinical File'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Patient Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eleanor Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Age</label>
                  <input
                    type="number"
                    required
                    placeholder="34"
                    value={age}
                    onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-Binary</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Contact Phone</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="patient@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Dynamic Arrays */}
              {/* Allergies list manager */}
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Allergies</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add an allergy (e.g. Penicillin)"
                    value={newAllergy}
                    onChange={(e) => setNewAllergy(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAllergy())}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddAllergy}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {allergies.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic">No listed allergies.</span>
                  ) : (
                    allergies.map((alg, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-150">
                        {alg}
                        <X onClick={() => handleRemoveAllergy(i)} className="h-3 w-3 text-rose-500 hover:text-rose-700 cursor-pointer" />
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Medications list manager */}
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Active Medications</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add medication (e.g. Lisinopril 10mg)"
                    value={newMedication}
                    onChange={(e) => setNewMedication(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMedication())}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddMedication}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {medications.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic">No listed medications.</span>
                  ) : (
                    medications.map((med, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-150">
                        {med}
                        <X onClick={() => handleRemoveMedication(i)} className="h-3 w-3 text-emerald-500 hover:text-emerald-700 cursor-pointer" />
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Chronic conditions list manager */}
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Medical Conditions</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add medical history / condition (e.g. Asthma)"
                    value={newCondition}
                    onChange={(e) => setNewCondition(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCondition())}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCondition}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {conditions.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic">No listed conditions.</span>
                  ) : (
                    conditions.map((cond, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-150">
                        {cond}
                        <X onClick={() => handleRemoveCondition(i)} className="h-3 w-3 text-indigo-500 hover:text-indigo-700 cursor-pointer" />
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Clinical Handover Notes</label>
                <textarea
                  rows={3}
                  placeholder="Special clinical care notes, surgical histories, or background logs..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-slate-900 py-3 text-xs font-semibold text-white shadow hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isSubmitting ? 'Saving changes...' : 'Commit Patient Clinical Profile'}
            </button>
          </form>
        ) : selectedPatient ? (
          /* Profile Details View */
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              
              {/* Header profile details */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-indigo-50 p-3 text-indigo-600">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{selectedPatient.name}</h3>
                    <p className="text-xs text-slate-400">
                      Gender: <span className="text-slate-600 font-medium">{selectedPatient.gender}</span> • 
                      Age: <span className="text-slate-600 font-medium">{selectedPatient.age}</span> • 
                      ID: <span className="text-slate-600 font-mono text-[10px] bg-slate-50 px-1 rounded">{selectedPatient.id}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleStartEdit(selectedPatient)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 cursor-pointer self-start sm:self-center"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Clinical Profile
                </button>
              </div>

              {/* Grid content */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                
                {/* Contact and clinical notes */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Contact Particulars</h4>
                    <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p><span className="text-slate-400">Phone:</span> <span className="text-slate-800 font-medium">{selectedPatient.contact}</span></p>
                      {selectedPatient.email && (
                        <p><span className="text-slate-400">Email:</span> <span className="text-slate-800 font-medium">{selectedPatient.email}</span></p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">General Clinical Notes</h4>
                    <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100 text-xs text-slate-600 leading-relaxed italic">
                      {selectedPatient.notes || "No general notes recorded for this patient yet."}
                    </div>
                  </div>
                </div>

                {/* Allergies, meds & conditions summary */}
                <div className="space-y-4">
                  {/* Allergies alert */}
                  <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/20 space-y-2">
                    <h4 className="text-[10px] font-bold text-rose-800 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      Allergies & Contraindications
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {!selectedPatient.allergies || selectedPatient.allergies.length === 0 ? (
                        <p className="text-xs text-emerald-700 italic font-medium">No allergies or drug contraindications recorded.</p>
                      ) : (
                        selectedPatient.allergies.map((alg, i) => (
                          <span key={i} className="bg-rose-100/60 px-2 py-0.5 rounded border border-rose-200 text-rose-800 text-[11px] font-semibold">
                            {alg}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Medications and history */}
                  <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 space-y-2">
                    <h4 className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Pill className="h-4 w-4 text-emerald-500" />
                      Current Pharmacotherapy (Meds)
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {!selectedPatient.medications || selectedPatient.medications.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No current prescription medications listed.</p>
                      ) : (
                        selectedPatient.medications.map((med, i) => (
                          <span key={i} className="bg-emerald-100/60 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                            {med}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Medical Conditions */}
                  <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/20 space-y-2">
                    <h4 className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Heart className="h-4 w-4 text-indigo-500" />
                      Recorded Medical History
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {!selectedPatient.medicalConditions || selectedPatient.medicalConditions.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No past chronic diseases or major operations reported.</p>
                      ) : (
                        selectedPatient.medicalConditions.map((cond, i) => (
                          <span key={i} className="bg-indigo-100/60 px-2 py-0.5 rounded border border-indigo-200 text-indigo-800 text-[11px] font-semibold">
                            {cond}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* ======================================================= */}
            {/* RECHARTS PATIENT VITALS & LAB RESULTS TREND CHART CARD */}
            {/* ======================================================= */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <span>Patient Vitals & Lab Trends</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                        Recharts Visual Analytics
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">Historical physiological measurements & longitudinal diagnostic monitoring</p>
                  </div>
                </div>

                {/* Metric Tabs & Add Button */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setVitalsMetricTab('bp_pulse')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        vitalsMetricTab === 'bp_pulse'
                          ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Blood Pressure & Pulse
                    </button>

                    <button
                      type="button"
                      onClick={() => setVitalsMetricTab('glucose_spo2')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        vitalsMetricTab === 'glucose_spo2'
                          ? 'bg-white text-amber-700 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Glucose & SpO2
                    </button>

                    <button
                      type="button"
                      onClick={() => setVitalsMetricTab('lab_hemoglobin')}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        vitalsMetricTab === 'lab_hemoglobin'
                          ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hemoglobin & Labs
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddVitalModal(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span>Log Vital</span>
                  </button>
                </div>
              </div>

              {/* Quick Summary Stat Tiles */}
              {latestVital && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1">
                    <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-wider block">Blood Pressure</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-indigo-950">{latestVital.systolic}/{latestVital.diastolic}</span>
                      <span className="text-[10px] font-semibold text-slate-500">mmHg</span>
                    </div>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      latestVital.systolic <= 120 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {latestVital.systolic <= 120 ? 'Normal / Optimal' : 'Slightly Elevated'}
                    </span>
                  </div>

                  <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-xl space-y-1">
                    <span className="text-[10px] font-extrabold text-rose-900 uppercase tracking-wider block">Heart Rate / Pulse</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-rose-950">{latestVital.pulse}</span>
                      <span className="text-[10px] font-semibold text-slate-500">BPM</span>
                    </div>
                    <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800">
                      Normal Sinus Rhythm
                    </span>
                  </div>

                  <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-1">
                    <span className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wider block">Fasting Glucose</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-amber-950">{latestVital.glucose}</span>
                      <span className="text-[10px] font-semibold text-slate-500">mg/dL</span>
                    </div>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      latestVital.glucose <= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {latestVital.glucose <= 100 ? 'Normal Fasting' : 'Pre-Diabetic Range'}
                    </span>
                  </div>

                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-1">
                    <span className="text-[10px] font-extrabold text-emerald-900 uppercase tracking-wider block">SpO2 & Hemoglobin</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-black text-emerald-950">{latestVital.spO2}%</span>
                      <span className="text-xs text-slate-400 font-normal">| {latestVital.hemoglobin} g/dL</span>
                    </div>
                    <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                      Healthy Oxygenation
                    </span>
                  </div>
                </div>
              )}

              {/* Recharts Render Area */}
              <div className="w-full h-[280px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  {vitalsMetricTab === 'bp_pulse' ? (
                    <AreaChart data={currentPatientVitals} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="systolicGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="diastolicGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[50, 160]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip content={<CustomVitalsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <ReferenceLine y={120} label={{ value: 'Systolic Target (120)', fill: '#6366f1', fontSize: 10 }} stroke="#6366f1" strokeDasharray="3 3" />
                      <ReferenceLine y={80} label={{ value: 'Diastolic Target (80)', fill: '#f43f5e', fontSize: 10 }} stroke="#f43f5e" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="systolic" name="Systolic BP" unit=" mmHg" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#systolicGrad)" activeDot={{ r: 6 }} />
                      <Area type="monotone" dataKey="diastolic" name="Diastolic BP" unit=" mmHg" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#diastolicGrad)" activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="pulse" name="Heart Rate" unit=" BPM" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
                    </AreaChart>
                  ) : vitalsMetricTab === 'glucose_spo2' ? (
                    <AreaChart data={currentPatientVitals} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="glucoseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[60, 160]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip content={<CustomVitalsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <ReferenceLine y={100} label={{ value: 'Fasting Target (100 mg/dL)', fill: '#f59e0b', fontSize: 10 }} stroke="#f59e0b" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="glucose" name="Fasting Glucose" unit=" mg/dL" stroke="#f59e0b" strokeWidth={2.5} fillOpacity={1} fill="url(#glucoseGrad)" activeDot={{ r: 6 }} />
                      <Area type="monotone" dataKey="spO2" name="Blood SpO2" unit="%" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#spo2Grad)" activeDot={{ r: 6 }} />
                    </AreaChart>
                  ) : (
                    <LineChart data={currentPatientVitals} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[10, 18]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip content={<CustomVitalsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <ReferenceLine y={13.5} label={{ value: 'Normal Hb Target (13.5 g/dL)', fill: '#059669', fontSize: 10 }} stroke="#059669" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="hemoglobin" name="Hemoglobin" unit=" g/dL" stroke="#059669" strokeWidth={3} dot={{ r: 5, fill: '#059669' }} activeDot={{ r: 7 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Log Table Summary */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                  <span>Historical Measurements History ({currentPatientVitals.length} Logs)</span>
                  <span>Dynamic Sync Active</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="p-2 rounded-l-lg">Date</th>
                        <th className="p-2">BP (Sys/Dia)</th>
                        <th className="p-2">Pulse</th>
                        <th className="p-2">Glucose</th>
                        <th className="p-2">SpO2</th>
                        <th className="p-2">Hemoglobin</th>
                        <th className="p-2 text-right rounded-r-lg">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentPatientVitals.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2 font-extrabold text-slate-800">{v.date}</td>
                          <td className="p-2 font-mono text-indigo-700 font-bold">{v.systolic}/{v.diastolic} mmHg</td>
                          <td className="p-2 font-mono text-slate-700">{v.pulse} bpm</td>
                          <td className="p-2 font-mono text-amber-700">{v.glucose} mg/dL</td>
                          <td className="p-2 font-mono text-emerald-700">{v.spO2}%</td>
                          <td className="p-2 font-mono text-slate-800">{v.hemoglobin} g/dL</td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteVital(v.id)}
                              className="text-slate-300 hover:text-rose-600 transition-colors cursor-pointer p-1"
                              title="Delete Reading"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal: Log New Vital Reading */}
            {showAddVitalModal && (
              <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <PlusCircle className="h-4 w-4 text-indigo-600" /> Log New Vital Measurement
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowAddVitalModal(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <form onSubmit={handleAddVitalReading} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Log Date Label</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Aug 02"
                        value={newVitalDate}
                        onChange={(e) => setNewVitalDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-hidden"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Systolic BP (mmHg)</label>
                        <input
                          type="number"
                          required
                          value={newSystolic}
                          onChange={(e) => setNewSystolic(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Diastolic BP (mmHg)</label>
                        <input
                          type="number"
                          required
                          value={newDiastolic}
                          onChange={(e) => setNewDiastolic(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Heart Rate / Pulse (BPM)</label>
                        <input
                          type="number"
                          required
                          value={newPulse}
                          onChange={(e) => setNewPulse(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Fasting Glucose (mg/dL)</label>
                        <input
                          type="number"
                          required
                          value={newGlucose}
                          onChange={(e) => setNewGlucose(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">SpO2 Oxygen (%)</label>
                        <input
                          type="number"
                          required
                          value={newSpO2}
                          onChange={(e) => setNewSpO2(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Hemoglobin (g/dL)</label>
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={newHemoglobin}
                          onChange={(e) => setNewHemoglobin(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowAddVitalModal(false)}
                        className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Save Reading
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Timelines and Records */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              
              {/* Linked Documents list */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="h-4.5 w-4.5 text-indigo-600" />
                  Medical Documents Vault
                </h3>
                {patientDocuments.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">
                    No clinical reports uploaded for this patient.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {patientDocuments.map((doc) => (
                      <div key={doc.id} className="p-3 border border-slate-100 bg-slate-50/50 rounded-lg flex items-center justify-between text-xs hover:bg-slate-50 transition-all">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{doc.title}</p>
                          <p className="text-[9px] text-slate-400">{doc.category} • {doc.uploadDate}</p>
                        </div>
                        {doc.analysis && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            doc.analysis.riskLevel === 'High' 
                              ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                            AI Analyzed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Closed consultations — what the doctor actually recorded, one
                  dated card per visit. Written when "Review & complete" is
                  pressed in the doctor's queue. */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Stethoscope className="h-4.5 w-4.5 text-indigo-600" />
                  Consultation Records
                </h3>
                <ConsultationHistory
                  appointments={appointments}
                  patientId={selectedPatient.id}
                  className="max-h-[420px] overflow-y-auto pr-1"
                />
              </div>

              {/* Consultation and Appointments history */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="h-4.5 w-4.5 text-indigo-600" />
                  Appointment Timeline History
                </h3>
                {patientAppointments.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">
                    No appointments scheduled or recorded.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                    {patientAppointments.map((appt) => {
                      const isCancelled = appt.status === 'cancelled';
                      const isCompleted = appt.status === 'completed';
                      return (
                        <div key={appt.id} className={`p-3 border rounded-lg flex items-start justify-between text-xs ${
                          isCancelled ? 'border-slate-100 bg-slate-50/40 opacity-70' : 'border-slate-150 bg-white shadow-xs'
                        }`}>
                          <div className="space-y-1">
                            <p className="font-bold text-slate-800 flex items-center gap-1.5">
                              {appt.timeSlot}
                              <span className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[8px] font-bold uppercase ${
                                isCancelled ? 'bg-slate-100 text-slate-500' : isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                              }`}>
                                {appt.status}
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Date: <span className="font-medium text-slate-700">{appt.date}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Visit: <span className="font-medium text-slate-700 capitalize">{appt.type === 'video' ? 'Video Telehealth' : 'Visiting Consultation'}</span>
                            </p>
                            {appt.notes && (
                              <p className="text-[10px] text-slate-500 italic line-clamp-1">
                                Notes: "{appt.notes}"
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400 border border-dashed border-slate-200 bg-white rounded-2xl flex flex-col items-center justify-center space-y-2">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-semibold">No Clinical Profile Selected</p>
            <p className="text-xs max-w-sm mx-auto text-slate-400">Please select a patient file from the clinical register, or create a brand new care record.</p>
            <button
              onClick={() => handleStartEdit()}
              className="mt-2 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
            >
              Add New Patient File
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
