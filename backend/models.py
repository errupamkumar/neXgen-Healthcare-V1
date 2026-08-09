# -*- coding: utf-8 -*-
# SPDX-License-Identifier: Apache-2.0

from sqlalchemy import Column, String, Integer, Text, Numeric, Boolean, JSON, ForeignKey
from .database import Base

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    specialty = Column(String(100), nullable=False)
    image = Column(Text, nullable=True)
    rating = Column(Numeric(3, 2), default=5.0)
    hospital = Column(String(150), nullable=True)
    bio = Column(Text, nullable=True)
    video_enabled = Column(Boolean, default=True)
    slots = Column(JSON, nullable=False)  # List of string slots: ["09:00 AM", ...]
    max_schedules_per_slot = Column(Integer, default=3)
    fee = Column(Integer, default=150) # Consultation fee
    is_active = Column(Boolean, default=True) # Enabled/disabled status


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    contact = Column(String(50), nullable=False)
    allergies = Column(JSON, nullable=True)  # List of string allergies: ["Latex", ...]
    medications = Column(JSON, nullable=True)  # List of string medications: ["Aspirin", ...]
    medical_conditions = Column(JSON, nullable=True)  # List of string conditions: ["Hypertension", ...]
    notes = Column(Text, nullable=True)


class MedicalDocument(Base):
    __tablename__ = "documents"

    id = Column(String(50), primary_key=True, index=True)
    patient_id = Column(String(50), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    category = Column(String(50), nullable=False)
    upload_date = Column(String(50), nullable=False)
    file_name = Column(String(250), nullable=False)
    file_size = Column(String(50), nullable=False)
    file_content_text = Column(Text, nullable=False)
    analysis = Column(JSON, nullable=True)  # Detailed parsed Gemini extraction dict


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(String(50), primary_key=True, index=True)
    doctor_id = Column(String(50), ForeignKey("doctors.id", ondelete="CASCADE"), nullable=False)
    patient_id = Column(String(50), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    date = Column(String(50), nullable=False)
    time_slot = Column(String(50), nullable=False)
    status = Column(String(30), nullable=False, default="scheduled")  # scheduled, completed, cancelled, active-video
    type = Column(String(30), nullable=False, default="visiting")  # visiting, telehealth
    patient_name = Column(String(100), nullable=False)
    patient_age = Column(Integer, nullable=False)
    patient_contact = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    fee_paid = Column(Boolean, default=False)
    amount_paid = Column(Numeric(8, 2), default=0.0)
    payment_method = Column(String(50), nullable=True)
    payment_date = Column(String(50), nullable=True)
    feedback_rating = Column(Integer, nullable=True)
    feedback_text = Column(Text, nullable=True)


class HospitalConfig(Base):
    __tablename__ = "hospital_config"

    id = Column(String(50), primary_key=True, default="current")
    name = Column(String(100), nullable=False, default="HealthCentral Metropolitan Clinic")
    address = Column(String(200), nullable=False, default="100 Medical Plaza, New York, NY")
    tax_rate = Column(Numeric(5, 3), default=8.875)
    contact_number = Column(String(50), default="+1 (555) 999-0000")
    enable_sms = Column(Boolean, default=True)
    enable_telehealth = Column(Boolean, default=True)
