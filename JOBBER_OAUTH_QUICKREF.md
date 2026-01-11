# Jobber OAuth Quick Reference

## 🚀 Quick Start

### 1. Register Jobber OAuth App
- Go to Jobber Developer Portal
- Create new OAuth app
- Set redirect URI: `http://localhost:3000/api/oauth/jobber/callback`
- Request scope: `quotes:read`
- Copy client_id and client_secret

### 2. Configure Environment
Add to `.env.local`:
```env
JOBBER_CLIENT_ID=your_client_id_here
JOBBER_CLIENT_SECRET=your_client_secret_here
JOBBER_REDIRECT_URI=http://localhost:3000/api/oauth/jobber/callback
JOBBER_SCOPES=quotes:read
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run Migration
```bash
supabase db push
```

### 4. Test
1. Navigate to `/dashboard/connect`
2. Click "Connect Jobber"
3. Authorize in Jobber
4. Verify redirect to `/dashboard/review?source_id=<uuid>`

## 📁 File Structure

```
src/
├── app/
│   ├── api/
│   │   └── oauth/
│   │       └── jobber/
│   │           ├── start/route.ts       # OAuth initiation
│   │           └── callback/route.ts    # OAuth callback + ingestion
│   └── (main)/dashboard/
│       └── connect/page.tsx             # Updated with error handling
└── lib/
    ├── jobber/
    │   ├── oauth.ts                     # Token management
    │   ├── graphql.ts                   # Jobber API client
    │   └── ingest.ts                    # Ingestion logic
    └── ingest/
        └── normalize-estimates.ts       # Shared normalization

supabase/migrations/
└── 20260111_oauth_connections.sql       # Database migration
```

## 🔄 Data Flow

```
Connect Button → /api/oauth/jobber/start
  ↓ (redirect)
Jobber Authorization Page
  ↓ (redirect)
/api/oauth/jobber/callback
  ↓
Store Tokens → Ingest Data → Create Source
  ↓
/dashboard/review?source_id=<uuid>
```

## ⚙️ Key Functions

### OAuth Flow
- `GET /api/oauth/jobber/start` - Initiates OAuth
- `GET /api/oauth/jobber/callback` - Handles callback

### Data Fetching
- `fetchClosedEstimates(userId)` - Fetches from Jobber GraphQL
- `ingestJobberEstimates(userId)` - Creates source + normalizes data

### Token Management
- `getJobberAccessToken(userId)` - Gets valid token (auto-refresh)
- `refreshJobberToken(userId)` - Refreshes expired token

### Shared Utilities
- `normalizeAndStore(supabase, sourceId, rows)` - Normalizes + inserts estimates

## 🔒 Security

- **State Validation**: 32-byte crypto-random state
- **HttpOnly Cookies**: State + user_id (10min TTL)
- **Token Rotation**: Always persists new refresh_token
- **Auto Refresh**: 5min expiration buffer
- **RLS Policies**: User-scoped access only

## 📊 Data Constraints

| Constraint | Value |
|------------|-------|
| Time Window | Last 90 days |
| Max Records | 100 estimates |
| Min Records | 25 closed/accepted |
| Status Filter | closed/accepted only |
| Fields | id, dates, amount, status |

## ❌ Error Codes

| Code | Meaning |
|------|---------|
| `jobber_state_mismatch` | Security validation failed |
| `jobber_missing_code` | No auth code from Jobber |
| `jobber_min_estimates` | < 25 estimates found |
| `jobber_ingest_failed` | Failed to fetch data |
| `jobber_config_error` | Missing env vars |

## 🐛 Debugging

### Check OAuth Connection
```sql
SELECT * FROM oauth_connections WHERE tool = 'jobber';
```

### Check Source
```sql
SELECT * FROM sources WHERE source_type = 'jobber';
```

### Check Estimates
```sql
SELECT COUNT(*) FROM estimates_normalized WHERE source_id = '<uuid>';
```

### Check Logs
- Browser console for client-side errors
- Server logs for OAuth/API errors
- Supabase logs for database errors

## 🧪 Test Scenarios

### Happy Path ✅
- User with ≥25 closed estimates in last 90 days
- Valid OAuth credentials
- Successful token exchange
- Data inserted correctly

### Error Paths ❌
- <25 estimates → error + rollback
- Invalid state → security error
- Token exchange fails → error message
- Missing env vars → config error

## 📝 Status Mapping

Jobber → 2ndlook:
- `approved`, `converted` → `accepted`
- All others → `closed`

Only includes quotes with non-null `closedAt`.

## 🔗 API Endpoints

### Jobber OAuth
- Token: `POST https://api.getjobber.com/api/oauth/token`
- GraphQL: `POST https://api.getjobber.com/api/graphql`
- Version: `X-JOBBER-GRAPHQL-VERSION: 2023-03-09`

### 2ndlook Routes
- Start: `GET /api/oauth/jobber/start`
- Callback: `GET /api/oauth/jobber/callback`

## 💡 Tips

1. **Testing**: Use Jobber sandbox if available
2. **Tokens**: Monitor expires_at in oauth_connections
3. **Errors**: Check connect page for user-friendly messages
4. **Rollback**: Failed ingestion cleans up automatically
5. **Retry**: User can reconnect after fixing issues

## 📚 Related Files

- Migration: [supabase/migrations/20260111_oauth_connections.sql](supabase/migrations/20260111_oauth_connections.sql)
- Full Docs: [JOBBER_OAUTH_IMPLEMENTATION.md](JOBBER_OAUTH_IMPLEMENTATION.md)
- Summary: [JOBBER_OAUTH_SUMMARY.md](JOBBER_OAUTH_SUMMARY.md)
