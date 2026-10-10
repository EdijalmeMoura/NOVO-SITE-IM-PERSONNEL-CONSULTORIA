import { useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, FileText, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiForm } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

export function TalentBank() {
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ reference: string; message: string } | null>(null);
  usePageMeta('Banco de Talentos', 'Apresente seu perfil profissional à IM Personnel para futuras oportunidades, com consentimento e controle sobre seus dados.', '/banco-de-talentos');
  function chooseFile(next: File | null) {
    setError('');
    if (next && (!['pdf', 'docx'].includes(next.name.toLowerCase().split('.').pop() || '') || next.size > 5 * 1024 * 1024)) { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setError('Envie um currículo PDF ou DOCX de até 5 MB.'); return; }
    if (next?.type && !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(next.type)) { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setError('O formato do arquivo não é compatível. Use PDF ou DOCX.'); return; }
    setFile(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!file) { setError('Anexe seu currículo em PDF ou DOCX.'); return; }
    if (!consent) { setError('Autorize o cadastro antes de enviar seu perfil.'); return; }
    const form = new FormData(event.currentTarget); form.set('resume', file); form.set('consent', 'true'); setBusy(true);
    try { setSuccess(await apiForm('/api/talent', form)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar seus dados.'); }
    finally { setBusy(false); }
  }
  return <main>
    <PageIntro eyebrow="Banco de Talentos" title={success ? 'Perfil recebido.' : <>Compartilhe seu talento.<br /><span className="intro-title-accent">No seu tempo.</span></>} text={success ? 'Obrigado por apresentar seu perfil à IM Personnel.' : 'Cadastre seu perfil para que a equipe da IM Personnel possa considerá-lo em futuras oportunidades alinhadas à sua experiência.'} current="Banco de Talentos" />
    <section className="talent-page section-pad"><div className="container talent-layout">
      <div className="talent-form-column">
        {success ? <div className="application-success"><span className="success-check"><Check size={25} /></span><span className="eyebrow">CADASTRO RECEBIDO</span><h2>Seu perfil chegou até nós.</h2><p>{success.message}</p><div className="application-reference"><span>Protocolo</span><strong>{success.reference}</strong></div><p className="success-followup">Você pode solicitar a atualização ou exclusão dos dados a qualquer momento pelo canal de privacidade.</p><Link className="button button-dark" to="/vagas">Explorar oportunidades <ArrowUpRight size={16} /></Link></div> : <form className="talent-form form-card" onSubmit={submit} noValidate>
          <div className="form-section-title"><span className="form-number">01</span><div><h2>Seu perfil profissional</h2><p>Compartilhe somente as informações necessárias.</p></div></div>
          <div className="form-grid"><label className="field-full"><span>Nome completo <i>*</i></span><input name="full_name" autoComplete="name" maxLength={160} required placeholder="Seu nome completo" /></label><label><span>E-mail <i>*</i></span><input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="voce@email.com" /></label><label><span>Telefone <i>*</i></span><input name="phone" type="tel" autoComplete="tel" maxLength={24} required placeholder="(00) 00000-0000" /></label><label><span>Cidade <i>*</i></span><input name="city" autoComplete="address-level2" maxLength={100} required placeholder="Sua cidade" /></label><label><span>Estado <i>*</i></span><input name="state" autoComplete="address-level1" maxLength={2} required placeholder="UF" /></label><label className="field-full"><span>Área de interesse <i>*</i></span><input name="area" maxLength={100} required placeholder="Ex.: Recursos Humanos, Engenharia, Comercial" /></label><label className="field-full"><span>LinkedIn <small>Opcional</small></span><input name="linkedin" type="url" maxLength={500} placeholder="https://www.linkedin.com/in/..." /></label></div>
          <div className="form-section-title form-section-spaced"><span className="form-number">02</span><div><h2>Currículo</h2><p>PDF ou DOCX · até 5 MB · acesso interno restrito.</p></div></div>
          <label className={`upload-zone ${file ? 'upload-zone-selected' : ''}`} htmlFor="talent-resume" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0] || null); }}><input ref={fileInputRef} type="file" id="talent-resume" name="resume" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(event) => chooseFile(event.target.files?.[0] || null)} /><span className="upload-icon">{file ? <FileText size={21} /> : <UploadCloud size={22} />}</span><span className="upload-copy"><strong>{file ? file.name : 'Escolha um arquivo ou arraste até aqui'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Clique para substituir` : 'PDF ou DOCX, no máximo 5 MB'}</small></span>{file && <button className="remove-upload" type="button" aria-label="Remover currículo" onClick={(event) => { event.preventDefault(); event.stopPropagation(); chooseFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}><X size={17} /></button>}</label>
          <div className="consent-box"><ShieldCheck size={20} /><div><strong>Como seu perfil será utilizado</strong><p>Seu currículo ficará disponível apenas para usuários internos autorizados da IM Personnel, para identificação em futuras oportunidades compatíveis com seu perfil. O cadastro é opcional. Você pode retirar a autorização ou solicitar a exclusão dos dados pelo canal indicado no <Link to="/privacidade" target="_blank">Aviso de Privacidade</Link>.</p><label className="privacy-ack"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>Autorizo o uso dos dados para a finalidade descrita e registro que li o aviso de privacidade. <i>*</i></span></label></div></div>
          <div className="honeypot" aria-hidden="true"><label>Não preencher<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-submit-row"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Enviando perfil…' : 'Cadastrar meu perfil'} <ArrowUpRight size={17} /></button><span><LockKeyhole size={14} /> Envio protegido</span></div>
        </form>}
      </div>
      <aside className="talent-side"><div className="talent-side-card"><span className="eyebrow">SEU PERFIL, SEU CONTROLE</span><h2>Você escolhe como participar.</h2><div className="talent-side-line" /><ul><li><Check size={15} />Sem criar uma conta</li><li><Check size={15} />Currículo com acesso restrito</li><li><Check size={15} />Pedido de atualização ou remoção</li><li><Check size={15} />Consentimento registrado</li></ul><p>Não é necessário cadastrar seu currículo para se candidatar a uma vaga publicada.</p><Link to="/vagas">Ver oportunidades <ArrowUpRight size={14} /></Link></div><div className="talent-side-note"><LockKeyhole size={17} /><span>Currículos não são públicos nem enviados a serviços externos de IA.</span></div></aside>
    </div></section>
  </main>;
}
