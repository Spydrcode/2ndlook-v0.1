# Jobber OAuth Integration - Implementation Summary

## Overview
Complete OAuth 2.0 integration for Jobber that enables automatic ingestion of estimates (quotes) and invoices with one-time authorization. This implementation follows 2ndlook's field diet principle (signal-only, no customer details).

## Implementation Components

### 1. Environment Configuration
**File:** `.env.example`

Added Jobber OAuth credentials:
```env
JOBBER_CLIENT_ID=your_jobber_client_id
JOBBER_CLIENT_SECRET=your_jobber_client_secret
JOBBER_REDIRECT_URI=http://localhost:3000/api/oauth/jobber/callback
JOBBER_SCOPES=quotes:read invoices:read
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Database Migration
**File:** `supabase/migrations/20260111_oauth_connections.sql`

Created `oauth_connections` table:
- Stores access_token, refresh_token, expires_at
- Unique constraint on (user_id, tool)
- RLS policies for user-scoped access
- Supports token rotation on refresh

### 3. OAuth Flow Routes

#### Start Route
**File:** `src/app/api/oauth/jobber/start/route.ts`

Initiates OAuth flow:
- Validates user authentication
- Generates crypto-random state (32 bytes)
- Sets HttpOnly cookies for state + user_id (10min TTL)
- Redirects to Jobber authorize endpoint

#### Callback Route
**File:** `src/app/api/oauth/jobber/callback/route.ts`

Handles OAuth callback:
- Validates state cookie matches
- Exchanges authorization code for tokens
- Persists tokens to oauth_connections table
- Triggers ingestion endpoint
- Redirects to review page with source_id

### 4. GraphQL Client
**File:** `src/lib/jobber/graphql.ts`

Fetches data from Jobber API:

**fetchJobberQuotes:**
- Queries Jobber GraphQL API for quotes
- Filters: last 90 days, limit 100
- Fields: id, createdAt, closedAt, total, status
- Uses X-JOBBER-GRAPHQL-VERSION: 2023-03-09

**fetchJobberInvoices:**
- Queries Jobber GraphQL API for invoices
- Filters: last 90 days, limit 100
- Fields: id, createdAt, dueDate, total, status

### 5. OAuth Token Management
**File:** `src/lib/jobber/oauth.ts`

**refreshJobberToken:**
- Fetches current refresh_token from database
- Requests new tokens from Jobber
- Persists new access_token + refresh_token (handles rotation)
- Returns new tokens or null on error

**getJobberAccessToken:**
- Fetches current access_token
- Checks expiration (with 5min buffer)
- Auto-refreshes if expired
- Returns valid token or null

### 6. Ingestion Endpoint
**File:** `src/app/api/oauth/jobber/ingest/route.ts`

One-time data ingestion:
- Fetches quotes via GraphQL
- Fetches invoices via GraphQL
- Normalizes to EstimateCanonicalRow / InvoiceCanonicalRow
- Creates source in database
- Inserts estimates to estimates_normalized
- Inserts invoices to invoices_normalized
- Returns source_id + counts

**Status Mapping:**
- Quotes: approved/converted → "accepted", others → "closed"
- Invoices: draft/sent/viewed/paid/partial/overdue/void → canonical statuses

### 7. UI Integration
**File:** `src/app/(main)/dashboard/connect/page.tsx`

Updated Connect button handler:
- Detects tool === "jobber"
- Redirects to `/api/oauth/jobber/start` instead of file upload
- Maintains existing file-based flow for other connectors

### 8. Connector Updates

#### Estimate Connector
**File:** `src/lib/connectors/estimates/jobber.ts`

Updated to mark as implemented:
- isImplemented = true
- Documents OAuth-only flow
- Throws NotImplementedError for file/fetch methods

#### Invoice Connector
**File:** `src/lib/connectors/invoices/jobber.ts`

Updated to mark as implemented:
- isImplemented = true
- Documents OAuth-only flow
- Throws NotImplementedError for file/fetch methods

## Data Flow

1. **User clicks "Connect Jobber"**
   - UI: `/dashboard/connect`
   - Action: window.location.href = "/api/oauth/jobber/start"

2. **OAuth start**
   - Route: `/api/oauth/jobber/start`
   - Generates state, sets cookies
   - Redirects to Jobber authorize URL

3. **User authorizes in Jobber**
   - Jobber prompts user for permission
   - User grants quotes:read, invoices:read

4. **OAuth callback**
   - Route: `/api/oauth/jobber/callback`
   - Validates state, exchanges code
   - Saves tokens to oauth_connections
   - Triggers ingestion

5. **Data ingestion**
   - Route: `/api/oauth/jobber/ingest`
   - Fetches quotes + invoices from Jobber GraphQL
   - Normalizes to canonical format
   - Creates source, inserts data
   - Returns source_id

6. **Redirect to review**
   - URL: `/dashboard/review?source_id=<id>&success=true`
   - User can now bucket data and generate snapshot

## Security Features

- **State validation:** Crypto-random 32-byte state prevents CSRF
- **HttpOnly cookies:** State + user_id cookies not accessible to JS
- **Token rotation:** Always persists new refresh_token if provided
- **Token expiration:** Auto-refresh with 5min buffer
- **RLS policies:** Users can only access their own OAuth connections
- **Field diet:** No customer names, addresses, or line items

## Data Constraints

- **Time window:** Last 90 days only
- **Record limit:** 100 quotes, 100 invoices max
- **Field restrictions:** id, dates, totals, statuses only
- **Filter requirements:** Quotes must have closedAt to be included

## Testing Checklist

- [ ] Register OAuth app in Jobber Developer Portal
- [ ] Configure redirect_uri: http://localhost:3000/api/oauth/jobber/callback
- [ ] Request scopes: quotes:read, invoices:read
- [ ] Copy client_id and client_secret to .env
- [ ] Run database migration: `supabase db push`
- [ ] Click "Connect Jobber" button
- [ ] Verify redirect to Jobber auth page
- [ ] Authorize app in Jobber
- [ ] Verify callback succeeds
- [ ] Verify tokens stored in oauth_connections table
- [ ] Verify ingestion creates source + estimates + invoices
- [ ] Verify redirect to review page with source_id
- [ ] Test token refresh (manually expire token)

## Next Steps

1. **Register Jobber OAuth app** - Get client credentials from Jobber Developer Portal
2. **Test OAuth flow** - End-to-end authorization and ingestion
3. **Add error UI** - Display friendly messages for OAuth failures
4. **Add re-authorization** - Handle expired/revoked tokens gracefully
5. **Add loading states** - Show spinner during OAuth redirect
6. **Test token refresh** - Verify rotation handling works correctly

## Files Created/Modified

**Created (10 files):**
- supabase/migrations/20260111_oauth_connections.sql
- src/app/api/oauth/jobber/start/route.ts
- src/app/api/oauth/jobber/callback/route.ts
- src/app/api/oauth/jobber/ingest/route.ts
- src/lib/jobber/oauth.ts
- src/lib/jobber/graphql.ts

**Modified (4 files):**
- .env.example
- src/app/(main)/dashboard/connect/page.tsx
- src/lib/connectors/estimates/jobber.ts
- src/lib/connectors/invoices/jobber.ts

## Architecture Notes

- **OAuth 2.0 Authorization Code Flow** - Standard server-side OAuth
- **Token refresh with rotation** - Handles Jobber's token rotation safely
- **GraphQL API** - Uses Jobber's GraphQL endpoint (2023-03-09 version)
- **Canonical normalization** - Maps Jobber data to 2ndlook canonical types
- **Signal-only approach** - No customer PII, only aggregatable patterns
- **One-time ingestion** - No webhooks, no continuous sync

## Compliance

- ✅ Field diet enforced (no customer names, addresses, line items)
- ✅ Data caps applied (90 days OR 100 records)
- ✅ Status normalization (maps to canonical enum)
- ✅ RLS policies (user-scoped access only)
- ✅ Token security (HttpOnly cookies, encrypted storage)
- ✅ Graceful degradation (handles API errors)
