# Contributing to MailClean

Thanks for helping! Bug reports, ideas and pull requests are welcome.

## Getting started

```bash
git clone https://github.com/ravimehra9911/mailclean.git
cd mailclean
npm install
npm run dev              # http://localhost:3000 (your data goes to ./.data, which is gitignored)
MAILCLEAN_DEMO=1 npm run dev   # same app with sample data: website at /, demo at /demo
```

Requires Node 22.13 or newer.

## Before opening a pull request

- `npm run typecheck`, `npm run lint` and `npm test` pass (CI also runs `npm audit --audit-level=high`).
- Never commit real email data, passwords or keys. `.env*`, `.data/` and `build/config.json` are gitignored.
- Screenshots must use the demo data (`npm run desktop:prepare && npm run screenshots`).
- Adding a mail provider? It is one entry in `src/lib/catalog.ts`.

## Releasing

Desktop releases are built by GitHub Actions (`.github/workflows/release.yml`), not on a laptop.

1. Bump `version` in `electron/package.json` (e.g. `1.8.2`) and merge it to `main`.
2. Tag that commit and push the tag:
   ```bash
   git tag v1.8.2 && git push origin v1.8.2
   ```
   The tag must match `electron/package.json`, or the workflow stops.
3. The workflow runs typecheck, lint and tests, builds the macOS (arm64 + x64), Windows and Linux installers
   on their own runners, scans each unpacked app for secret files and strings (`scripts/check-release.mjs`),
   and attaches `MailClean-mac-arm64.dmg`, `MailClean-mac-x64.dmg`, `MailClean-windows-x64.exe` and
   `MailClean-linux-x86_64.AppImage` to a **draft** release.
4. Review the draft on the Releases page, edit the notes and publish it. Publishing is always manual.

Re-running the workflow for a tag whose release is still a draft replaces the files; a published release is
never touched. Signing is off until these repository secrets are added: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS signing and notarization) and `WIN_CSC_LINK`,
`WIN_CSC_KEY_PASSWORD` (Windows). The Microsoft Store package is built separately by the manual
**Microsoft Store package** workflow.

## Reporting security issues

See [SECURITY.md](SECURITY.md): email support@mailclean.app or open a private security advisory on GitHub.
