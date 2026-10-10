import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { services } from '../data';
import { PageIntro } from '../components/PageIntro';
import { ServiceIcon } from '../components/ServiceIcon';
import { usePageMeta } from '../hooks/usePageMeta';

export function ServiceDetail() {
  const { slug } = useParams();
  const service = services.find((item) => item.slug === slug);
  usePageMeta(service?.title || 'Solução', service ? `${service.intro.slice(0, 145)}...` : 'Soluções de Recursos Humanos da IM Personnel.', slug ? `/servicos/${slug}` : '/solucoes', !service);
  if (!service) return <Navigate to="/404" replace />;
  const contact = `/solicitar-proposta?servico=${encodeURIComponent(service.title)}`;
  return <main>
    <PageIntro eyebrow={service.eyebrow} title={service.title} text={service.intro} current={service.title} />
    <section className="service-detail-intro section-pad"><div className="container service-detail-grid">
      <div className="service-detail-symbol"><ServiceIcon service={service} size={34} /><span>IM / SOLUÇÕES</span></div>
      <div className="service-detail-copy"><span className="eyebrow">O DESAFIO QUE NOS MOVE</span><h2>{service.challenge}</h2><p>{service.solution}</p><Link className="text-link" to={contact}>Conte sobre sua necessidade <ArrowUpRight size={17} /></Link></div>
    </div></section>
    <section className="service-benefits"><div className="container service-benefits-grid"><div className="service-benefits-heading"><span className="eyebrow eyebrow-light">UMA SOLUÇÃO ADAPTADA AO SEU CONTEXTO</span><h2>O que pode fazer<br />a diferença.</h2><p>As prioridades são definidas em conjunto. A atuação considera o momento da organização e os critérios acordados.</p><Link to={contact} className="button button-outline-white">Conversar com especialista <ArrowUpRight size={16} /></Link></div><div className="service-benefit-list">{service.benefits.map((benefit, index) => <div className="service-benefit" key={benefit}><span>0{index + 1}</span><p>{benefit}</p><Check size={17} /></div>)}</div></div></section>
    <section className="service-steps section-pad"><div className="container"><div className="service-steps-heading"><span className="eyebrow">COMO PODEMOS TRABALHAR</span><h2>Um caminho construído<br />com clareza.</h2><p>As etapas abaixo servem como referência. Escopo, responsabilidades e prazos são alinhados antes do início do trabalho.</p></div><div className="service-steps-list">{service.steps.map((step, index) => <article key={step}><span className="service-step-no">0{index + 1}</span><div><h3>{step}</h3><span>ETAPA {String(index + 1).padStart(2, '0')}</span></div><ArrowDownRight size={20} /></article>)}</div></div></section>
    <section className="service-faq-section"><div className="container service-faq-grid"><div className="faq-intro"><span className="eyebrow">PERGUNTAS FREQUENTES</span><h2>Clareza antes<br />de começar.</h2><p>Quer conversar sobre uma necessidade específica? Estamos à disposição para entender o contexto.</p><Link to={contact} className="text-link">Fale com a equipe <ArrowRight size={16} /></Link></div><div className="faq-list">{service.faqs.map((faq, index) => <details className="faq-item" key={faq.q} open={index === 0}><summary><span>{faq.q}</span><ChevronDown size={17} /></summary><p>{faq.a}</p></details>)}</div></div></section>
    <section className="service-bottom-cta"><div className="container service-bottom-inner"><div className="service-bottom-icon"><ShieldCheck size={26} /></div><div><span className="eyebrow eyebrow-light">UMA CONVERSA SEM COMPROMISSO</span><h2>Vamos entender o que a sua organização precisa?</h2></div><Link to={contact} className="button button-primary">Solicitar uma conversa <ArrowUpRight size={17} /></Link></div></section>
  </main>;
}
