import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, Clock3, Copy, MapPin, Share2, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, formatDate, type Job } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

export function JobDetail() {
  const { slug } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiGet<{ job: Job }>(`/api/jobs/${encodeURIComponent(slug)}`).then((data) => { if (!cancelled) setJob(data.job); }).catch((reason: Error) => { if (!cancelled) setError(reason.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);
  usePageMeta(job?.title || 'Detalhes da oportunidade', job?.summary || 'Conheça os detalhes da oportunidade publicada pela IM Personnel.', slug ? `/vagas/${slug}` : '/vagas', !loading && !job);
  useEffect(() => {
    if (!job?.hiring_organization) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'job-structured-data';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting', title: job.title, description: [job.summary, ...job.responsibilities, ...job.requirements].join('\n'),
      datePosted: job.created_at, ...(job.expires_at ? { validThrough: `${job.expires_at}T23:59:59-03:00` } : {}),
      ...(job.employment_type === 'CLT' ? { employmentType: 'FULL_TIME' } : job.employment_type === 'PJ' ? { employmentType: 'CONTRACTOR' } : job.employment_type === 'Temporário' ? { employmentType: 'TEMPORARY' } : job.employment_type === 'Estágio' ? { employmentType: 'INTERN' } : {}),
      hiringOrganization: { '@type': 'Organization', name: job.hiring_organization },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.city, addressRegion: job.state, addressCountry: 'BR' } },
      jobLocationType: job.modality === 'Remoto' ? 'TELECOMMUTE' : undefined,
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, [job]);

  async function shareJob() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: job?.title, text: `Oportunidade: ${job?.title}`, url });
      else { await navigator.clipboard.writeText(url); setShareMessage('Link copiado.'); setTimeout(() => setShareMessage(''), 2500); }
    } catch (error) { if (error instanceof Error && error.name !== 'AbortError') { setShareMessage('Não foi possível compartilhar agora.'); setTimeout(() => setShareMessage(''), 2500); } }
  }

  if (loading) return <main className="loading-page"><span className="loading-spinner" />Carregando oportunidade…</main>;
  if (!job) return <main><PageIntro eyebrow="Oportunidade" title="Esta vaga não está disponível." text={error || 'A oportunidade pode ter sido encerrada ou não está mais publicada.'} current="Vaga indisponível" /><div className="container unavailable-actions"><Link to="/vagas" className="button button-dark"><ArrowLeft size={16} /> Voltar às vagas</Link><Link to="/banco-de-talentos" className="text-link">Cadastrar currículo <ArrowUpRight size={16} /></Link></div></main>;
  return <main>
    <PageIntro eyebrow="Oportunidade IM Personnel" title={job.title} text={job.summary} current="Detalhes da vaga" compact />
    <section className="job-detail-page section-pad"><div className="container job-detail-layout">
      <div className="job-detail-main">
        <Link to="/vagas" className="back-link"><ArrowLeft size={15} /> Todas as oportunidades</Link>
        <div className="job-detail-head"><span className="job-area-tag">{job.area}</span><span className="job-id">ID {job.id.slice(0, 8).toUpperCase()}</span></div>
        <h1>{job.title}</h1><p className="job-detail-summary">{job.summary}</p>{job.hiring_organization && <p className="job-hiring-org">Contratante: <strong>{job.hiring_organization}</strong></p>}
        <div className="job-detail-meta"><span><MapPin size={17} />{job.city}, {job.state}</span><span><BriefcaseBusiness size={17} />{job.modality}</span><span><Clock3 size={17} />{job.employment_type}</span><span><CalendarDays size={17} />Publicada em {formatDate(job.created_at)}</span></div>
        <div className="job-detail-divider" />
        {job.responsibilities.length > 0 && <section className="job-description-section"><span className="eyebrow">01 / SOBRE A POSIÇÃO</span><h2>Responsabilidades</h2><ul className="check-list">{job.responsibilities.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></section>}
        {job.requirements.length > 0 && <section className="job-description-section"><span className="eyebrow">02 / O QUE BUSCAMOS</span><h2>Requisitos</h2><ul className="check-list">{job.requirements.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></section>}
        {job.differentiators.length > 0 && <section className="job-description-section"><span className="eyebrow">03 / UM DIFERENCIAL</span><h2>Será um diferencial</h2><ul className="check-list">{job.differentiators.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></section>}
        {job.benefits.length > 0 && <section className="job-description-section"><span className="eyebrow">04 / BENEFÍCIOS</span><h2>Benefícios informados</h2><ul className="check-list">{job.benefits.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></section>}
        <div className="job-privacy-note"><ShieldCheck size={19} /><p>As informações da sua candidatura serão tratadas conforme o <Link to="/privacidade">Aviso de Privacidade</Link> e utilizadas para conduzir este processo seletivo.</p></div>
      </div>
      <aside className="job-detail-sidebar"><div className="apply-card"><span className="eyebrow">SEU PRÓXIMO PASSO</span><h2>Candidate-se a esta oportunidade.</h2><p>Compartilhe seu perfil profissional com a equipe de recrutamento.</p><Link to={`/vagas/${job.slug}/candidatar`} className="button button-primary apply-button">Candidatar-se <ArrowUpRight size={17} /></Link><button className="share-job-button" type="button" onClick={shareJob}><Share2 size={16} /> Compartilhar oportunidade <Copy size={13} /></button>{shareMessage && <span className="form-hint" role="status">{shareMessage}</span>}<div className="apply-card-foot"><span><MapPin size={15} />{job.city}, {job.state}</span><span><Clock3 size={15} />{job.modality} · {job.employment_type}</span>{job.expires_at && <span><CalendarDays size={15} />Encerra em {formatDate(job.expires_at)}</span>}</div></div><div className="career-sidebar-help"><span className="small-index">AINDA NÃO É A SUA VAGA?</span><p>Cadastre seu currículo no banco de talentos para futuras oportunidades.</p><Link to="/banco-de-talentos">Apresentar meu perfil <ArrowUpRight size={15} /></Link></div></aside>
    </div></section>
  </main>;
}
