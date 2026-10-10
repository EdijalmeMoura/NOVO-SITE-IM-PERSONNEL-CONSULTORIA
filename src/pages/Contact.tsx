import { useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, Linkedin, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { services } from '../data';
import { apiPost } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

export function Contact() {
  const [searchParams] = useSearchParams();
  const proposal = window.location.pathname === '/solicitar-proposta';
  const initialService = searchParams.get('servico') || '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ reference: string; message: string } | null>(null);
  usePageMeta(proposal ? 'Solicite uma proposta' : 'Contato', proposal ? 'Compartilhe sua necessidade de contratação ou gestão de pessoas com a IM Personnel.' : 'Converse com a IM Personnel sobre recrutamento, seleção e soluções estratégicas de Recursos Humanos.', proposal ? '/solicitar-proposta' : '/contato');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    setBusy(true);
    try { setResult(await apiPost('/api/leads', body)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar sua solicitação.'); }
    finally { setBusy(false); }
  }
  return <main>
    <PageIntro eyebrow={proposal ? 'Solicite uma proposta' : 'Contato'} title={result ? 'Recebemos sua mensagem.' : proposal ? <>Vamos conversar<br /><span className="intro-title-accent">sobre o seu desafio.</span></> : <>Pessoas, negócios<br /><span className="intro-title-accent">e boas conversas.</span></>} text={result ? 'Obrigado por compartilhar sua necessidade com a IM Personnel.' : 'Conte um pouco sobre o momento da sua empresa. Nossa equipe poderá entender o cenário e indicar os próximos passos.'} current={proposal ? 'Solicite uma proposta' : 'Contato'} />
    <section className="contact-page section-pad"><div className="container contact-layout">
      <div className="contact-form-col">
        {result ? <div className="application-success contact-success"><span className="success-check"><Check size={25} /></span><span className="eyebrow">SOLICITAÇÃO REGISTRADA</span><h2>Obrigado por iniciar essa conversa.</h2><p>{result.message}</p><div className="application-reference"><span>Protocolo de atendimento</span><strong>{result.reference}</strong></div><p>A equipe poderá retornar usando os dados profissionais que você informou.</p><Link className="button button-dark" to="/">Voltar ao início <ArrowRight size={16} /></Link></div> : <form className="lead-form form-card" onSubmit={submit} noValidate>
          <div className="form-section-title"><span className="form-number">01</span><div><h2>{proposal ? 'Conte sobre sua empresa' : 'Envie uma mensagem'}</h2><p>Os campos com <i>*</i> são necessários para dar andamento ao contato.</p></div></div>
          <div className="form-grid"><label><span>Nome do contato <i>*</i></span><input name="contact_name" autoComplete="name" maxLength={160} required placeholder="Seu nome" /></label><label><span>Cargo</span><input name="contact_role" maxLength={120} placeholder="Seu cargo" /></label><label><span>Empresa <i>*</i></span><input name="company" autoComplete="organization" maxLength={180} required placeholder="Nome da empresa" /></label><label><span>E-mail corporativo <i>*</i></span><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="voce@empresa.com.br" /></label><label><span>Telefone <i>*</i></span><input name="phone" type="tel" autoComplete="tel" maxLength={24} required placeholder="(00) 00000-0000" /></label><label><span>Segmento</span><input name="segment" maxLength={120} placeholder="Ex.: indústria, serviços" /></label><label><span>Cidade <i>*</i></span><input name="city" autoComplete="address-level2" maxLength={100} required placeholder="Cidade" /></label><label><span>Estado <i>*</i></span><input name="state" autoComplete="address-level1" maxLength={2} required placeholder="UF" /></label><label className="field-full"><span>Como podemos apoiar? <i>*</i></span><select name="service" defaultValue={initialService} required><option value="">Selecione uma solução</option>{services.map((service) => <option key={service.slug} value={service.title}>{service.title}</option>)}<option value="Outro / ainda não sei">Outro / ainda não sei</option></select></label><label><span>Quantidade aproximada de posições</span><select name="position_count" defaultValue=""><option value="">Selecione</option><option>1 posição</option><option>2 a 5 posições</option><option>6 a 10 posições</option><option>Mais de 10 posições</option><option>A definir</option><option>Não se aplica</option></select></label><label><span>Prazo desejado</span><select name="desired_timeline" defaultValue=""><option value="">Selecione</option><option>O mais breve possível</option><option>Até 30 dias</option><option>De 1 a 3 meses</option><option>Planejamento futuro</option><option>A definir em conversa</option></select></label><label className="field-full"><span>Descreva sua necessidade <i>*</i></span><textarea name="need" rows={5} minLength={15} maxLength={3000} required placeholder="Compartilhe os principais desafios, objetivos ou posições que gostaria de discutir." /></label></div>
          <div className="honeypot" aria-hidden="true"><label>Não preencher<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <div className="lead-form-privacy"><ShieldCheck size={16} /><span>As informações serão utilizadas para responder à sua solicitação. <Link to="/privacidade" target="_blank">Aviso de Privacidade</Link></span></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-submit-row"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Enviando solicitação…' : 'Enviar solicitação'} <ArrowUpRight size={17} /></button><span>Retorno pelo canal informado</span></div>
        </form>}
      </div>
      <aside className="contact-aside"><span className="eyebrow eyebrow-light">IM PERSONNEL CONSULTORIA</span><h2>Uma boa parceria começa com uma conversa.</h2><p>Descreva sua necessidade. Vamos entender o que faz sentido para o seu contexto.</p><div className="contact-aside-rule" /><div className="contact-detail"><span className="contact-detail-icon"><MapPin size={18} /></span><div><strong>Presença em Recife</strong><small>Recife · Pernambuco</small></div></div><a className="contact-detail contact-linkedin" href="https://br.linkedin.com/company/impersonnel-consultoria" target="_blank" rel="noreferrer"><span className="contact-detail-icon"><Linkedin size={18} /></span><div><strong>LinkedIn oficial</strong><small>Acompanhe a IM Personnel <ArrowUpRight size={13} /></small></div></a><div className="contact-response-note"><MessageCircle size={16} /><span>Use este formulário para compartilhar sua necessidade ou fale com a IM Personnel pelo LinkedIn oficial.</span></div></aside>
    </div></section>
  </main>;
}
