-- ══════════════════════════════════════════════════════════════════
-- ClinIQ AI — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════════════

-- 1. User profiles
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text,
  role        text check (role in ('patient','doctor')) default 'patient',
  name        text,
  age         int,
  gender      text,
  city        text,
  phone       text,
  created_at  timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can read own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- 2. Doctors directory
create table if not exists doctors (
  id              uuid default gen_random_uuid() primary key,
  name            text not null,
  specialization  text not null,
  experience      int,
  qualification   text,
  hospital        text,
  city            text,
  address         text,
  fee             int,
  rating          float default 4.5,
  phone           text,
  available_days  text[] default array['Mon','Tue','Wed','Thu','Fri'],
  slots           text[] default array['09:00','10:00','11:00','14:00','15:00','16:00'],
  image_url       text,
  created_at      timestamptz default now()
);
alter table doctors enable row level security;
create policy "Anyone can read doctors" on doctors for select using (true);

-- 3. Appointments
create table if not exists appointments (
  id               uuid default gen_random_uuid() primary key,
  patient_id       uuid references profiles(id) on delete cascade,
  doctor_id        uuid references doctors(id) on delete cascade,
  appointment_date date not null,
  time_slot        text not null,
  symptoms         text,
  status           text default 'confirmed' check (status in ('pending','confirmed','completed','cancelled')),
  sms_sent         boolean default false,
  created_at       timestamptz default now()
);
alter table appointments enable row level security;
create policy "Patients see own appointments" on appointments for select using (auth.uid() = patient_id);
create policy "Patients can book" on appointments for insert with check (auth.uid() = patient_id);
create policy "Patients can cancel" on appointments for update using (auth.uid() = patient_id);

-- 4. Analysis history
create table if not exists analysis_history (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references profiles(id) on delete cascade,
  report_type   text,
  risk_level    text,
  analysis_data jsonb,
  created_at    timestamptz default now()
);
alter table analysis_history enable row level security;
create policy "Users see own history" on analysis_history for select using (auth.uid() = user_id);
create policy "Users can save history" on analysis_history for insert with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- 5. Seed: Doctor data for 6 Indian cities
-- ══════════════════════════════════════════════════════════════════
insert into doctors (name, specialization, experience, qualification, hospital, city, address, fee, rating, phone) values
-- Mumbai
('Dr. Priya Sharma',    'Cardiologist',     18, 'MD, DM Cardiology',   'Lilavati Hospital',      'Mumbai',    'Bandra West, Mumbai',        800,  4.8, '+91-22-2655-1111'),
('Dr. Rajesh Mehta',   'Pulmonologist',    14, 'MD Pulmonology',       'Kokilaben Hospital',     'Mumbai',    'Andheri West, Mumbai',       700,  4.7, '+91-22-3066-2222'),
('Dr. Anjali Gupta',   'Neurologist',      16, 'MD, DM Neurology',     'Bombay Hospital',        'Mumbai',    'Marine Lines, Mumbai',       900,  4.9, '+91-22-2206-3333'),
('Dr. Vikram Patel',   'Orthopedic',       12, 'MS Orthopedics',       'Hinduja Hospital',       'Mumbai',    'Mahim, Mumbai',              600,  4.6, '+91-22-2445-4444'),
('Dr. Sunita Joshi',   'Gynecologist',     20, 'MD Gynecology',        'Breach Candy Hospital',  'Mumbai',    'Breach Candy, Mumbai',       1000, 4.9, '+91-22-2366-5555'),
('Dr. Arun Kumar',     'General Physician',10, 'MBBS, MD',             'Nanavati Hospital',      'Mumbai',    'Vile Parle West, Mumbai',    400,  4.5, '+91-22-2626-6666'),
-- Delhi
('Dr. Sameer Malhotra','Cardiologist',     22, 'MD, DM Cardiology',   'AIIMS Delhi',             'Delhi',     'Ansari Nagar, New Delhi',    1200, 5.0, '+91-11-2658-7777'),
('Dr. Neha Kapoor',    'Dermatologist',    11, 'MD Dermatology',       'Fortis Hospital',        'Delhi',     'Shalimar Bagh, Delhi',       600,  4.7, '+91-11-4277-8888'),
('Dr. Ashok Grover',   'Orthopedic',       25, 'MS, MCh Orthopedics',  'Max Hospital',           'Delhi',     'Saket, New Delhi',           800,  4.8, '+91-11-2651-9999'),
('Dr. Kavita Sharma',  'Endocrinologist',  15, 'MD, DM Endocrinology', 'Apollo Delhi',           'Delhi',     'Sarita Vihar, Delhi',        900,  4.7, '+91-11-2692-1010'),
('Dr. Ravi Bhatia',    'Gastroenterologist',18,'MD, DM Gastro',        'BLK Hospital',           'Delhi',     'Pusa Road, Delhi',           700,  4.6, '+91-11-3040-1111'),
('Dr. Meena Singh',    'Pediatrician',     13, 'MD Pediatrics',        'Rainbow Hospital Delhi', 'Delhi',     'Rohini, Delhi',              500,  4.8, '+91-11-4944-1212'),
-- Bangalore
('Dr. Suresh Reddy',   'Cardiologist',     19, 'DM Cardiology',        'Manipal Hospital',       'Bangalore', 'Old Airport Road, Bangalore',750,  4.7, '+91-80-2502-2222'),
('Dr. Lakshmi Narayana','Neurologist',     16, 'DM Neurology',         'Narayana Health',        'Bangalore', 'Hosur Road, Bangalore',      800,  4.8, '+91-80-7122-3333'),
('Dr. Deepa Venkat',   'Gynecologist',     14, 'MD Gynecology',        'Cloudnine Hospital',     'Bangalore', 'Marathahalli, Bangalore',    700,  4.9, '+91-80-6789-4444'),
('Dr. Amar Nath',      'Urologist',        17, 'MCh Urology',          'Apollo Bangalore',       'Bangalore', 'Bannerghatta Road, Bangalore',900, 4.6, '+91-80-2941-5555'),
('Dr. Preethi KR',     'Dermatologist',    10, 'MD Dermatology',       'Sakra Hospital',         'Bangalore', 'Devarabeesanahalli, Bangalore',600,4.7, '+91-80-4969-6666'),
('Dr. Rohith Kumar',   'General Physician',8,  'MBBS, MD',             'Aster CMI Hospital',     'Bangalore', 'Hebbal, Bangalore',          450,  4.5, '+91-80-4342-7777'),
-- Chennai
('Dr. Aruna Ramaswamy','Cardiologist',     20, 'DM Cardiology',        'Apollo Chennai',         'Chennai',   'Greams Road, Chennai',       900,  4.8, '+91-44-2829-8888'),
('Dr. K. Venkataraman','Oncologist',       24, 'MD, DM Oncology',      'Cancer Institute',       'Chennai',   'Adyar, Chennai',             1500, 5.0, '+91-44-2235-9999'),
('Dr. Shalini Murthy', 'Gynecologist',     15, 'MD Gynecology',        'Fortis Malar Hospital',  'Chennai',   'Adyar, Chennai',             700,  4.7, '+91-44-4289-1010'),
('Dr. P. Annamalai',   'Orthopedic',       18, 'MS Orthopedics',       'MIOT Hospital',          'Chennai',   'Manapakkam, Chennai',        800,  4.7, '+91-44-4200-1111'),
('Dr. Revathi Nair',   'Neurologist',      13, 'DM Neurology',         'Sri Ramachandra Hospital','Chennai',  'Porur, Chennai',             850,  4.6, '+91-44-2476-1212'),
('Dr. Jayaraj S',      'General Physician',9,  'MBBS, MD',             'Kauvery Hospital',       'Chennai',   'Triplicane, Chennai',        500,  4.5, '+91-44-4000-1313'),
-- Hyderabad
('Dr. Sudhir Reddy',   'Cardiologist',     16, 'DM Cardiology',        'KIMS Hospital',          'Hyderabad', 'Secunderabad, Hyderabad',    700,  4.7, '+91-40-4488-2222'),
('Dr. Padma Rao',      'Endocrinologist',  14, 'DM Endocrinology',     'Apollo Hyderabad',       'Hyderabad', 'Jubilee Hills, Hyderabad',   800,  4.8, '+91-40-2360-3333'),
('Dr. Ravi Shankar',   'Gastroenterologist',19,'DM Gastro',            'Yashoda Hospital',       'Hyderabad', 'Somajiguda, Hyderabad',      700,  4.6, '+91-40-2337-4444'),
('Dr. Latha Venkatesan','Gynecologist',    12, 'MD Gynecology',        'Rainbow Hospital',       'Hyderabad', 'Banjara Hills, Hyderabad',   650,  4.8, '+91-40-4444-5555'),
('Dr. S.K. Misra',     'Pulmonologist',    21, 'MD Pulmonology',       'Medicover Hospital',     'Hyderabad', 'Nampally, Hyderabad',        600,  4.5, '+91-40-6767-6666'),
('Dr. Anitha Krishna', 'General Physician',7,  'MBBS, MD',             'Continental Hospital',   'Hyderabad', 'Gachibowli, Hyderabad',      400,  4.5, '+91-40-6700-7777'),
-- Pune
('Dr. Milind Deshpande','Cardiologist',    17, 'DM Cardiology',        'Ruby Hall Clinic',       'Pune',      'Sassoon Road, Pune',         750,  4.7, '+91-20-6645-8888'),
('Dr. Shruti Joshi',   'Dermatologist',    11, 'MD Dermatology',       'Sahyadri Hospital',      'Pune',      'Deccan Gymkhana, Pune',      550,  4.6, '+91-20-6721-9999'),
('Dr. Ajay Thakur',    'Orthopedic',       15, 'MS Orthopedics',       'Jehangir Hospital',      'Pune',      'Sassoon Road, Pune',         700,  4.7, '+91-20-6681-1010'),
('Dr. Vidya Patil',    'Gynecologist',     18, 'MD Gynecology',        'Inamdar Hospital',       'Pune',      'Fatima Nagar, Pune',         600,  4.8, '+91-20-6799-1111'),
('Dr. Rahul Kulkarni', 'Neurologist',      12, 'DM Neurology',         'KEM Hospital Pune',      'Pune',      'Rasta Peth, Pune',           800,  4.6, '+91-20-6120-1212'),
('Dr. Priyanka More',  'General Physician',6,  'MBBS, MD',             'Deenanath Hospital',     'Pune',      'Erandwane, Pune',            400,  4.5, '+91-20-4015-1313');
