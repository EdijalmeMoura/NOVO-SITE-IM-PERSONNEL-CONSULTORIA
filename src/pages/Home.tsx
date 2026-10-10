import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Compass, MoveUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { services, methodology, insights, type Insight } from '../data';
import { apiGet, type Job } from '../lib/api';
import { usePageMeta } from '../hooks/usePageMeta';
import { SectionHeading } from '../components/SectionHeading';
import { ServiceCard } from '../components/ServiceCard';
import { JobCard } from '../components/JobCard';

export function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [publicInsights, setPublicInsights] = useState<Insight[]>(insights);
  const [loading, setLoading] = useState(true);
  usePageMeta('Pessoas certas transformam negócios', 'Conectamos talentos, lideranças e organizações por meio de soluções estratégicas em recrutamento, seleção e gestão de pessoas.', '/');
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'organization-structured-data';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Organization', name: 'IM Personnel Consultoria', url: import.meta.env.VITE_SITE_URL || 'https://impersonnel.com.br',
      logo: `${import.meta.env.VITE_SITE_URL || 'https://impersonnel.com.br'}/favicon.svg`, description: 'Consultoria de recrutamento e seleção e soluções estratégicas em Recursos Humanos.',
      sameAs: ['https://br.linkedin.com/company/impersonnel-consultoria'], areaServed: { '@type': 'Place', name: 'Recife, Pernambuco, Brasil' },
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, []);
  useEffect(() => {
    apiGet<{ items: Insight[] }>('/api/articles?limit=3').then((data) => setPublicInsights(data.items)).catch(() => {});
  }, []);
  useEffect(() => {
    apiGet<{ items: Job[] }>('/api/jobs?per_page=3')
      .then((data) => setJobs(data.items))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="home-page">
      <section className="hero">
        <img className="hero-image" src="/images/hero-team.jpg" alt="Lideranças e profissionais colaborando em uma conversa de estratégia" fetchPriority="high" />
        <div className="hero-grain" aria-hidden="true" />
        <div className="container hero-content">
          <div className="hero-eyebrow"><span className="hero-pulse" /> CONSULTORIA DE PESSOAS & NEGÓCIOS <i /> RECIFE, PE</div>
          <h1>Pessoas certas<br /><span>transformam</span><br />negócios.</h1>
          <p className="hero-text">Conectamos talentos, lideranças e organizações por meio de soluções estratégicas em recrutamento, seleção e gestão de pessoas.</p>
          <div className="hero-actions">
            <Link to="/solucoes" className="button button-primary button-hero">Encontre sua solução <ArrowUpRight size={17} /></Link>
            <Link to="/vagas" className="hero-secondary-link">Explore oportunidades <ArrowRight size={16} /></Link>
          </div>
          <div className="hero-bottom-note"><span>01 — 06</span><div className="hero-bottom-line" /><span>Pessoas no centro. Negócios em movimento.</span></div>
        </div>
        <div className="hero-side-label"><span>IM PERSONNEL</span><span>HUMAN CAPITAL / RECIFE</span></div>
        <a className="hero-scroll" href="#posicionamento" aria-label="Rolar para conhecer a IM Personnel"><ArrowDown size={16} /></a>
      </section>

      <section className="positioning-section section-pad" id="posicionamento">
        <div className="container positioning-grid">
          <div className="positioning-label"><span className="small-index">01 / NOSSA VISÃO</span><span className="label-rule" /></div>
          <div className="positioning-copy">
            <h2>Recrutar é mais do que <span>preencher uma vaga.</span></h2>
            <p>Cada contratação representa uma decisão importante para o futuro de uma organização. Por isso, buscamos compreender os desafios, a cultura e os objetivos de cada negócio para conectar empresas aos profissionais mais alinhados às suas necessidades.</p>
            <Link className="text-link" to="/sobre">Conheça nossa abordagem <ArrowUpRight size={17} /></Link>
          </div>
          <div className="positioning-aside">
            <div className="aside-orbit"><div className="orbit-core"><Compass size={28} strokeWidth={1.25} /></div><span className="orbit-point" /></div>
            <span>Escuta atenta.<br />Escolhas com intenção.</span>
          </div>
        </div>
      </section>

      <section className="audience-section">
        <div className="container audience-grid">
          <article className="audience-card audience-business">
            <div className="audience-card-top"><span className="audience-index">01 / PARA EMPRESAS</span><span className="audience-motif" aria-hidden="true">B</span></div>
            <div className="audience-card-content"><span className="audience-kicker">O próximo passo começa com as pessoas</span><h2>Encontre os profissionais que seu negócio precisa.</h2><p>Soluções personalizadas para identificar talentos, fortalecer equipes e apoiar decisões estratégicas de contratação.</p><Link to="/solicitar-proposta" className="button button-white">Falar com um especialista <ArrowUpRight size={17} /></Link></div>
            <div className="audience-card-line" aria-hidden="true" />
          </article>
          <article className="audience-card audience-candidate">
            <div className="audience-card-top"><span className="audience-index">02 / PARA CANDIDATOS</span><span className="audience-motif" aria-hidden="true">C</span></div>
            <div className="audience-card-content"><span className="audience-kicker">Seu talento tem espaço para crescer</span><h2>Sua próxima oportunidade pode começar aqui.</h2><p>Conheça as vagas disponíveis e apresente seu perfil profissional para futuras seleções.</p><Link to="/vagas" className="button button-outline-white">Ver vagas disponíveis <ArrowUpRight size={17} /></Link></div>
            <div className="audience-card-line" aria-hidden="true" />
          </article>
        </div>
      </section>

      <section className="services-section section-pad">
        <div className="container">
          <div className="services-header"><SectionHeading eyebrow="02 / COMO PODEMOS APOIAR" title="Soluções pensadas para o seu momento." text="Da busca de talentos à organização de práticas de gestão, construímos o escopo a partir da realidade de cada negócio." /><Link to="/solucoes" className="text-link services-all">Todas as soluções <ArrowUpRight size={17} /></Link></div>
          <div className="services-grid">{services.map((service, index) => <ServiceCard service={service} key={service.slug} index={index} />)}</div>
        </div>
      </section>

      <section className="method-section section-pad">
        <div className="container">
          <div className="method-heading"><div><span className="eyebrow eyebrow-light">03 / UMA CONVERSA, UM CAMINHO</span><h2>Estratégia que começa<br />com <em>escuta.</em></h2></div><p>Um processo estruturado, com espaço para compreender nuances e ajustar os próximos passos. As etapas e o escopo são alinhados com cada organização.</p></div>
          <div className="method-line" aria-hidden="true" />
          <div className="method-steps">{methodology.map((step, index) => <article className="method-step" key={step.number}><span className="method-number">{step.number}<i /></span><div className="method-step-content"><span className="method-micro">ETAPA {String(index + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.text}</p></div></article>)}</div>
          <div className="method-footnote"><span>* Fluxo ilustrativo, sujeito à validação e adaptação pela IM Personnel.</span><Link to="/sobre">Nossa forma de trabalhar <ArrowRight size={15} /></Link></div>
        </div>
      </section>

      <section className="jobs-section section-pad">
        <div className="container">
          <div className="jobs-heading"><SectionHeading eyebrow="04 / OPORTUNIDADES" title="Um próximo capítulo começa com um encontro." text="Explore as posições atualmente publicadas pela IM Personnel." /><Link className="text-link" to="/vagas">Ver todas as vagas <ArrowUpRight size={17} /></Link></div>
          {loading ? <div className="job-grid">{[1, 2, 3].map((i) => <div className="job-skeleton" key={i}><span /><span /><span /></div>)}</div> : jobs.length > 0 ? <div className="job-grid">{jobs.map((job, index) => <JobCard key={job.id} job={job} featured={job.featured || index === 0} />)}</div> : <div className="jobs-empty"><div className="empty-orbit"><MoveUpRight size={20} /></div><div><span className="eyebrow">NOVOS ENCONTROS EM BREVE</span><h3>Nenhuma oportunidade publicada agora.</h3><p>As vagas são atualizadas por aqui. Enquanto isso, cadastre seu perfil para futuras oportunidades.</p><Link className="text-link" to="/curriculo">Apresentar meu perfil <ArrowRight size={16} /></Link></div></div>}
        </div>
      </section>

      <section className="insights-section section-pad">
        <div className="container">
          <div className="insights-heading"><SectionHeading eyebrow="05 / CONHECIMENTO EM MOVIMENTO" title="Ideias para pensar o trabalho de outro jeito." text="Conversas sobre pessoas, liderança e organizações — com espaço para novas perspectivas." /><Link className="text-link" to="/conteudos">Ver todos os conteúdos <ArrowUpRight size={17} /></Link></div>
          {publicInsights.length ? <div className="insights-grid">{publicInsights.map((insight, index) => <Link className={`insight-card insight-card-${index + 1}`} to={`/conteudos/${insight.slug}`} key={insight.slug}><div className="insight-art" aria-hidden="true"><span className="insight-art-label">IM / THINKING</span><span className="insight-art-mark">{String(index + 1).padStart(2, '0')}</span><div className="insight-art-orbit" /></div><div className="insight-card-copy"><div className="insight-meta"><span>{insight.category}</span><span>{insight.minutes} min de leitura</span></div><h3>{insight.title}</h3><span className="insight-read">Ler conteúdo <ArrowUpRight size={15} /></span></div></Link>)}</div> : <div className="insights-empty"><span className="eyebrow">NOVAS IDEIAS EM BREVE</span><p>Conteúdos e perspectivas serão publicados por aqui.</p></div>}
        </div>
      </section>

      <section className="home-cta-section">
        <div className="container home-cta-inner">
          <div className="home-cta-copy"><span className="eyebrow eyebrow-light">PESSOAS CERTAS, NO MOMENTO CERTO</span><h2>Vamos encontrar a próxima peça-chave do seu time?</h2><p>Conte à IM Personnel sobre o seu desafio de contratação e descubra como podemos apoiar sua empresa.</p><Link to="/solicitar-proposta" className="button button-primary button-cta">Solicitar uma conversa <ArrowUpRight size={17} /></Link></div>
          <div className="home-cta-art" aria-hidden="true"><div className="cta-circle cta-circle-one" /><div className="cta-circle cta-circle-two" /><div className="cta-cross">+</div><span className="cta-art-label">HUMAN CONNECTION / 01</span><div className="cta-art-core"><Check size={28} /></div></div>
        </div>
      </section>
    </main>
  );
}
