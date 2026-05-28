import mediaMap from '../content/migrated/media-url-map.json';

export type SeoMeta = {
  title?: string;
  description?: string;
  canonical?: string;
  openGraphImage?: string;
};

export type MigratedItem = {
  contentType: 'pages' | 'blog' | 'portfolio';
  wordpressId?: number;
  title: string;
  slug: string;
  route: string;
  sourceUrl?: string;
  status?: string;
  date?: string;
  modified?: string;
  excerpt?: string;
  featuredImage?: string;
  seo?: SeoMeta;
  bodySource?: string;
  sourceHtmlPath?: string;
  needsReview?: boolean;
  codeBlockCount?: number;
  imageCount?: number;
  localMediaReferences?: string[];
  bodyHtml?: string;
};

type MediaUrlMap = {
  urls?: Record<string, { publicPath?: string }>;
};

const pageModules = import.meta.glob('../content/migrated/pages/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, MigratedItem>;

const blogModules = import.meta.glob('../content/migrated/blog/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, MigratedItem>;

const portfolioModules = import.meta.glob('../content/migrated/portfolio/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, MigratedItem>;

const typedMediaMap = mediaMap as MediaUrlMap;

export const SITE_NAME = 'Dalton Walsh';
export const SITE_URL = 'https://daltonwalsh.com';
export const DEFAULT_DESCRIPTION =
  'Frontend developer portfolio and web development blog by Dalton Walsh.';

function values(modules: Record<string, MigratedItem>) {
  return Object.values(modules).filter((item) => item.status !== 'private');
}

function parseDate(value?: string) {
  if (!value) return 0;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function getPages() {
  return values(pageModules).sort((a, b) => a.route.localeCompare(b.route));
}

export function getBlogPosts() {
  return values(blogModules).sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

export function getPortfolioItems() {
  return values(portfolioModules).sort((a, b) => parseDate(b.date) - parseDate(a.date));
}

export function getPage(slug: string) {
  return getPages().find((page) => page.slug === slug);
}

export function getBlogPost(slug: string) {
  return getBlogPosts().find((post) => post.slug === slug);
}

export function getPortfolioItem(slug: string) {
  return getPortfolioItems().find((item) => item.slug === slug);
}

export function formatDate(value?: string) {
  if (!value) return '';
  const parsed = parseDate(value);
  if (!parsed) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(parsed));
}

export function toLocalMediaPath(url?: string) {
  if (!url) return '';
  const urls = typedMediaMap.urls ?? {};
  const candidates = [
    url,
    url.replace('https://www.daltonwalsh.com', 'https://daltonwalsh.com'),
    url.replace('https://daltonwalsh.com', 'https://www.daltonwalsh.com'),
    url.replace('http://daltonwalsh.com', 'https://daltonwalsh.com'),
    url.replace('http://www.daltonwalsh.com', 'https://daltonwalsh.com'),
  ];

  for (const candidate of candidates) {
    const mapped = urls[candidate]?.publicPath;
    if (mapped) return mapped;
  }

  return url.startsWith('/media/') ? url : '';
}

export function imageForItem(item: MigratedItem) {
  return toLocalMediaPath(item.featuredImage) || item.localMediaReferences?.[0] || '';
}

export function descriptionForItem(item?: MigratedItem) {
  return item?.seo?.description || item?.excerpt || DEFAULT_DESCRIPTION;
}

export function titleForItem(item?: MigratedItem, fallback = SITE_NAME) {
  const baseTitle = item?.title || fallback;
  let title = item?.seo?.title || baseTitle;
  title = title
    .replaceAll('%title%', baseTitle)
    .replaceAll('%sitename%', SITE_NAME)
    .replaceAll('%sitedesc%', 'Front End / WordPress developer')
    .replaceAll('%sep%', '-')
    .replaceAll('%page%', '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) return `${baseTitle} - ${SITE_NAME}`;
  return title.includes(SITE_NAME) ? title : `${title} - ${SITE_NAME}`;
}

export function canonicalForRoute(route = '/') {
  return new URL(route, SITE_URL).toString();
}

export function ogImageForItem(item?: MigratedItem) {
  const image = item ? imageForItem(item) : '';
  return image ? new URL(image, SITE_URL).toString() : undefined;
}
