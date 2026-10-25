-- ==============================================================================
-- FlyRank Widget Platform: 001_initial_schema.sql
-- Description: Core schema with tenants, users, widgets, submissions, and side-effects.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants Table (Multi-tenant boundary)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'standard',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table (Tenant members with hashed credentials)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- 3. Widgets Table (Form definitions, styling, and embed rules)
CREATE TABLE IF NOT EXISTS widgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'signup_form', -- signup_form, cta, popover
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    button_text VARCHAR(100) NOT NULL DEFAULT 'Submit',
    fields_schema JSONB NOT NULL DEFAULT '[
      {"name": "email", "type": "email", "label": "Email Address", "required": true},
      {"name": "name", "type": "text", "label": "Full Name", "required": false}
    ]'::jsonb,
    display_rules JSONB NOT NULL DEFAULT '{
      "position": "bottom-right",
      "theme_color": "#2563eb",
      "allowed_origins": ["*"]
    }'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_widgets_tenant_id UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_widgets_tenant_active ON widgets(tenant_id, is_active);

-- 4. Submissions Table (Hardened public lead ingestions)
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    widget_id UUID NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    visitor_ip VARCHAR(45) NOT NULL,
    user_agent TEXT,
    country_code VARCHAR(10),
    country_name VARCHAR(100),
    city VARCHAR(100),
    geo_provider VARCHAR(50), -- 'ip-api', 'ipapi.co', 'none'
    geo_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'enriched', 'failed', 'skipped'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite indexes for dashboard query speed and tenant boundary enforcement
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_created ON submissions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_widget_created ON submissions(widget_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_tenant_country ON submissions(tenant_id, country_code);

-- 5. Safe Side Effect Delivery Logs Table (Audit trail for asynchronous notifications)
CREATE TABLE IF NOT EXISTS side_effect_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'email', 'webhook'
    status VARCHAR(50) NOT NULL, -- 'success', 'failed'
    attempts INT NOT NULL DEFAULT 1,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_side_effect_submission ON side_effect_logs(submission_id);
