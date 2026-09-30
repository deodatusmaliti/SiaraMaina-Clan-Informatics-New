-- Migration Name: Initialize SiaraMaina PostgreSQL Database Schema on Supabase
-- Target Database: PostgreSQL / Supabase
-- Created At: 2026-09-29T23:29:00Z

-- 1. Create Profiles Table (Linked to Supabase Auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
    institution VARCHAR(255) DEFAULT 'SiaraMaina Clan Informatics',
    branch VARCHAR(100) DEFAULT 'all',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Clan Records Table with recursive foreign keys for father, mother, and spouse
CREATE TABLE IF NOT EXISTS public.records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) CHECK (email IS NULL OR email = '' OR email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
    whatsapp VARCHAR(100),
    location VARCHAR(255),
    occupation VARCHAR(255),
    education VARCHAR(255),
    branch_type VARCHAR(50) NOT NULL DEFAULT 'heritage' CHECK (branch_type IN ('heritage', 'alliance', 'branch_member')),
    marital_status VARCHAR(100) DEFAULT 'Not Recorded',
    spouse_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
    father_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
    mother_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
    deceased BOOLEAN DEFAULT false,
    dob VARCHAR(100),
    dod VARCHAR(100),
    cause_of_death VARCHAR(255) DEFAULT 'Not Recorded',
    narrative TEXT,
    photo TEXT,
    course VARCHAR(255),
    organization VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Payments Transactions Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    checkout_session_id VARCHAR(255) UNIQUE NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'usd',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    ip_address VARCHAR(100),
    user_agent VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Define Security Policies (RLS Rules)

-- A. Profiles Policies
CREATE POLICY "Public Profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (active = true);

CREATE POLICY "Users can update their own profile displays" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- B. Clan Records Policies
CREATE POLICY "Anyone can view clan lineage records" ON public.records
    FOR SELECT USING (true);

CREATE POLICY "Admins and Editors have write access to lineage records" ON public.records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'editor') AND active = true
        )
    );

-- C. Payments Policies
CREATE POLICY "Users can query their own transaction contributions" ON public.payments
    FOR SELECT USING (auth.uid() = user_id);

-- D. Audit Logs Policies
CREATE POLICY "Only admins have select capabilities on security logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin' AND active = true
        )
    );

-- 7. Performance Optimization Indices
CREATE INDEX IF NOT EXISTS idx_records_parents ON public.records(father_id, mother_id);
CREATE INDEX IF NOT EXISTS idx_records_spouse ON public.records(spouse_id);
CREATE INDEX IF NOT EXISTS idx_records_branch ON public.records(branch_type);
CREATE INDEX IF NOT EXISTS idx_payments_checkout_session ON public.payments(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_action ON public.audit_logs(user_id, action);
