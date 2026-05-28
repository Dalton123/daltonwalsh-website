import mediaMap from '../content/migrated/media-url-map.json';

const PRE_BLOCK_RE = /<pre\b[\s\S]*?<\/pre>/gi;
const SCRIPT_STYLE_RE = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_UI_RE =
  /<(section|div|aside)\b[^>]*(?:id|class)=["'][^"']*(?:comments-area|comment-respond|comment-list|comment-form|wpdcom|wpdiscuz|respond)[^"']*["'][\s\S]*?<\/\1>/gi;
const COMMENT_FORM_RE = /<form\b[^>]*(?:id|class)=["'][^"']*(?:commentform|comment-form)[^"']*["'][\s\S]*?<\/form>/gi;
const COMMENT_SECTION_RE =
  /<section\b[^>]*(?:id|class)=["'][^"']*(?:comments|comments-area)[^"']*["'][\s\S]*?<\/section>/gi;
const COMMENT_LIST_RE = /<ol\b[^>]*class=(["'])[^"']*\bcomment-list\b[^"']*\1[\s\S]*?<\/ol>/gi;
const COMMENT_REPLY_RE = /<div\b[^>]*class=(["'])[^"']*\breply\b[^"']*\1[\s\S]*?<\/div>/gi;
const LOAD_MORE_CONTROL_RE =
  /<(button|a)\b[^>]*(?:id|class|aria-label)=["'][^"']*(?:load-more|load_more|alm-load-more|ajax-load-more)[^"']*["'][\s\S]*?<\/\1>/gi;
const LOAD_MORE_WRAP_RE =
  /<div\b[^>]*(?:id|class)=["'][^"']*(?:load-more-posts|alm-btn-wrap|ajax-load-more)[^"']*["'][\s\S]*?<\/div>/gi;
const WP_UPLOAD_RE = /(?:https?:)?\/\/(?:www\.)?daltonwalsh\.com\/wp-content\/uploads\/[^"'\s<>)]+/gi;

type MediaUrlMap = {
  urls?: Record<string, { publicPath?: string }>;
};

const typedMediaMap = mediaMap as MediaUrlMap;

function withPreservedPreBlocks(input: string, transform: (value: string) => string) {
  const blocks: string[] = [];
  const tokenized = input.replace(PRE_BLOCK_RE, (match) => {
    const index = blocks.push(match) - 1;
    return `___PRE_BLOCK_${index}___`;
  });

  return transform(tokenized).replace(/___PRE_BLOCK_(\d+)___/g, (_, index: string) => blocks[Number(index)] ?? '');
}

function attr(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getAttr(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, 'is'));
  return match?.[2] || '';
}

function getYouTubeId(value: string) {
  const decoded = value.replaceAll('&amp;', '&');
  const match = decoded.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match?.[1] || '';
}

function youtubeIframe(id: string) {
  const src = `https://www.youtube.com/embed/${attr(id)}`;
  return `<div class="responsive-embed responsive-embed--youtube"><iframe src="${src}" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
}

function normalizeYouTubeEmbeds(value: string) {
  let output = value.replace(
    /<iframe\b([^>]*\bsrc=(["'])([^"']*(?:youtube\.com|youtu\.be)[^"']*)\2[^>]*)><\/iframe>/gi,
    (match, attrs: string, _quote: string, src: string) => {
      if (match.includes('responsive-embed')) return match;
      const id = getYouTubeId(src);
      return id ? youtubeIframe(id) : `<div class="responsive-embed responsive-embed--youtube"><iframe ${attrs}></iframe></div>`;
    }
  );

  output = output.replace(
    /<figure\b[^>]*class=(["'])[^"']*(?:wp-block-embed|is-provider-youtube)[^"']*\1[^>]*>[\s\S]*?<\/figure>/gi,
    (match) => {
      const id = getYouTubeId(match);
      return id ? youtubeIframe(id) : match;
    }
  );

  return output.replace(
    /<p>\s*(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^<\s]+|youtu\.be\/[^<\s]+))\s*<\/p>/gi,
    (_match, url: string) => {
      const id = getYouTubeId(url);
      return id ? youtubeIframe(id) : _match;
    }
  );
}

function codePenFallback(url: string, label = 'Open this demo on CodePen') {
  return `<div class="codepen-embed codepen-embed--fallback"><p>Interactive CodePen demo</p><a href="${attr(url)}" rel="noopener noreferrer" target="_blank">${attr(label)}</a></div>`;
}

function codePenIframe(user: string, slug: string) {
  const src = `https://codepen.io/${attr(user)}/embed/${attr(slug)}?default-tab=result`;
  const href = `https://codepen.io/${attr(user)}/pen/${attr(slug)}`;
  return `<div class="codepen-embed"><iframe src="${src}" title="CodePen demo" loading="lazy" allowfullscreen></iframe><p><a href="${href}" rel="noopener noreferrer" target="_blank">Open this demo on CodePen</a></p></div>`;
}

function normalizeCodePenEmbeds(value: string) {
  let output = value.replace(
    /<iframe\b([^>]*\bsrc=(["'])([^"']*codepen\.io[^"']*)\2[^>]*)><\/iframe>/gi,
    (_match, attrs: string) => `<div class="codepen-embed"><iframe ${attrs}></iframe></div>`
  );

  output = output.replace(/<p\b[^>]*class=(["'])[^"']*\bcodepen\b[^"']*\1[^>]*>[\s\S]*?<\/p>/gi, (match) => {
    const user = getAttr(match, 'data-user');
    const slug = getAttr(match, 'data-slug-hash');
    const href = match.match(/https?:\/\/codepen\.io\/[^"'<\s]+/i)?.[0] || '';
    if (user && slug) return codePenIframe(user, slug);
    if (href) return codePenFallback(href);
    return codePenFallback('https://codepen.io/daltonwalsh');
  });

  return output.replace(
    /<p>\s*(https?:\/\/codepen\.io\/[^<\s]+)\s*<\/p>/gi,
    (_match, url: string) => codePenFallback(url)
  );
}

function stripLazyLoadAttributes(value: string) {
  return value
    .replace(/\s\/\s+(srcset|sizes)=/gi, ' $1=')
    .replace(/\sdata-lazyloaded=(["']).*?\1/gi, '')
    .replace(/\sdata-src=(["']).*?\1/gi, '')
    .replace(/\sdata-srcset=(["']).*?\1/gi, '')
    .replace(/\sdata-sizes=(["']).*?\1/gi, '')
    .replace(/\sclass=(["'])([^"']*?)\s(?:lazyload|lazyloaded|litespeed-loaded)\s([^"']*?)\1/gi, (_match, quote, before, after) => {
      const classes = `${before} ${after}`.replace(/\s+/g, ' ').trim();
      return classes ? ` class=${quote}${classes}${quote}` : '';
    });
}

function localMediaPath(value: string) {
  const normalized = value.startsWith('//') ? `https:${value}` : value;
  const secure = normalized
    .replace('http://www.daltonwalsh.com', 'https://daltonwalsh.com')
    .replace('http://daltonwalsh.com', 'https://daltonwalsh.com')
    .replace('https://www.daltonwalsh.com', 'https://daltonwalsh.com');
  const urls = typedMediaMap.urls ?? {};
  return urls[secure]?.publicPath || urls[secure.replace('https://daltonwalsh.com', 'https://www.daltonwalsh.com')]?.publicPath || '';
}

function rewriteWordPressMediaUrls(value: string) {
  return value.replace(WP_UPLOAD_RE, (match) => localMediaPath(match) || match);
}

function stripOuterMain(value: string) {
  return value.replace(/^\s*<main\b[^>]*>/i, '').replace(/<\/main>\s*$/i, '').trim();
}

export function cleanMigratedHtml(input = '') {
  const withoutMain = stripOuterMain(input);

  return withPreservedPreBlocks(withoutMain, (value) =>
    stripLazyLoadAttributes(rewriteWordPressMediaUrls(normalizeCodePenEmbeds(normalizeYouTubeEmbeds(value))))
      .replace(SCRIPT_STYLE_RE, '')
      .replace(COMMENT_SECTION_RE, '')
      .replace(COMMENT_FORM_RE, '')
      .replace(COMMENT_LIST_RE, '')
      .replace(COMMENT_REPLY_RE, '')
      .replace(COMMENT_UI_RE, '')
      .replace(LOAD_MORE_CONTROL_RE, '')
      .replace(LOAD_MORE_WRAP_RE, '')
      .replace(/\s+on[a-z]+=(["']).*?\1/gi, '')
      .replace(/\s+on[a-z]+=[^\s>]+/gi, '')
      .replace(/\s+(?:data-wp-|data-elementor-|data-rocket)[a-z0-9_-]*=(["']).*?\1/gi, '')
      .replace(/\s+(?:data-wp-|data-elementor-|data-rocket)[a-z0-9_-]*=[^\s>]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}
