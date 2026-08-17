import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const contentRoot = path.join(root, 'src/content/migrated');
const reportPath = path.join(root, 'reports/launch-readiness-report.md');
const siteUrl = new URL('https://daltonwalsh.com');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function listJson(dir) {
  const entries = await fs.readdir(dir);
  return entries.filter((entry) => entry.endsWith('.json')).sort();
}

function routeFile(route) {
  if (route === '/') return path.join(dist, 'index.html');
  return path.join(dist, route.replace(/^\/|\/$/g, ''), 'index.html');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readGeneratedHtmlFiles(dir = dist) {
  const output = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await readGeneratedHtmlFiles(full)));
    } else if (entry.name.endsWith('.html')) {
      output.push({ file: full, html: await fs.readFile(full, 'utf8') });
    }
  }
  return output;
}

function extractAttrs(html, attr) {
  const values = [];
  const re = new RegExp(`\\s${attr}=(["'])(.*?)\\1`, 'gi');
  for (const match of html.matchAll(re)) values.push(match[2]);
  return values;
}

function stripCodeSamples(html) {
  return html.replace(/<pre\b[\s\S]*?<\/pre>/gi, '').replace(/<code\b[\s\S]*?<\/code>/gi, '');
}

function normalizeInternalPath(href) {
  if (!href || href.startsWith('#')) return '';
  if (/^(mailto:|tel:)/i.test(href)) return '';

  let url;
  try {
    url = new URL(href, siteUrl);
  } catch {
    return '';
  }

  if (!['http:', 'https:'].includes(url.protocol)) return '';
  if (url.hostname.replace(/^www\./i, '') !== siteUrl.hostname) return '';
  return url.pathname || '/';
}

function isCanonicalInternalPath(href) {
  const internalPath = normalizeInternalPath(href);
  return !internalPath || internalPath === '/' || internalPath.endsWith('/') || Boolean(path.extname(internalPath));
}

async function internalTargetExists(href) {
  if (href === '/') return exists(path.join(dist, 'index.html'));
  if (href === '/404/') return exists(path.join(dist, '404.html'));
  if (href.startsWith('/media/') || href.startsWith('/assets/')) {
    return exists(path.join(dist, href.slice(1)));
  }
  if (path.extname(href)) return exists(path.join(dist, href.slice(1)));
  return exists(routeFile(href));
}

function sourceHas(items, pattern) {
  return items.some((item) => pattern.test(item.bodyHtml || ''));
}

function generatedHas(files, pattern) {
  return files.some(({ html }) => pattern.test(html));
}

async function main() {
  const pageFiles = await listJson(path.join(contentRoot, 'pages'));
  const blogFiles = await listJson(path.join(contentRoot, 'blog'));
  const portfolioFiles = await listJson(path.join(contentRoot, 'portfolio'));

  const pages = await Promise.all(pageFiles.map((file) => readJson(path.join(contentRoot, 'pages', file))));
  const blog = await Promise.all(blogFiles.map((file) => readJson(path.join(contentRoot, 'blog', file))));
  const portfolio = await Promise.all(
    portfolioFiles.map((file) => readJson(path.join(contentRoot, 'portfolio', file)))
  );
  const allItems = [...pages, ...blog, ...portfolio];
  const generatedFiles = await readGeneratedHtmlFiles();
  const generatedMarkupFiles = generatedFiles.map(({ file, html }) => ({ file, html: stripCodeSamples(html) }));
  const allGeneratedHtml = generatedMarkupFiles.map(({ html }) => html).join('\n');

  const checks = [];
  const failures = [];
  const warn = [];

  function check(name, passed, detail) {
    checks.push({ name, status: passed ? 'pass' : 'fail', detail });
    if (!passed) failures.push(`${name}: ${detail}`);
  }

  check('pages count', pages.length === 4, `${pages.length} page JSON files`);
  check('blog count', blog.length === 20, `${blog.length} blog JSON files`);
  check('portfolio count', portfolio.length === 11, `${portfolio.length} portfolio JSON files`);

  const requiredRoutes = [
    '/',
    '/work/',
    '/blog/',
    '/cookie-policy/',
    '/404/',
    ...blog.map((item) => item.route),
    ...portfolio.map((item) => item.route),
  ];

  const missingRoutes = [];
  for (const route of requiredRoutes) {
    const file = route === '/404/' ? path.join(dist, '404.html') : routeFile(route);
    if (!(await exists(file))) missingRoutes.push(route);
  }
  check('expected routes', missingRoutes.length === 0, missingRoutes.length ? missingRoutes.join(', ') : 'all expected routes exist');

  const mediaRefs = new Set();
  const brokenMedia = [];
  const brokenLinks = [];
  const nonCanonicalLinks = [];
  for (const { file, html } of generatedMarkupFiles) {
    for (const src of [...extractAttrs(html, 'src'), ...extractAttrs(html, 'srcset')]) {
      const refs = src
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter((value) => value.startsWith('/media/'));
      for (const ref of refs) mediaRefs.add(ref);
    }

    for (const href of extractAttrs(html, 'href')) {
      const normalized = normalizeInternalPath(href);
      if (!normalized) continue;
      if (!isCanonicalInternalPath(href)) {
        nonCanonicalLinks.push(`${path.relative(dist, file)} -> ${href}`);
      }
      if (!(await internalTargetExists(normalized))) {
        brokenLinks.push(`${path.relative(dist, file)} -> ${href}`);
      }
    }
  }

  for (const ref of mediaRefs) {
    if (!(await exists(path.join(dist, ref.slice(1))))) brokenMedia.push(ref);
  }

  check('images load', brokenMedia.length === 0, brokenMedia.length ? brokenMedia.slice(0, 10).join(', ') : `${mediaRefs.size} generated media references exist`);
  check('internal links', brokenLinks.length === 0, brokenLinks.length ? brokenLinks.slice(0, 10).join(', ') : 'no broken internal links found');
  check(
    'canonical internal links',
    nonCanonicalLinks.length === 0,
    nonCanonicalLinks.length ? nonCanonicalLinks.slice(0, 10).join(', ') : 'all internal route links use trailing slashes'
  );

  const commentUiPattern = /(?:comments-area|comment-respond|comment-form|wpdcom|wpdiscuz|id=["']comments["'])/i;
  check('comment UI removed', !commentUiPattern.test(allGeneratedHtml), 'no WordPress comment UI markers in generated HTML');

  const loadMoreControlPattern =
    /<(?:button|a|div)\b(?=[^>]*(?:id|class|aria-label)=["'][^"']*(?:load-more|load_more|ajax-load-more|alm-load-more)[^"']*["'])[^>]*>/i;
  check('load-more controls removed', !loadMoreControlPattern.test(allGeneratedHtml), 'no generated load-more control markup');

  const hasSourceYouTube = sourceHas(allItems, /(?:youtube\.com|youtu\.be)/i);
  const hasGeneratedYouTube = generatedHas(generatedMarkupFiles, /<iframe[^>]+youtube\.com\/embed/i);
  check(
    'YouTube embeds',
    !hasSourceYouTube || hasGeneratedYouTube,
    hasSourceYouTube ? 'YouTube source content renders as iframe embeds' : 'no YouTube embeds in migrated source'
  );

  const hasSourceCodePen = sourceHas(allItems, /codepen\.io|\bcodepen\b/i);
  const hasGeneratedCodePen = generatedHas(generatedMarkupFiles, /codepen-embed|codepen\.io/i);
  check(
    'CodePen embeds',
    !hasSourceCodePen || hasGeneratedCodePen,
    hasSourceCodePen ? 'CodePen source content renders iframe or fallback links' : 'no CodePen embeds in migrated source'
  );

  if (/wp-content\/uploads/i.test(allGeneratedHtml)) {
    warn.push('Generated HTML still contains at least one wp-content/uploads reference. Review OG/meta/content output before launch.');
  }

  const codeBlockCount = allItems.reduce((sum, item) => sum + (item.codeBlockCount || 0), 0);
  check('code blocks preserved', codeBlockCount >= 185, `${codeBlockCount} code blocks recorded in migrated JSON`);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const report = [
    '# Launch Readiness Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Status',
    '',
    failures.length === 0 ? 'Astro build output passes the launch-readiness checks.' : 'Astro build output has blockers to resolve before launch.',
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |',
    ...checks.map((item) => `| ${item.name} | ${item.status} | ${item.detail.replaceAll('|', '\\|')} |`),
    '',
    '## Remaining Blockers',
    '',
    failures.length ? failures.map((item) => `- ${item}`).join('\n') : '- None found by automated verification.',
    '',
    '## Manual Review Before DNS',
    '',
    '- Click through high-value tutorial posts and portfolio galleries in the deployed preview.',
    '- Confirm final hosting provider settings for trailing slashes, 404 handling, sitemap, and cache headers.',
    '- Run one external crawl against the deployed preview before switching DNS.',
    warn.length ? ['', '## Warnings', '', ...warn.map((item) => `- ${item}`)].join('\n') : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  await fs.writeFile(reportPath, `${report}\n`);

  console.log(JSON.stringify({ failures: failures.length, warnings: warn.length, checks }, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
