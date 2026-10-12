import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3 } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { insights, type Insight } from '../data';
import { ApiError, apiGet } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

export function Insights() {
  const [articles, setArticles] = useState<Insight[]>(insights);
  useEffect(() => { apiGet<{ items: Insight[] }>('/api/articles?limit=30').then((data) => setArticles(data.items)).catch(() => {}); }, []);
  usePageMeta('Conteúdos e Insights', 'Artigos e ideias sobre recrutamento, liderança, cultura e gestão de pessoas.', '/conteudos');
  return <main>
    <PageIntro eyebrow="Conteúdos e insights" title={<>Perguntas que abrem<br /><span className="intro-title-accent">novas perspectivas.</span></>} text="Reflexões sobre trabalho, pessoas, liderança e organizações para inspirar conversas com mais intenção." current="Conteúdos" />
    <section className="insights-page section-pad"><div className="container"><div className="insights-page-heading"><span className="eyebrow">PERSPECTIVAS IM PERSONNEL</span><h2>Conhecimento para<br />seguir em movimento.</h2><p>Conteúdos editoriais sobre temas que atravessam o dia a dia de pessoas e negócios.</p></div>{articles.length ? <div className="insights-page-grid">{articles.map((insight, index) => <Link className={`insight-page-card insight-card-${index + 1}`} to={`/conteudos/${insight.slug}`} key={insight.slug}><div className={`insight-art ${insight.image_url ? 'insight-art-photo' : ''}`} aria-hidden={insight.image_url ? undefined : 'true'}>{insight.image_url ? <img src={insight.image_url} alt={insight.image_alt || insight.title} loading="lazy" /> : <><span className="insight-art-label">IM / PERSPECTIVAS</span><span className="insight-art-mark">{String(index + 1).padStart(2, '0')}</span><div className="insight-art-orbit" /></>}</div><div className="insight-card-copy"><div className="insight-meta"><span>{insight.category}</span><span><Clock3 size={13} /> {insight.minutes} min</span></div><h3>{insight.title}</h3><p>{insight.intro}</p><span className="insight-read">Ler conteúdo <ArrowUpRight size={15} /></span></div></Link>)}</div> : <div className="insights-empty insights-empty-page"><span className="eyebrow">NOVAS IDEIAS EM BREVE</span><p>Os próximos conteúdos serão publicados aqui.</p></div>}<div className="editorial-note"><span className="eyebrow">NOTA EDITORIAL</span><p>Os textos são informativos e não substituem orientação profissional específica. Cada organização deve considerar seu próprio contexto ao aplicar essas ideias.</p></div></div></section>
  </main>;
}

export function InsightDetail() {
  const { slug } = useParams();
  const [insight, setInsight] = useState<Insight | null>(() => insights.find((item) => item.slug === slug) || null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (!slug) { setResolved(true); return; }
    setInsight(insights.find((item) => item.slug === slug) || null);
    setResolved(false);
    let cancelled = false;
    apiGet<{ article: Insight }>(`/api/articles/${encodeURIComponent(slug)}`).then((data) => { if (!cancelled) setInsight(data.article); }).catch((reason) => { if (!cancelled && reason instanceof ApiError && reason.status === 404) setInsight(null); }).finally(() => { if (!cancelled) setResolved(true); });
    return () => { cancelled = true; };
  }, [slug]);
  usePageMeta(insight?.title || 'Conteúdo', insight?.intro || 'Artigo da IM Personnel sobre pessoas, trabalho e organizações.', slug ? `/conteudos/${slug}` : '/conteudos');
  useEffect(() => {
    if (!insight) return;
    const origin = import.meta.env.VITE_SITE_URL || 'https://impersonnel.com.br';
    const script = document.createElement('script');
    script.type = 'application/ld+json'; script.id = 'article-structured-data';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: insight.title, description: insight.intro, articleSection: insight.category,
      articleBody: insight.body.join(' '), mainEntityOfPage: `${origin}/conteudos/${insight.slug}`,
      ...(insight.image_url ? { image: `${origin}${insight.image_url}` } : {}),
      ...(insight.created_at ? { datePublished: insight.created_at } : {}), ...(insight.updated_at ? { dateModified: insight.updated_at } : {}),
      author: { '@type': 'Organization', name: 'IM Personnel Consultoria' }, publisher: { '@type': 'Organization', name: 'IM Personnel Consultoria', logo: { '@type': 'ImageObject', url: `${origin}/favicon.svg` } },
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [insight]);
  if (!insight) return resolved ? <Navigate to="/404" replace /> : <main className="loading-page"><span className="loading-spinner" />Carregando conteúdo…</main>;
  return <main>
    <PageIntro eyebrow={insight.category} title={insight.title} text={insight.intro} current="Conteúdo" compact />
    <article className="insight-article-page section-pad"><div className="insight-article-layout"><aside className="insight-article-aside"><Link to="/conteudos" className="back-link"><ArrowLeft size={15} /> Todos os conteúdos</Link><div className="insight-article-info"><span className="eyebrow">IM / PERSPECTIVAS</span><span><Clock3 size={14} /> {insight.minutes} min de leitura</span><span>{insight.category}</span></div></aside><div className="insight-article-content">{insight.image_url && <figure className="insight-article-hero"><img src={insight.image_url} alt={insight.image_alt || insight.title} />{insight.image_alt && <figcaption>{insight.image_alt}</figcaption>}</figure>}<p className="insight-article-lede">{insight.intro}</p>{insight.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}<div className="article-author-note"><span>IM</span><div><strong>IM Personnel</strong><small>Conteúdo editorial</small></div></div><div className="article-next"><span className="eyebrow">SEGUIR A CONVERSA</span><h3>Veja mais ideias sobre pessoas e negócios.</h3><Link className="text-link" to="/conteudos">Explorar conteúdos <ArrowRight size={16} /></Link></div></div></div></article>
  </main>;
}
