import { ArrowRight, ArrowUpRight, Check, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { services } from '../data';
import { PageIntro } from '../components/PageIntro';
import { ServiceCard } from '../components/ServiceCard';
import { usePageMeta } from '../hooks/usePageMeta';

export function Solutions() {
  usePageMeta('Soluções para empresas', 'Conheça as soluções da IM Personnel em recrutamento, seleção, executive search, consultoria de RH e gestão de pessoas.', '/solucoes');
  return <main>
    <PageIntro eyebrow="Soluções IM Personnel" title={<>Pessoas e práticas alinhadas<br className="desktop-only" /> ao que o negócio precisa.</>} text="Um portfólio construído para apoiar decisões de contratação, desenvolvimento e organização de pessoas e processos." current="Soluções" />
    <section className="solutions-overview section-pad"><div className="container">
      <div className="solutions-lead"><div className="solutions-lead-icon"><Compass size={25} /></div><div><span className="eyebrow">CADA CONTEXTO PEDE UM OLHAR PRÓPRIO</span><h2>Escopo claro. Relações próximas. Decisões mais conscientes.</h2></div><p>As soluções da IM Personnel partem da compreensão do desafio. O escopo, as etapas e as responsabilidades são alinhados com cada empresa antes de iniciar.</p></div>
      <div className="services-grid solutions-cards">{services.map((service, index) => <ServiceCard service={service} key={service.slug} index={index} />)}</div>
    </div></section>
    <section className="solution-approach"><div className="container solution-approach-grid"><div><span className="eyebrow eyebrow-light">UM PROCESSO COM INTENÇÃO</span><h2>Começamos entendendo.<br /><em>Construímos juntos.</em></h2></div><div className="approach-copy"><p>O trabalho começa por uma conversa sobre necessidades, prioridades e contexto. A partir daí, a IM Personnel organiza uma proposta de atuação que respeita a realidade e os objetivos da empresa.</p><ul>{['Escopo e expectativas alinhados antes do início', 'Comunicação clara entre as pessoas envolvidas', 'Acompanhamento adequado a cada frente de trabalho'].map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul><Link to="/solicitar-proposta" className="button button-primary">Converse com nossa equipe <ArrowUpRight size={16} /></Link></div></div></section>
    <section className="mini-cta section-pad"><div className="container mini-cta-inner"><div><span className="eyebrow">VAMOS CONVERSAR</span><h2>Tem uma necessidade específica?</h2><p>Conte um pouco sobre o seu momento. A proposta começa por entender o desafio.</p></div><Link to="/solicitar-proposta" className="button button-dark">Solicitar uma proposta <ArrowRight size={16} /></Link></div></section>
  </main>;
}
