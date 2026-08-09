/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Search, 
  MapPin, 
  Building2, 
  Stethoscope, 
  Video, 
  RotateCcw, 
  Filter,
  Check,
  UserCheck
} from 'lucide-react';
import { Doctor } from '../types';

export interface DoctorFilterState {
  state: string;
  district: string;
  searchName: string;
  department: string;
  availability: string; // 'ALL' | 'video' | 'visiting' | 'active'
}

interface DoctorFilterBarProps {
  doctors: Doctor[];
  filterState: DoctorFilterState;
  setFilterState: React.Dispatch<React.SetStateAction<DoctorFilterState>>;
  totalResults: number;
  compact?: boolean;
}

// Preset Indian States & Districts mapping for quick auto-population
export const INDIAN_STATES_DISTRICTS: Record<string, string[]> = {
  // Bihar leads the list: the whole clinician directory currently operates out
  // of Purnea, so its neighbouring districts are the ones patients search for.
  'Bihar': ['Purnea', 'Katihar', 'Araria', 'Kishanganj', 'Madhepura', 'Saharsa', 'Bhagalpur', 'Patna'],
  'Delhi': ['New Delhi', 'Dwarka', 'South Delhi', 'North Delhi', 'West Delhi'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai'],
  'Telangana': ['Hyderabad', 'Warangal', 'Secunderabad'],
  'West Bengal': ['Kolkata', 'Howrah', 'Siliguri'],
  'Uttar Pradesh': ['Noida', 'Lucknow', 'Kanpur', 'Agra'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara']
};

export const STANDARD_DEPARTMENTS = [
  'Cardiology',
  'Pediatrics',
  'Dermatology',
  'General Medicine',
  'Orthopedics',
  'Gynecology',
  'Neurology',
  'Endocrinology',
  'Psychiatry',
  'ENT & Otolaryngology'
];

export function filterDoctors(doctors: Doctor[], filters: DoctorFilterState): Doctor[] {
  return doctors.filter((doc) => {
    // 1. Doctor name, hospital, or — since several doctors share a name and are
    //    told apart by where they sit — locality, landmark and PIN code.
    if (filters.searchName.trim()) {
      const q = filters.searchName.toLowerCase().trim();
      const haystack = [
        doc.name,
        doc.specialty,
        doc.department,
        doc.hospital,
        doc.bio,
        doc.addressLine,
        doc.area,
        doc.landmark,
        doc.district,
        doc.state,
        doc.pincode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // 2. State filter
    if (filters.state && filters.state !== 'ALL') {
      const docState = (doc.state || '').toLowerCase();
      const filterState = filters.state.toLowerCase();
      // Also match if hospital text mentions the state name
      if (!docState.includes(filterState) && !doc.hospital.toLowerCase().includes(filterState)) {
        return false;
      }
    }

    // 3. District / City filter
    if (filters.district && filters.district !== 'ALL') {
      const docDistrict = (doc.district || '').toLowerCase();
      const filterDist = filters.district.toLowerCase();
      // Match district property or hospital address text
      if (!docDistrict.includes(filterDist) && !doc.hospital.toLowerCase().includes(filterDist)) {
        return false;
      }
    }

    // 4. Department / Specialty filter
    if (filters.department && filters.department !== 'ALL') {
      const deptQuery = filters.department.toLowerCase();
      const docDept = (doc.department || '').toLowerCase();
      const docSpec = doc.specialty.toLowerCase();
      if (!docDept.includes(deptQuery) && !docSpec.includes(deptQuery)) {
        return false;
      }
    }

    // 5. Availability filter
    if (filters.availability && filters.availability !== 'ALL') {
      if (filters.availability === 'video' && !doc.videoEnabled) return false;
      if (filters.availability === 'visiting' && doc.videoEnabled) return false;
      if (filters.availability === 'active' && doc.isActive === false) return false;
    }

    return true;
  });
}

export default function DoctorFilterBar({
  doctors,
  filterState,
  setFilterState,
  totalResults,
  compact = false
}: DoctorFilterBarProps) {
  // Extract unique states from current doctors list, plus standard list
  const availableStates = Array.from(
    new Set([
      ...Object.keys(INDIAN_STATES_DISTRICTS),
      ...doctors.map((d) => d.state).filter(Boolean) as string[]
    ])
  ).sort();

  // Extract available districts based on selected state or all
  const availableDistricts = filterState.state && filterState.state !== 'ALL' && INDIAN_STATES_DISTRICTS[filterState.state]
    ? INDIAN_STATES_DISTRICTS[filterState.state]
    : Array.from(
        new Set([
          ...Object.values(INDIAN_STATES_DISTRICTS).flat(),
          ...doctors.map((d) => d.district).filter(Boolean) as string[]
        ])
      ).sort();

  // Extract available departments
  const availableDepartments = Array.from(
    new Set([
      ...STANDARD_DEPARTMENTS,
      ...doctors.map((d) => d.department).filter(Boolean) as string[],
      ...doctors.map((d) => d.specialty.split('&')[0].trim())
    ])
  ).sort();

  const isFilteredActive =
    filterState.searchName.trim() !== '' ||
    filterState.state !== 'ALL' ||
    filterState.district !== 'ALL' ||
    filterState.department !== 'ALL' ||
    filterState.availability !== 'ALL';

  const handleReset = () => {
    setFilterState({
      state: 'ALL',
      district: 'ALL',
      searchName: '',
      department: 'ALL',
      availability: 'ALL'
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3.5">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Filter Clinicians & Specialists
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Refine by region, hospital department, or consultation mode
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-700">
            <Check className="h-3 w-3 text-emerald-600" />
            {totalResults} {totalResults === 1 ? 'Doctor Available' : 'Doctors Available'}
          </span>

          {isFilteredActive && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Grid of 5 Filter Controls */}
      <div className={`grid grid-cols-1 gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-5'}`}>
        
        {/* 1. Doctor Name Search Input */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Search className="h-3 w-3 text-indigo-500" />
            Doctor Name
          </label>
          <div className="relative">
            <input
              type="text"
              value={filterState.searchName}
              onChange={(e) => setFilterState((p) => ({ ...p, searchName: e.target.value }))}
              placeholder="e.g. Dr. Sharma..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all"
            />
            {filterState.searchName && (
              <button
                type="button"
                onClick={() => setFilterState((p) => ({ ...p, searchName: '' }))}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 2. State Filter Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <MapPin className="h-3 w-3 text-emerald-500" />
            State
          </label>
          <select
            value={filterState.state}
            onChange={(e) => {
              const newState = e.target.value;
              setFilterState((p) => ({
                ...p,
                state: newState,
                // Reset district if it doesn't belong to newly chosen state
                district: 'ALL'
              }));
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="ALL">All States (India)</option>
            {availableStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* 3. District / City Filter Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Building2 className="h-3 w-3 text-amber-500" />
            District / City
          </label>
          <select
            value={filterState.district}
            onChange={(e) => setFilterState((p) => ({ ...p, district: e.target.value }))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="ALL">All Districts / Cities</option>
            {availableDistricts.map((dst) => (
              <option key={dst} value={dst}>
                {dst}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Department / Specialty Filter Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Stethoscope className="h-3 w-3 text-indigo-500" />
            Department
          </label>
          <select
            value={filterState.department}
            onChange={(e) => setFilterState((p) => ({ ...p, department: e.target.value }))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="ALL">All Departments</option>
            {availableDepartments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        {/* 5. Availability Filter Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Video className="h-3 w-3 text-blue-500" />
            Availability
          </label>
          <select
            value={filterState.availability}
            onChange={(e) => setFilterState((p) => ({ ...p, availability: e.target.value }))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:bg-white transition-all cursor-pointer"
          >
            <option value="ALL">All Consultation Modes</option>
            <option value="video">Telehealth / Video Enabled</option>
            <option value="visiting">In-Person OPD Visiting</option>
            <option value="active">On Active Duty</option>
          </select>
        </div>

      </div>

      {/* Active Filter Chips / Pills Display */}
      {isFilteredActive && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Filters:</span>
          {filterState.searchName && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-indigo-100">
              Name: "{filterState.searchName}"
              <button onClick={() => setFilterState((p) => ({ ...p, searchName: '' }))} className="hover:text-indigo-900 cursor-pointer">✕</button>
            </span>
          )}
          {filterState.state !== 'ALL' && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-100">
              State: {filterState.state}
              <button onClick={() => setFilterState((p) => ({ ...p, state: 'ALL' }))} className="hover:text-emerald-900 cursor-pointer">✕</button>
            </span>
          )}
          {filterState.district !== 'ALL' && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-100">
              District: {filterState.district}
              <button onClick={() => setFilterState((p) => ({ ...p, district: 'ALL' }))} className="hover:text-amber-900 cursor-pointer">✕</button>
            </span>
          )}
          {filterState.department !== 'ALL' && (
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-purple-100">
              Dept: {filterState.department}
              <button onClick={() => setFilterState((p) => ({ ...p, department: 'ALL' }))} className="hover:text-purple-900 cursor-pointer">✕</button>
            </span>
          )}
          {filterState.availability !== 'ALL' && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-blue-100">
              Mode: {filterState.availability === 'video' ? 'Telehealth Video' : filterState.availability === 'visiting' ? 'In-Person' : 'Active Duty'}
              <button onClick={() => setFilterState((p) => ({ ...p, availability: 'ALL' }))} className="hover:text-blue-900 cursor-pointer">✕</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
