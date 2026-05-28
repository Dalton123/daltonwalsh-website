# Dalton Walsh Astro Portfolio

Astro replacement for the migrated WordPress portfolio. This app uses the completed migration output as its source of truth and preserves the public URL structure for launch.

## Commands

Run the security scan before any npm command that can execute project code:

```bash
scan-repo-security .
npm install
scan-repo-security .
npm run build
npm run verify
scan-repo-security .
npm run preview -- --port 4173
```

Local preview: `http://127.0.0.1:4173`

## Content

- Migrated public content lives in `src/content/migrated/`.
- Media copied from WordPress lives in `public/media/`.
- Routes are generated from JSON content, not WordPress at runtime.
- Draft/private records stay in the parent migration workspace and are not published by this app.

## Launch Scope

- No CMS for launch.
- No comments for launch.
- Existing public URLs are preserved:
  - `/`
  - `/work/`
  - `/blog/`
  - `/blog/[slug]/`
  - `/portfolio/[slug]/`
  - `/cookie-policy/`

## Verification

`npm run verify` checks expected routes, migrated counts, media references, internal links, removed comment UI, YouTube embeds, and CodePen iframe/fallback output.
