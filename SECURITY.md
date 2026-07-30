# Security policy

Do not report security vulnerabilities in public issues. Use the repository owner's private security-reporting channel or GitHub's private vulnerability reporting when it is enabled.

This template intentionally excludes host access, network endpoints, production credentials, relay configuration, and private fleet inventory. Do not submit them in issues, pull requests, logs, fixtures, or generated documentation.

The public-data guard scans current and historical blobs for credential formats.
Private implementations can add deployment-specific detection without
publishing reversible values by supplying a secret
`AGENTOPS_PRIVATE_GUARD_HMAC_KEY` and the corresponding comma-separated SHA-256
HMACs in `AGENTOPS_PRIVATE_GUARD_HMACS` through private CI. Supply both values
out of band; never commit the key, source values, or unkeyed hashes of
low-entropy identifiers such as IP addresses.

Destructive actions, production changes, credential changes, force pushes, merges, and irreversible browser submissions remain outside Phase 0 and require an explicit recorded policy decision in a later implementation slice.
