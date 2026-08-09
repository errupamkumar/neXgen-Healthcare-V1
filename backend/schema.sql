-- ==========================================
-- HealthCentral MySQL Database DDL Schema
-- SPDX-License-Identifier: Apache-2.0
-- ==========================================

CREATE DATABASE IF NOT EXISTS healthcentral;
USE healthcentral;

-- Doctors Table
CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100) NOT NULL,
    image TEXT,
    rating DECIMAL(3, 2) DEFAULT 5.0,
    hospital VARCHAR(150),
    bio TEXT,
    video_enabled BOOLEAN DEFAULT TRUE,
    slots JSON NOT NULL, -- Stored as list of slot strings/dicts
    max_schedules_per_slot INT DEFAULT 3
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patients Table
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    age INT,
    gender VARCHAR(20),
    contact VARCHAR(50) NOT NULL,
    allergies JSON, -- Stored as string array ["Penicillin", ...]
    medications JSON, -- Stored as string array ["Lisinopril", ...]
    medical_conditions JSON, -- Stored as string array ["Hypertension", ...]
    notes TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Medical Documents Table
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(50) PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    upload_date VARCHAR(50) NOT NULL,
    file_name VARCHAR(250) NOT NULL,
    file_size VARCHAR(50) NOT NULL,
    file_content_text LONGTEXT NOT NULL,
    analysis JSON, -- Stored as JSON object containing clinical summaries, allergens, meds, risk level
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(50) PRIMARY KEY,
    doctor_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    date VARCHAR(50) NOT NULL,
    time_slot VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    type VARCHAR(30) NOT NULL DEFAULT 'visiting',
    patient_name VARCHAR(100) NOT NULL,
    patient_age INT NOT NULL,
    patient_contact VARCHAR(50) NOT NULL,
    notes TEXT,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional initial seed records for testing
INSERT INTO doctors (id, name, specialty, image, rating, hospital, bio, video_enabled, slots, max_schedules_per_slot)
VALUES 
('doc-1', 'Dr. Sarah Jenkins', 'Cardiologist', 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300', 4.9, 'Manhattan Heart Center', 'Senior cardiologist with over 15 years specializing in cardiac arrhythmias and electrophysiology management.', 1, '["09:00 AM", "10:30 AM", "01:00 PM", "03:30 PM"]', 3),
('doc-2', 'Dr. Marcus Vance', 'Hematologist / Oncologist', 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300', 4.8, 'Metropolitan Clinical Lab', 'Expert hematologist focusing on complex anemia therapies and clinical diagnostic reports processing.', 1, '["10:00 AM", "11:30 AM", "02:00 PM", "04:00 PM"]', 3),
('doc-3', 'Dr. Eleanor Vance', 'Dermatologist', 'https://images.unsplash.com/photo-1594824813573-246434de83fb?auto=format&fit=crop&q=80&w=300', 4.9, 'ClearSkin Pathology Clinic', 'Clinical skin pathology specialist. Passionate about early melanoma screening and modern dermatologic therapies.', 1, '["09:30 AM", "11:00 AM", "01:30 PM", "03:00 PM"]', 3)
ON DUPLICATE KEY UPDATE name=name;
