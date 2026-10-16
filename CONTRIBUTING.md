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

- `npx tsc --noEmit` passes.
- Never commit real email data, passwords or keys. `.env*`, `.data/` and `build/config.json` are gitignored.
- Screenshots must use the demo data (`npm run desktop:prepare && npm run screenshots`).
- Adding a mail provider? It is one entry in `src/lib/catalog.ts`.

## Reporting security issues

Please don't open a public issue for security problems. Email the maintainer via the address on
https://github.com/ravimehra9911 or open a private security advisory on GitHub.
