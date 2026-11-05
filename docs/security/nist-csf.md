# Privileged access against the NIST Cybersecurity Framework

How The Shift controls who can see and change client records, mapped to the six functions of the NIST Cybersecurity
Framework 2.0. "Built" means it is in the code and tested; "Planned" means it is the next phase. Updated 5 November 2026
with migration 0012.

## Who this covers

Everyone with an internal role: Super Admins, Admins, engagement leads (desk_lead), partners, analysts, finance and
specialists (subject_matter_expert, the contractors on a client's work). Clients sign in with a password and see only
their own business; client isolation is described in `docs/product/05-backend-schema.md` §4.

## The controls

| Function | Control | Where | Status |
|---|---|---|---|
| **Govern** | Roles and what each grants live in one file; nobody grants by hand in the database | `shared/platformPermissions.ts` | Built |
| Govern | Least privilege: a role is given or removed only by someone whose own role ranks above it; only a Super Admin makes an Admin; an Admin role grants no powers by itself | `canGrantRole`, `PLATFORM_ROLE_RANK` | Built |
| Govern | The permanent Super Admin and the last Super Admin can never be removed; nobody removes themselves | `server/platformAccess.ts` | Built |
| Govern | Quarterly access review: every person, role and end date confirmed or removed, signed off by a Super Admin | Access page | Planned (phase 2) |
| **Identify** | One list of everyone with a password: their roles, whether two-step is on, when their access ends, last sign-in | Admin › Administration Team › People and Staff | Built |
| Identify | Contractors' access has an end date from the day they are invited (required for a specialist, at most 400 days) | `user_platform_roles.expiresAt`, `account_invitations.roleExpiresAt` | Built |
| **Protect** | Two-step sign-in for everyone with an internal role: password, then a code from an authenticator app; a code is never accepted twice; five wrong codes end the attempt | `server/twoStep.ts`, `account.verifyTwoStep` | Built |
| Protect | The authenticator secret is sealed (AES-256-GCM); recovery codes and session tokens are stored only as hashes; passwords as salted scrypt | `user_two_step`, `user_sessions`, `user_credentials` | Built |
| Protect | Staff sessions last 12 hours; a role granted to someone signed in takes effect only at their next two-step sign-in | `STAFF_SESSION_MAX_AGE_MS`, `resolveAccountSession` | Built |
| Protect | A role past its end date gives nothing, on the next request, with no job to run | `roleIsCurrent()` in `loadAuthority` | Built |
| Protect | No client passwords are kept: contractors work through roles the client grants in their own tools (for example Meta Business Suite) | Engagement practice; agreement Section 7 | Practice |
| Protect | Specialists see only the engagements they are assigned to | `engagement_team`, `view_assigned_businesses` | Built |
| **Detect** | Email to every Super Admin, and a `security_alert` audit row, when: a role is given; a staff member is invited; a staff member signs in from a new browser or network; a staff account is locked by wrong passwords; five wrong two-step codes follow a right password; a recovery code is used; two-step is reset; access is removed | `server/securityAlerts.ts` | Built |
| Detect | Every sign-in, failure, role change and removal is in the audit log, with no secrets in it | `admin_access_audit_events` | Built |
| Detect | The audit log as a screen, filterable by person and event | Admin | Planned (phase 2) |
| **Respond** | **Remove access** in one step: every role, engagement and session ended, two-step cleared, account suspended, reason recorded, Super Admins told | People › Remove access | Built |
| Respond | Suspend an account (signs out everywhere) without removing roles, with a reason | People › Suspend | Built |
| **Recover** | **Reset two-step** for a lost or replaced phone: sessions ended, set up again at the next sign-in | People › Reset two-step | Built |
| Recover | Recovery codes: eight single-use codes shown once at set-up | Sign-in | Built |
| Recover | Reinstate a suspended account, then give roles again | People › Reinstate | Built |
| Recover | Written runbook: lost phone, leaked password, suspected break-in, a contractor leaving early | `docs/security/` | Planned (phase 2) |

## What a person sees

1. **First sign-in** after they are invited (or after a reset): password, then a QR code to scan with Google
   Authenticator, Microsoft Authenticator or 1Password, then the first code, then eight recovery codes to keep.
2. **Every sign-in after that:** password, then the six-digit code.
3. **Lost phone:** a recovery code, or ask a Super Admin (or an Admin above their role) to reset two-step.

## Operating notes

- Changing `JWT_SECRET` in Vercel makes every sealed secret unreadable: everyone with a role must set up two-step
  again. Reset them from People, or plan the change.
- Alerts go by email only when `RESEND_API_KEY` is set; they are always in the audit log.
- Migration 0012 must be applied before the code that uses it is deployed (`docs/database-migrations.md`).
