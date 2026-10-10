import { ArrowUpRight, Check, Compass, Handshake, ScanSearch, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { methodology } from '../data';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

const principles = [
  { icon: ScanSearch, title: 'Curiosidade pelo contexto', text: 'Antes de recomendar caminhos, buscamos compreender a realidade e os objetivos de cada organização.' },
  { icon: Handshake, title: 'Relações com transparência', text: 'Combinamos escopo, critérios e responsabilidades para construir uma experiência de trabalho mais clara.' },
  { icon: Compass, title: 'Decisões com intenção', text: 'Aproximamos pessoas e oportunidades com atenção ao que cada lado precisa para seguir adiante.' },
  { icon: Sparkles, title: 'Evolução possível', text: 'Propomos caminhos que consideram o momento, as prioridades e a capacidade de ação da organização.' },
];

export function About() {
  usePageMeta('A empresa', 'Conheça a IM Personnel, consultoria de recrutamento e seleção e soluções estratégicas em Recursos Humanos, com sede em Recife, Pernambuco.', '/sobre');
  return <main>
    <PageIntro eyebrow="A empresa" title={<>Pessoas no centro.<br /><span className="intro-title-accent">Negócios em movimento.</span></>} text="A IM Personnel é uma consultoria de recrutamento e seleção e soluções estratégicas em Recursos Humanos, com sede em Recife, Pernambuco." current="A empresa" />
    <section className="about-statement section-pad"><div className="container about-statement-grid"><div className="about-statement-label"><span className="small-index">NOSSA ESSÊNCIA</span><span className="statement-number">01</span></div><div><span className="eyebrow">DECISÕES SOBRE PESSOAS MERECEM ATENÇÃO</span><h2>Entender primeiro.<br /><em>Conectar com propósito.</em></h2><p>Trabalhamos para aproximar os objetivos de uma organização das competências, das experiências e das motivações das pessoas. Acreditamos que essa conexão começa com boas perguntas, escuta e clareza sobre o desafio.</p><p>Com atuação em Recife e atenção às necessidades de cada negócio, a IM Personnel apoia empresas em decisões que envolvem contratação, desenvolvimento de pessoas e organização de práticas de gestão.</p><Link className="text-link" to="/solucoes">Conheça nossas soluções <ArrowUpRight size={16} /></Link></div></div></section>
    <section className="about-principles"><div className="container"><div className="about-principles-heading"><span className="eyebrow eyebrow-light">O QUE ORIENTA NOSSA ATUAÇÃO</span><h2>Um jeito de trabalhar<br />com <em>intenção.</em></h2></div><div className="principles-grid">{principles.map(({ icon: Icon, title, text }, index) => <article key={title}><span className="principle-no">0{index + 1}</span><Icon size={23} strokeWidth={1.5} /><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>
    <section className="about-method section-pad"><div className="container about-method-grid"><div><span className="eyebrow">UMA BASE DE TRABALHO</span><h2>Estrutura sem<br />perder a <em>escuta.</em></h2><p>Uma referência inicial para conduzir projetos. Cada processo deve ser validado e ajustado pela IM Personnel junto à organização contratante.</p><Link to="/contato" className="button button-dark">Vamos conversar <ArrowUpRight size={16} /></Link></div><div className="about-method-list">{methodology.map((item) => <div key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.text}</p></div><Check size={17} /></div>)}</div></div></section>
    <section className="about-final"><div className="container about-final-inner"><span className="eyebrow eyebrow-light">RECIFE · PERNAMBUCO</span><h2>Quando as pessoas<br />se encontram, <em>o futuro se move.</em></h2><Link to="/contato" className="button button-primary">Fale com a IM Personnel <ArrowUpRight size={16} /></Link></div></section>
  </main>;
}
