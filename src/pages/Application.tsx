import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, FileText, LockKeyhole, ShieldCheck, UploadCloud, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiForm, apiGet, type Job } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

export function Application() {
  const { slug } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ message: string; reference: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  usePageMeta('Candidatar-se', job ? `Candidate-se à vaga ${job.title} por meio do portal da IM Personnel.` : 'Envie seu perfil profissional para uma oportunidade da IM Personnel.', slug ? `/vagas/${slug}/candidatar` : '/vagas', true);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiGet<{ job: Job }>(`/api/jobs/${encodeURIComponent(slug)}`).then(({ job: value }) => { if (!cancelled) setJob(value); }).catch(() => { if (!cancelled) setJob(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);
  function setSelectedFile(next: File | null) {
    setError('');
    if (next) {
      const ext = next.name.toLowerCase().split('.').pop();
      if (!['pdf', 'docx'].includes(ext || '') || next.size > 5 * 1024 * 1024) { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setError('Envie seu currículo em PDF ou DOCX, com até 5 MB.'); return; }
      if (next.type && !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(next.type)) { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setError('O formato do arquivo não é compatível. Use PDF ou DOCX.'); return; }
    }
    setFile(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!job) return;
    if (!file) { setError('Anexe seu currículo em PDF ou DOCX.'); return; }
    if (!acknowledged) { setError('Confirme que leu o aviso de privacidade da candidatura.'); return; }
    const form = new FormData(event.currentTarget);
    form.set('job_slug', job.slug);
    form.set('resume', file);
    setBusy(true);
    try {
      const result = await apiForm<{ message: string; reference: string }>('/api/applications', form);
      setSuccess(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a candidatura.'); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="loading-page"><span className="loading-spinner" />Preparando candidatura…</main>;
  if (!job) return <main><PageIntro eyebrow="Candidatura" title="Esta oportunidade não está disponível." text="A vaga pode ter sido encerrada ou não está mais publicada." current="Candidatura indisponível" /><div className="container unavailable-actions"><Link to="/vagas" className="button button-dark"><ArrowLeft size={16} /> Voltar às vagas</Link></div></main>;
  return <main>
    <PageIntro eyebrow="Sua candidatura" title={success ? 'Candidatura recebida.' : 'Conte um pouco sobre você.'} text={success ? 'Obrigado por compartilhar seu perfil com a equipe da IM Personnel.' : 'Preencha os campos abaixo para participar do processo seletivo.'} current="Candidatura" compact />
    <section className="application-page section-pad"><div className="container application-layout">
      <div className="application-form-column">
        <Link to={`/vagas/${job.slug}`} className="back-link"><ArrowLeft size={15} /> Voltar à oportunidade</Link>
        {success ? <div className="application-success"><span className="success-check"><Check size={25} /></span><span className="eyebrow">ENVIO CONCLUÍDO</span><h2>Sua candidatura foi recebida.</h2><p>{success.message}</p><div className="application-reference"><span>Protocolo de atendimento</span><strong>{success.reference}</strong></div><Link className="button button-dark" to="/vagas">Explorar outras oportunidades <ArrowUpRight size={16} /></Link></div> : <form className="application-form form-card" onSubmit={submit} noValidate>
          <div className="form-section-title"><span className="form-number">01</span><div><h2>Seus dados</h2><p>Informações para a equipe de recrutamento entrar em contato.</p></div></div>
          <div className="form-grid"><label className="field-full"><span>Nome completo <i>*</i></span><input type="text" name="full_name" autoComplete="name" maxLength={160} required placeholder="Como podemos chamar você?" /></label><label><span>E-mail <i>*</i></span><input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="voce@email.com" /></label><label><span>Telefone <i>*</i></span><input type="tel" name="phone" autoComplete="tel" inputMode="tel" maxLength={24} required placeholder="(00) 00000-0000" /></label><label><span>Cidade <i>*</i></span><input type="text" name="city" autoComplete="address-level2" maxLength={100} required placeholder="Sua cidade" /></label><label><span>Estado <i>*</i></span><input type="text" name="state" autoComplete="address-level1" maxLength={2} required placeholder="UF" /></label><label className="field-full"><span>LinkedIn <small>Opcional</small></span><input type="url" name="linkedin" maxLength={500} placeholder="https://www.linkedin.com/in/..." /></label></div>
          <div className="form-section-title form-section-spaced"><span className="form-number">02</span><div><h2>Seu currículo</h2><p>PDF ou DOCX · até 5 MB · acesso restrito à equipe de recrutamento.</p></div></div>
          <label className={`upload-zone ${file ? 'upload-zone-selected' : ''}`} htmlFor="application-resume" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setSelectedFile(event.dataTransfer.files?.[0] || null); }}><input ref={fileInputRef} type="file" id="application-resume" name="resume" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} /><span className="upload-icon">{file ? <FileText size={21} /> : <UploadCloud size={22} />}</span><span className="upload-copy"><strong>{file ? file.name : 'Escolha um arquivo ou arraste até aqui'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Clique para substituir` : 'PDF ou DOCX, no máximo 5 MB'}</small></span>{file && <button className="remove-upload" type="button" aria-label="Remover currículo" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}><X size={17} /></button>}</label>
          <label className="field-full cover-letter-field"><span>Apresentação <small>Opcional</small></span><textarea name="cover_letter" rows={4} maxLength={4000} placeholder="Se quiser, compartilhe algo que gostaria que a equipe soubesse sobre seu momento profissional." /></label>
          <label className="privacy-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>Li o <Link to="/privacidade" target="_blank">Aviso de Privacidade</Link> e entendo como meus dados serão tratados para esta candidatura. <i>*</i></span></label>
          <div className="honeypot" aria-hidden="true"><label>Não preencher<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-submit-row"><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Enviando candidatura…' : 'Enviar candidatura'} <ArrowUpRight size={17} /></button><span><LockKeyhole size={14} /> Envio protegido</span></div>
        </form>}
      </div>
      <aside className="application-sidebar"><div className="application-job-card"><span className="eyebrow">OPORTUNIDADE SELECIONADA</span><h3>{job.title}</h3><p>{job.area}</p><div className="application-job-meta"><span>{job.city}, {job.state}</span><span>{job.modality} · {job.employment_type}</span></div><Link to={`/vagas/${job.slug}`}>Revisar detalhes da vaga <ArrowUpRight size={14} /></Link></div><div className="application-privacy-card"><ShieldCheck size={20} /><div><h3>Seus dados, com cuidado.</h3><p>Seu currículo não fica disponível publicamente. O acesso é restrito a usuários internos autorizados.</p><Link to="/privacidade">Saiba como tratamos dados <ArrowUpRight size={14} /></Link></div></div></aside>
    </div></section>
  </main>;
}
