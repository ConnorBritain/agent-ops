# Blockers

## Active blockers

None for generalized local PrintProvider implementation and CI verification.

## Explicit authorization gates

- No host bootstrap or worker installation is authorized by this repository bootstrap.
- Static worker service definitions are not installed services and have no real
  connection, credential, cryptographic verifier, or provider-launch authority.
- No hosted Supabase migration, production environment, secret, RustDesk relay,
  account, device enrollment, or unattended-access configuration is authorized
  by the public implementation.
- Restricted-domain federation remains disabled pending a dedicated ADR and policy approval.
