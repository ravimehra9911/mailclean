# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Email **support@mailclean.app** with:

- what you found and where (file, screen or release version),
- steps to reproduce, and
- the impact you think it has.

You can also open a [private security advisory](https://github.com/ravimehra9911/mailclean/security/advisories/new)
on GitHub. You'll get a reply within a few days; please give us a reasonable chance to ship a fix before
disclosing the issue publicly.

## Supported versions

Only the latest release (see [Releases](https://github.com/ravimehra9911/mailclean/releases/latest)) gets
security fixes. The desktop app checks for new versions on launch.

## What's in scope

- The desktop app (macOS, Windows, Linux) and its bundled local server, which listens on 127.0.0.1 only.
- How account passwords, OAuth tokens and the local database are stored and encrypted.
- The release installers: they must never contain OAuth keys, `.env` files, databases or encryption keys.
  Every release build is scanned for these by `scripts/check-release.mjs`.

See "Security model" in the [README](README.md#security-model) for how the app is designed.
