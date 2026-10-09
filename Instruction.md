Before making any change to this repository:

1. Run git pull origin main and confirm you are working from the latest main branch.
2. Review the current IPF Business Support implementation before editing anything.
3. Preserve the locked flow:

Free Business Check
→ Discovery Call Request
→ Admin Review
→ Fit
→ Client Onboarding Invitation
→ Account Activation
→ Client Dashboard

4. Do not alter or break:
- universal authentication
- Super Admin access
- Business Check persistence
- discovery-call workflow
- Fit / Refer / Decline logic
- onboarding invitations
- client account creation
- client login
- business memberships
- existing database migrations

5. Reuse existing components, permissions, tables and server procedures where possible.
6. Before changing shared files, check where else they are used.
7. If a requested change conflicts with the existing implementation, stop and explain the conflict before editing.
8. After changes, run the existing checks/tests and confirm the locked flow still works.

Do not overwrite or reverse recent work unless explicitly instructed.