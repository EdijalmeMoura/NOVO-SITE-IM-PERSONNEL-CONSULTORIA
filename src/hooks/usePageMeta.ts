import { useEffect } from 'react';

const ORIGIN = import.meta.env.VITE_SITE_URL || 'https://impersonnel.com.br';
function setMeta(name: string, content: string, property = false) {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let meta = document.querySelector<HTMLMetaElement>(selector);
  if (!meta) { meta = document.createElement('meta'); if (property) meta.setAttribute('property', name); else meta.name = name; document.head.appendChild(meta); }
  meta.content = content;
}
export function usePageMeta(title: string, description: string, path?: string, noindex = false) {
  useEffect(() => {
    const fullTitle = `${title} | IM Personnel`;
    document.title = fullTitle;
    setMeta('description', description);
    setMeta('og:title', fullTitle, true);
    setMeta('og:description', description, true);
    setMeta('og:url', `${ORIGIN}${path || window.location.pathname}`, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow');
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = `${ORIGIN}${path || window.location.pathname}`;
    return () => { document.title = 'IM Personnel | Pessoas certas transformam negócios'; };
  }, [title, description, path, noindex]);
}
