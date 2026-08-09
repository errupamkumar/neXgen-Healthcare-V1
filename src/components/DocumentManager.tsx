/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Brain,
  Search,
  AlertCircle,
  Sparkles,
  CheckCircle,
  Activity,
  Pill,
  ShieldCheck,
  Share2,
  RefreshCw,
  X,
  Eye,
  Download,
  Printer,
} from 'lucide-react';
import { MedicalDocument, PatientHistory } from '../types';

type Category = MedicalDocument['category'];

interface DocumentManagerProps {
  documents: MedicalDocument[];
  patients: PatientHistory[];
  onUploadDocument: (docData: {
    patientId: string;
    title: string;
    category: Category;
    fileContentText: string;
    fileName: string;
    fileSize: string;
  }) => Promise<any>;
  onAnalyzeDocument: (id: string) => Promise<any>;
}

const CATEGORIES: Category[] = ['Prescription', 'Lab Report', 'Referral', 'Vaccine Card', 'Other'];

const CATEGORY_META: Record<Category, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  'Prescription': { icon: Pill, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Lab Report': { icon: Activity, tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  'Referral': { icon: Share2, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  'Vaccine Card': { icon: ShieldCheck, tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  'Other': { icon: FileText, tone: 'bg-slate-100 text-slate-700 border-slate-200' },
};

// Preset templates for quick-filling medical document simulation.
const MOCK_REPORT_PRESETS = [
  {
    title: 'Cardiology Prescription — Hypertension Review',
    category: 'Prescription' as Category,
    fileName: 'rx_sharma_aug2026.txt',
    fileSize: '1.6 KB',
    content: `neXgen CARDIAC INSTITUTE, DWARKA, NEW DELHI
Prescribing Clinician: Dr. Rajesh Sharma, Senior Consultant Cardiologist
Patient: Aarav Patel, Age 34, ABHA ID: 91-2345-6789-0123
Date: August 03, 2026

DIAGNOSIS:
Stage 1 essential hypertension with borderline readings of 138/85 mmHg. Mild exertional tightness reported during morning activity.

PRESCRIPTION (Rx):
1. Telmisartan 40mg — one tablet every morning, after breakfast, continue 90 days.
2. Aspirin 75mg — one tablet nightly after food.
3. Rosuvastatin 10mg — one tablet at bedtime.

DRUG ALLERGIES ON FILE:
Penicillin (severe hives), Dust mites (respiratory).

ADVICE:
Home blood pressure log twice weekly. Reduce dietary sodium below 5g per day. Brisk walking 30 minutes, five days a week. Review in OPD after 12 weeks with a fresh lipid profile.`,
  },
  {
    title: 'Comprehensive Hematology Lab Report',
    category: 'Lab Report' as Category,
    fileName: 'hematology_report_june2026.txt',
    fileSize: '4.2 KB',
    content: `METROPOLITAN CLINICAL LABORATORIES
Patient: John Doe, Age: 42, Date: June 15, 2026
Test Type: CBC with Differential

TEST RESULTS:
White Blood Cell (WBC): 11.2 x10^3/uL (ELEVATED, Normal: 4.5-11.0)
Red Blood Cell (RBC): 4.10 x10^6/uL (LOW, Normal: 4.5-5.9)
Hemoglobin (Hgb): 11.5 g/dL (LOW, Normal: 13.5-17.5)
Platelets: 210 x10^3/uL (Normal: 150-450)

CLINICAL IMPRESSIONS:
Microcytic anemia secondary to suspected iron deficiency. Mild leukocytosis indicative of mild systemic inflammatory response or recent low-grade infection.
Current active medications: Ferrous Sulfate 325mg daily.
Known Patient drug allergies: Penicillin G (results in severe hives).

Pathologist signature: Dr. H. Vance, MD`,
  },
  {
    title: 'Cardiology ECG Referral & Pathology Summary',
    category: 'Referral' as Category,
    fileName: 'cardiac_ecg_vance.txt',
    fileSize: '3.1 KB',
    content: `neXgen CARDIAC & VASCULAR INSTITUTE, NEW DELHI
Patient: Suresh Kumar, Age: 62, ABHA ID: 91-5678-1234-9876, Date: May 20, 2026
Referring Clinician: Dr. Rajesh Sharma

ECG FINDINGS:
Sinus bradycardia with first-degree AV block. Heart rate: 52 bpm. Left ventricular hypertrophy (LVH) noted in precordial leads. QRS duration 104ms. No ST-segment elevations or active myocardial ischemia detected.

CURRENT MEDICATION REGIMEN:
- Metoprolol Succinate 50mg daily for rate control.
- Atorvastatin 20mg nightly for cholesterol regulation.
- Aspirin 81mg daily.

CONTRAINDICATIONS / DRUG ALLERGIES:
Sulfa drugs (trimethoprim-sulfamethoxazole causes severe anaphylactic rash).

RECOMMENDATIONS:
Hold Metoprolol if resting heart rate falls below 48 bpm. Schedule a formal 24-hour Holter monitor within the month. Maintain dietary low-sodium protocols.`,
  },
  {
    title: 'Childhood Immunisation Record',
    category: 'Vaccine Card' as Category,
    fileName: 'immunisation_card.txt',
    fileSize: '1.2 KB',
    content: `UNIVERSAL IMMUNISATION PROGRAMME — VACCINATION RECORD
Patient: Ananya Iyer, Age 10, ABHA ID: 91-9988-7766-5544

DOSES ADMINISTERED:
BCG — at birth, completed.
Hepatitis B (3 doses) — completed.
DPT booster — completed at 5 years.
MMR (2 doses) — completed.
Typhoid conjugate vaccine — administered March 2026.
Influenza (annual) — due October 2026.

NOTES:
Known allergy to peanuts and pollen. No adverse vaccine reactions recorded to date. Next review at the paediatric OPD with Dr. Ananya Mukherjee.`,
  },
];

/** Saves a document to the patient's device — no server round-trip needed. */
function downloadDocument(doc: MedicalDocument) {
  const safeTitle = doc.title.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  const blob = new Blob([doc.fileContentText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName || `${safeTitle || 'document'}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Where a search term was found, plus a short snippet of surrounding text. */
interface MatchInfo {
  field: string;
  snippet: string;
}

function buildSnippet(value: string, index: number, length: number): string {
  const clean = value.replace(/\s+/g, ' ');
  // Re-locate the hit in the whitespace-collapsed string so the window is accurate.
  const collapsedIndex = clean.toLowerCase().indexOf(value.substr(index, length).toLowerCase());
  const at = collapsedIndex === -1 ? 0 : collapsedIndex;
  const start = Math.max(0, at - 45);
  const end = Math.min(clean.length, at + length + 55);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

/**
 * Searches every part of a record a clinician might remember — not just the
 * title. Returns which field matched so the result can explain itself.
 */
function findMatch(doc: MedicalDocument, patientName: string, query: string): MatchInfo | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const fields: Array<{ field: string; value?: string }> = [
    { field: 'Title', value: doc.title },
    { field: 'Patient', value: patientName },
    { field: 'Type', value: doc.category },
    { field: 'File', value: doc.fileName },
    { field: 'Report text', value: doc.fileContentText },
    { field: 'AI summary', value: doc.analysis?.summary },
    { field: 'Findings', value: doc.analysis?.keyFindings?.join(' · ') },
    { field: 'Medications', value: doc.analysis?.extractedMedications?.join(', ') },
    { field: 'Allergies', value: doc.analysis?.extractedAllergies?.join(', ') },
    { field: 'Follow-up', value: doc.analysis?.suggestedFollowUp },
  ];

  for (const f of fields) {
    if (!f.value) continue;
    const idx = f.value.toLowerCase().indexOf(needle);
    if (idx !== -1) {
      return { field: f.field, snippet: buildSnippet(f.value, idx, needle.length) };
    }
  }
  return null;
}

/** Wraps every occurrence of `query` in <mark> so a hit is visible at a glance. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  let from = 0;
  let at = lower.indexOf(target);
  let key = 0;

  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key++} className="rounded-sm bg-amber-200 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>
    );
    from = at + needle.length;
    at = lower.indexOf(target, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

export default function DocumentManager({
  documents,
  patients,
  onUploadDocument,
  onAnalyzeDocument,
}: DocumentManagerProps) {
  const [activeTab, setActiveTab] = useState<'vault' | 'upload'>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | Category>('ALL');
  const [patientFilter, setPatientFilter] = useState<'ALL' | string>('ALL');
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id || '');
  const searchRef = useRef<HTMLInputElement>(null);

  // Upload Form State
  const [uploadPatientId, setUploadPatientId] = useState(patients[0]?.id || '');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<Category>('Lab Report');
  const [uploadContentText, setUploadContentText] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const getPatientName = (patientId: string) =>
    patients.find(p => p.id === patientId)?.name || 'Unknown patient';

  // "/" focuses search from anywhere in the vault; Escape clears it.
  useEffect(() => {
    if (activeTab !== 'vault') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName) || el?.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && el === searchRef.current) {
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeTab]);

  /** Category counts always reflect the patient filter, never the search. */
  const countsByCategory = useMemo(() => {
    const scope = documents.filter(d => patientFilter === 'ALL' || d.patientId === patientFilter);
    const counts: Record<string, number> = { ALL: scope.length };
    CATEGORIES.forEach(c => {
      counts[c] = scope.filter(d => d.category === c).length;
    });
    return counts;
  }, [documents, patientFilter]);

  const results = useMemo(() => {
    return documents
      .filter(d => categoryFilter === 'ALL' || d.category === categoryFilter)
      .filter(d => patientFilter === 'ALL' || d.patientId === patientFilter)
      .map(doc => ({ doc, match: findMatch(doc, getPatientName(doc.patientId), searchQuery) }))
      .filter(r => !searchQuery.trim() || r.match !== null)
      .sort((a, b) => (b.doc.uploadDate || '').localeCompare(a.doc.uploadDate || ''));
  }, [documents, patients, categoryFilter, patientFilter, searchQuery]);

  // Keep a valid selection as filters narrow the list.
  useEffect(() => {
    if (results.length === 0) return;
    if (!results.some(r => r.doc.id === selectedDocId)) {
      setSelectedDocId(results[0].doc.id);
    }
  }, [results, selectedDocId]);

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const isFiltered = !!searchQuery.trim() || categoryFilter !== 'ALL' || patientFilter !== 'ALL';

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setPatientFilter('ALL');
  };

  const handleApplyPreset = (preset: typeof MOCK_REPORT_PRESETS[0]) => {
    setUploadTitle(preset.title);
    setUploadCategory(preset.category);
    setUploadContentText(preset.content);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPatientId || !uploadTitle || !uploadContentText) return;

    setIsUploading(true);
    setUploadSuccess(false);
    try {
      const presetMatch = MOCK_REPORT_PRESETS.find(p => p.title === uploadTitle);
      const fileName = presetMatch ? presetMatch.fileName : `report_${Date.now().toString().slice(-4)}.txt`;
      const fileSize = presetMatch ? presetMatch.fileSize : `${(uploadContentText.length / 1024).toFixed(1)} KB`;

      const result = await onUploadDocument({
        patientId: uploadPatientId,
        title: uploadTitle,
        category: uploadCategory,
        fileContentText: uploadContentText,
        fileName,
        fileSize,
      });

      if (result && !result.error) {
        setUploadSuccess(true);
        setSelectedDocId(result.id);
        setUploadTitle('');
        setUploadContentText('');
        setTimeout(() => {
          setActiveTab('vault');
          setUploadSuccess(false);
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunAIAnalysis = async (id: string) => {
    setIsAnalyzing(true);
    setAnalysisError('');
    try {
      const result = await onAnalyzeDocument(id);
      if (result && result.error) setAnalysisError(result.error);
    } catch (err: any) {
      setAnalysisError(err.message || 'AI analysis failed. Check the connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-slate-900">
            Document vault
          </h2>
          <p className="text-sm text-slate-500">
            Prescriptions, lab tests, referrals and immunisation records — all searchable.
          </p>
        </div>

        <div className="flex shrink-0 rounded-lg border border-slate-200 bg-white p-1">
          {([
            { id: 'vault', label: 'Browse', icon: Eye },
            { id: 'upload', label: 'Add document', icon: Upload },
          ] as const).map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'vault' ? (
        <div className="space-y-4">
          {/* ---------------------------------------------------------- */}
          {/* Search + filters                                            */}
          {/* ---------------------------------------------------------- */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search a medicine, test value, diagnosis, doctor or patient…"
                aria-label="Search documents"
                className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-24 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-indigo-500"
              />
              {searchQuery ? (
                <button
                  onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 sm:block">
                  /
                </kbd>
              )}
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={categoryFilter === 'ALL'}
                onClick={() => setCategoryFilter('ALL')}
                label="All"
                count={countsByCategory.ALL}
              />
              {/* key lives on a Fragment: this project has no @types/react, so TS
                  treats `key` as an ordinary prop on custom components. */}
              {CATEGORIES.map(cat => {
                const Icon = CATEGORY_META[cat].icon;
                return (
                  <React.Fragment key={cat}>
                  <FilterChip
                    active={categoryFilter === cat}
                    onClick={() => setCategoryFilter(cat)}
                    label={cat === 'Prescription' ? 'Prescriptions' : cat === 'Lab Report' ? 'Lab tests' : cat === 'Referral' ? 'Referrals' : cat === 'Vaccine Card' ? 'Vaccinations' : 'Other'}
                    count={countsByCategory[cat]}
                    icon={<Icon className="h-3.5 w-3.5" />}
                  />
                  </React.Fragment>
                );
              })}
            </div>

            {patients.length > 1 && (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <label className="text-sm text-slate-600" htmlFor="vault-patient">Patient</label>
                <select
                  id="vault-patient"
                  value={patientFilter}
                  onChange={e => setPatientFilter(e.target.value)}
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  <option value="ALL">Everyone</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {isFiltered && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto cursor-pointer text-sm font-medium text-indigo-700 hover:text-indigo-800"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Result count */}
          <p className="text-sm text-slate-500">
            {results.length === documents.length && !isFiltered
              ? `${documents.length} document${documents.length === 1 ? '' : 's'} stored`
              : `${results.length} of ${documents.length} document${documents.length === 1 ? '' : 's'}`}
            {searchQuery.trim() && <> matching “<span className="font-medium text-slate-700">{searchQuery}</span>”</>}
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            {/* -------------------------------------------------------- */}
            {/* Result list                                               */}
            {/* -------------------------------------------------------- */}
            <div className="min-w-0 space-y-2 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {results.length === 0 ? (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-800">
                    {documents.length === 0 ? 'No documents stored yet' : 'Nothing matches that search'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {documents.length === 0
                      ? 'Add a prescription, lab report or vaccination record to get started.'
                      : 'Try a medicine name, a test value, or clear the filters.'}
                  </p>
                  {documents.length === 0 ? (
                    <button
                      onClick={() => setActiveTab('upload')}
                      className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Add a document
                    </button>
                  ) : (
                    <button
                      onClick={clearFilters}
                      className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                results.map(({ doc, match }) => {
                  const isSelected = doc.id === selectedDocId;
                  const meta = CATEGORY_META[doc.category] || CATEGORY_META.Other;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      aria-pressed={isSelected}
                      className={`w-full min-w-0 cursor-pointer rounded-xl border p-3.5 text-left transition-colors ${
                        isSelected ? 'border-indigo-600 bg-indigo-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            <Highlight text={doc.title} query={searchQuery} />
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            <Highlight text={getPatientName(doc.patientId)} query={searchQuery} />
                            <span className="text-slate-300"> · </span>
                            <span className="font-mono text-[13px]">{doc.uploadDate}</span>
                          </p>
                        </div>

                        {doc.analysis && (
                          <span
                            title="AI analysed"
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-indigo-600"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>

                      {/* Why this result matched */}
                      {match && (
                        <p className="mt-2.5 rounded-lg bg-slate-50 p-2 text-[13px] leading-relaxed text-slate-600">
                          <span className="mr-1.5 font-medium uppercase tracking-wide text-[10px] text-slate-400">
                            {match.field}
                          </span>
                          <Highlight text={match.snippet} query={searchQuery} />
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* -------------------------------------------------------- */}
            {/* Detail                                                    */}
            {/* -------------------------------------------------------- */}
            <div className="min-w-0">
              {selectedDoc ? (
                <>
                {/* Print / save-as-PDF view: hidden on screen, becomes the whole
                    printed page thanks to the .print-target rule in index.css. */}
                <div className="print-target hidden print:block">
                  <h1 style={{ fontSize: '18pt', fontWeight: 600, marginBottom: '4pt' }}>
                    {selectedDoc.title}
                  </h1>
                  <p style={{ fontSize: '10pt', marginBottom: '12pt' }}>
                    {getPatientName(selectedDoc.patientId)} · {selectedDoc.category} · {selectedDoc.uploadDate}
                  </p>
                  <pre style={{ fontSize: '10pt', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>
                    {selectedDoc.fileContentText}
                  </pre>
                </div>

                <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                  {/* Reader */}
                  <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-slate-900">
                          <Highlight text={selectedDoc.title} query={searchQuery} />
                        </h3>
                        <p className="truncate text-sm text-slate-500">
                          {getPatientName(selectedDoc.patientId)} · {selectedDoc.category} ·{' '}
                          <span className="font-mono">{selectedDoc.uploadDate}</span> · {selectedDoc.fileSize}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => downloadDocument(selectedDoc)}
                          title="Download a copy"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                        <button
                          onClick={() => window.print()}
                          title="Print or save as PDF"
                          aria-label="Print or save as PDF"
                          className="cursor-pointer rounded-lg border border-slate-300 p-2 text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 max-h-[420px] min-w-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                      <Highlight text={selectedDoc.fileContentText} query={searchQuery} />
                    </div>

                    <div className="mt-4">
                      {selectedDoc.analysis ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <span className="flex items-center gap-2 text-sm text-emerald-900">
                            <CheckCircle className="h-4 w-4 text-emerald-700" />
                            Analysed by AI
                          </span>
                          <button
                            onClick={() => handleRunAIAnalysis(selectedDoc.id)}
                            disabled={isAnalyzing}
                            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-emerald-800 hover:text-emerald-900 disabled:text-slate-400"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                            Re-analyse
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleRunAIAnalysis(selectedDoc.id)}
                          disabled={isAnalyzing}
                          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
                        >
                          <Brain className="h-4 w-4" />
                          {isAnalyzing ? 'Reading the document…' : 'Summarise with AI'}
                        </button>
                      )}

                      {analysisError && (
                        <div className="mt-3 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{analysisError}</span>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* AI readout */}
                  <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
                    {isAnalyzing ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
                        <p className="text-sm text-slate-500">Extracting findings, medicines and allergies…</p>
                      </div>
                    ) : selectedDoc.analysis ? (
                      <div className="space-y-5">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <h4 className="font-semibold text-slate-900">What this says</h4>
                          <span
                            className={`rounded-md px-2 py-1 text-[13px] font-medium ${
                              selectedDoc.analysis.riskLevel === 'High'
                                ? 'bg-rose-50 text-rose-800'
                                : selectedDoc.analysis.riskLevel === 'Medium'
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {selectedDoc.analysis.riskLevel} risk
                          </span>
                        </div>

                        <p className="text-sm leading-relaxed text-slate-700">
                          <Highlight text={selectedDoc.analysis.summary} query={searchQuery} />
                        </p>

                        <div>
                          <h5 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Key findings
                          </h5>
                          <ul className="space-y-1">
                            {selectedDoc.analysis.keyFindings.map((find, i) => (
                              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                                <span className="text-slate-300">•</span>
                                <span><Highlight text={find} query={searchQuery} /></span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                          <div>
                            <h5 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-rose-700">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Allergies
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDoc.analysis.extractedAllergies.length === 0 ? (
                                <span className="text-sm text-slate-400">None noted</span>
                              ) : (
                                selectedDoc.analysis.extractedAllergies.map((a, i) => (
                                  <span key={i} className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[13px] text-rose-800">
                                    <Highlight text={a} query={searchQuery} />
                                  </span>
                                ))
                              )}
                            </div>
                          </div>

                          <div>
                            <h5 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-700">
                              <Pill className="h-3.5 w-3.5" />
                              Medicines
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedDoc.analysis.extractedMedications.length === 0 ? (
                                <span className="text-sm text-slate-400">None noted</span>
                              ) : (
                                selectedDoc.analysis.extractedMedications.map((m, i) => (
                                  <span key={i} className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[13px] text-emerald-800">
                                    <Highlight text={m} query={searchQuery} />
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                          <h5 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Suggested follow-up
                          </h5>
                          <p className="text-sm leading-relaxed text-slate-700">
                            <Highlight text={selectedDoc.analysis.suggestedFollowUp} query={searchQuery} />
                          </p>
                        </div>

                        <p className="border-t border-slate-100 pt-3 font-mono text-[11px] text-slate-400">
                          gemini-3.5-flash · {selectedDoc.analysis.analyzedAt}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                        <Sparkles className="h-8 w-8 text-slate-300" />
                        <p className="text-sm font-medium text-slate-800">No AI summary yet</p>
                        <p className="max-w-xs text-sm text-slate-500">
                          Run “Summarise with AI” to pull out findings, medicines and allergy warnings — those become searchable too.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center">
                  <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-800">Select a document</p>
                  <p className="text-sm text-slate-500">Choose a record from the list to read it.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------ */
        /* Upload                                                        */
        /* ------------------------------------------------------------ */
        <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-slate-200 bg-white p-6">
          <div>
            <h3 className="font-semibold text-slate-900">Add a document</h3>
            <p className="text-sm text-slate-500">
              Link it to a patient and paste the text. Everything you paste becomes searchable.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Start from a sample</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MOCK_REPORT_PRESETS.map((preset, idx) => {
                const Icon = CATEGORY_META[preset.category].icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/40"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{preset.title}</span>
                      <span className="block text-[13px] text-slate-500">{preset.category}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">Patient</span>
                <select
                  required
                  value={uploadPatientId}
                  onChange={e => setUploadPatientId(e.target.value)}
                  className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  {patients.length === 0 ? (
                    <option value="">No patients registered yet</option>
                  ) : (
                    patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                  )}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-slate-700">Type</span>
                <select
                  required
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value as Category)}
                  className="w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Title</span>
              <input
                type="text"
                required
                placeholder="e.g. Cardiology prescription — August 2026"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="block text-sm font-medium text-slate-700">Document text</span>
              <textarea
                required
                rows={9}
                placeholder="Paste the prescription, lab report or vaccination record here…"
                value={uploadContentText}
                onChange={e => setUploadContentText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-[13px] text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500"
              />
            </label>

            {uploadSuccess && (
              <div className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Saved to the vault. Taking you back…</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isUploading || patients.length === 0}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? 'Saving…' : 'Save to vault'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
    >
      {icon}
      {label}
      <span className={active ? 'text-white/70' : 'text-slate-400'}>{count}</span>
    </button>
  );
}
