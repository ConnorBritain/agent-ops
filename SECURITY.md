# Security policy

Do not report security vulnerabilities in public issues. Use the repository owner's private security-reporting channel or GitHub's private vulnerability reporting when it is enabled.

This template intentionally excludes host access, network endpoints, production credentials, relay configuration, and private fleet inventory. Do not submit them in issues, pull requests, logs, fixtures, or generated documentation.

The public-data guard scans current and historical blobs for credential formats.
Private implementations add deployment-specific detection by supplying
`AGENTOPS_PRIVATE_DENYLIST` through private CI as one exact value per line. The
guard compares those values case-insensitively against current and historical
paths and content without printing the values. Never commit the denylist or
place it in public CI configuration.

Destructive actions, production changes, credential changes, force pushes, merges, and irreversible browser submissions remain outside Phase 0 and require an explicit recorded policy decision in a later implementation slice.
