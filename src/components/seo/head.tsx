import { useEffect } from 'react';

const SITE_CONFIG = {
  BASE_URL: 'https://parsify.dev',
  SITE_NAME: 'Parsify',
  DEFAULT_LOCALE: 'en_US',
  TWITTER_HANDLE: '@parsifydev',
  DEFAULT_OG_IMAGE: 'https://parsify.dev/opengraph-image.png',
  DEFAULT_OG_IMAGE_WIDTH: 1200,
  DEFAULT_OG_IMAGE_HEIGHT: 630,
};

interface Breadcrumb {
  name: string;
  url: string;
}

interface HeadProps {
  title: string;
  description: string;
  path: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  appendSiteName?: boolean;
  breadcrumbs?: Breadcrumb[];
  extraJsonLd?: object;
}

export function useDocumentHead({
  title,
  description,
  path,
  ogType = 'website',
  ogImage = SITE_CONFIG.DEFAULT_OG_IMAGE,
  appendSiteName = true,
  breadcrumbs,
  extraJsonLd,
}: HeadProps) {
  const fullTitle =
    appendSiteName && !title.includes('Parsify.dev') ? `${title} | Parsify.dev` : title;
  const url = new URL(path, SITE_CONFIG.BASE_URL).toString();

  useEffect(() => {
    document.title = fullTitle;

    setMetaTag('name', 'description', description);
    setLink('canonical', url);
    setMetaTag('property', 'og:title', fullTitle);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', ogType);
    setMetaTag('property', 'og:url', url);
    setMetaTag('property', 'og:site_name', SITE_CONFIG.SITE_NAME);
    setMetaTag('property', 'og:locale', SITE_CONFIG.DEFAULT_LOCALE);
    setMetaTag('property', 'og:image', ogImage);
    setMetaTag('property', 'og:image:width', String(SITE_CONFIG.DEFAULT_OG_IMAGE_WIDTH));
    setMetaTag('property', 'og:image:height', String(SITE_CONFIG.DEFAULT_OG_IMAGE_HEIGHT));
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:site', SITE_CONFIG.TWITTER_HANDLE);
    setMetaTag('name', 'twitter:title', fullTitle);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:image', ogImage);

    const jsonLdScripts: object[] = [];

    if (breadcrumbs && breadcrumbs.length > 0) {
      jsonLdScripts.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((crumb, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: crumb.name,
          item: new URL(crumb.url, SITE_CONFIG.BASE_URL).toString(),
        })),
      });
    }

    if (extraJsonLd) {
      jsonLdScripts.push(extraJsonLd);
    }

    const existingScripts = document.querySelectorAll('script[data-seo-jsonld]');
    for (const s of existingScripts) s.remove();

    for (const jsonLd of jsonLdScripts) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', '');
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [fullTitle, description, url, ogType, ogImage, breadcrumbs, extraJsonLd]);
}

function setMetaTag(attr: string, value: string, content: string) {
  const selector = attr === 'property' ? `meta[property="${value}"]` : `meta[name="${value}"]`;
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}
