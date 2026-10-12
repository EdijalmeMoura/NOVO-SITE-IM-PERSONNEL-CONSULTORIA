import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Ban, BookOpenText, BriefcaseBusiness, Check, ChevronDown, CircleCheck, ClipboardList, Copy, Eye, FilePlus2, FileText, ImagePlus, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Mail, MailWarning, Plus, Presentation, Search, Send, Shield, ShieldCheck, Trash2, UserCog, UsersRound, UserRoundSearch, X } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { apiAdminForm, apiDelete, apiGet, apiPost, apiPut, formatDate, setCsrfToken, type AdminSession, type AdminUser, type Job } from '../lib/api';
import { Logo } from '../components/Logo';
import { CollectionExport, CollectionFooter, CollectionSearch, useAdminCollection } from '../components/AdminCollection';
import { formatBytes, optimizeImage } from '../lib/image';
import type { HeroSlide, Insight } from '../data';

const menu = [
  { path: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { path: 'jobs', label: 'Vagas', icon: BriefcaseBusiness },
  { path: 'applications', label: 'Candidaturas', icon: ClipboardList },
  { path: 'talent', label: 'Banco de talentos', icon: UserRoundSearch },
  { path: 'leads', label: 'Leads empresariais', icon: UsersRound },
  { path: 'content', label: 'Conteúdos', icon: BookOpenText },
  { path: 'hero', label: 'Página inicial', icon: Presentation },
  { path: 'users', label: 'Usuários', icon: UserCog },
  { path: 'security', label: 'Segurança', icon: KeyRound },
  { path: 'notifications', label: 'Notificações', icon: Mail },
  { path: 'privacy', label: 'Privacidade', icon: ShieldCheck },
  { path: 'audit', label: 'Auditoria', icon: Activity },
];
type AdminArticle = Insight & { id: string; published: boolean; created_at: string; updated_at: string };
type AdminSlide = HeroSlide & { id: string; accentLine: number | ''; imageKey: string; position: number; active: boolean; created_at: string; updated_at: string };
type SecurityState = { totp_enabled: boolean; totp_confirmed_at: string; secret_ready: boolean; encryption_available: boolean; recovery_codes_left: number; email: string };
type EmailTemplate = { key: string; label: string; audience: string; subject: string; body: string; enabled: boolean; updated_at: string; variables: string[] };
type EmailHealth = { configured: boolean; notification_email: string; last_success_at: string; last_failure_at: string; last_error: string; last_error_template: string; failures_24h: number; attention: boolean };
type EmailEvent = { id: string; template_key: string; kind: string; recipient: string; status: string; detail: string; created_at: string };
type EmailSettings = { SMTP_HOST: string; SMTP_PORT: number; SMTP_SECURE: boolean; SMTP_USER: string; SMTP_PASS_SET: boolean; EMAIL_FROM: string; LEADS_NOTIFICATION_EMAIL: string; configured: boolean; stored_in_panel: string[]; secrets_protected?: boolean; encryption_available?: boolean; pass_readable?: boolean; health?: EmailHealth; recent_events?: EmailEvent[]; templates: EmailTemplate[] };

const appStatuses = ['Candidatura recebida', 'Em análise', 'Em processo seletivo', 'Encerrada'];
const leadStatuses = ['Novo contato', 'Em atendimento', 'Reunião agendada', 'Proposta enviada', 'Em negociação', 'Convertido', 'Não convertido'];
const privacyStatuses = ['Recebida', 'Em atendimento', 'Aguardando validação', 'Concluída'];

export function AdminPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<{ csrf: string; user: { email: string; name?: string } } | null>(null);
  const [checking, setChecking] = useState(true);
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [contentEditorOpen, setContentEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<AdminArticle | null>(null);
  const [userEditorOpen, setUserEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [slideEditorOpen, setSlideEditorOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<AdminSlide | null>(null);
  const activeView = location.pathname.split('/')[2] || 'dashboard';
  const activeMenu = menu.find((item) => item.path === activeView) || menu[0];
  const refresh = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminSession>('/api/admin/session').then((data) => {
      if (cancelled) return;
      if (data.authenticated && data.csrf && data.user) { setSession({ csrf: data.csrf, user: data.user }); setCsrfToken(data.csrf); }
      else { setSession(null); setCsrfToken(''); }
      setChecking(false);
    }).catch(() => { if (!cancelled) { setSession(null); setChecking(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    // As listas paginadas (candidaturas, talentos, leads, privacidade e auditoria) buscam os próprios dados.
    const endpoint: Record<string, string> = { dashboard: '/api/admin/dashboard', jobs: '/api/admin/jobs', content: '/api/admin/articles', hero: '/api/admin/hero-slides', users: '/api/admin/users', notifications: '/api/admin/email-settings', security: '/api/admin/security' };
    setLoading(true); setError('');
    apiGet<any>(endpoint[activeView] || endpoint.dashboard).then((data) => { if (!cancelled) setPayload(data); }).catch((reason: Error) => { if (!cancelled) { setError(reason.message); if (reason.message.includes('sessão')) { setSession(null); setCsrfToken(''); } } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, activeView, refreshKey]);

  async function logout() {
    try { await apiPost('/api/admin/logout', {}); } catch { /* the session may already have expired */ }
    setSession(null); setCsrfToken(''); setPayload(null); navigate('/admin', { replace: true });
  }
  if (checking) return <main className="admin-checking"><span className="loading-spinner" />Verificando acesso…</main>;
  if (!session) return <AdminLogin onAuthenticated={(value) => { setSession(value); setCsrfToken(value.csrf); setPayload(null); navigate('/admin/dashboard', { replace: true }); }} />;
  return <div className="admin-layout">
    <aside className="admin-sidebar"><div className="admin-sidebar-brand"><Logo light /><span className="admin-panel-label">PAINEL ADMINISTRATIVO</span></div><div className="admin-sidebar-heading">OPERAÇÃO</div><nav className="admin-nav" aria-label="Navegação do painel">{menu.map(({ path, label, icon: Icon }) => <NavLink to={`/admin/${path}`} key={path} className={({ isActive }) => `admin-nav-link ${isActive || (path === 'dashboard' && activeView === 'dashboard') ? 'is-active' : ''}`}><Icon size={18} /><span>{label}</span>{path === 'jobs' && <ArrowRight className="admin-nav-arrow" size={14} />}</NavLink>)}</nav><div className="admin-sidebar-spacer" /><div className="admin-sidebar-bottom"><div className="admin-user-chip"><span className="admin-user-avatar">{(session.user.name || session.user.email).slice(0, 1).toUpperCase()}</span><span><strong>{session.user.name || session.user.email}</strong><small>{session.user.name ? session.user.email : 'Usuário administrativo'}</small></span></div><button type="button" className="admin-logout" onClick={logout}><LogOut size={16} /> Sair do painel</button><Link to="/" className="admin-back-site"><ArrowLeft size={14} /> Voltar ao site</Link></div></aside>
    <div className="admin-workspace"><header className="admin-topbar"><div><span className="admin-topbar-kicker">IM PERSONNEL / ADMIN</span><h1>{activeMenu.label}</h1></div><div className="admin-topbar-right"><span className="admin-secure-status"><span /> Conexão administrativa</span><button className="admin-top-refresh" type="button" onClick={refresh} aria-label="Atualizar dados do painel"><Activity size={16} /></button></div></header>
      <main className="admin-content" id="admin-content">{error && <div className="admin-alert" role="alert">{error}<button type="button" onClick={refresh}>Tentar novamente</button></div>}{loading && !payload ? <div className="admin-loading"><span className="loading-spinner" />Carregando dados…</div> : <>
        {activeView === 'dashboard' && <DashboardView data={payload} />}
        {activeView === 'jobs' && <JobsView jobs={payload?.items || []} loading={loading} onEdit={(job) => { setEditingJob(job); setJobEditorOpen(true); }} onCreate={() => { setEditingJob(null); setJobEditorOpen(true); }} onRefresh={refresh} />}
        {activeView === 'applications' && <ApplicationsView />}
        {activeView === 'talent' && <TalentView />}
        {activeView === 'leads' && <LeadsView />}
        {activeView === 'content' && <ContentView items={payload?.items || []} onCreate={() => { setEditingArticle(null); setContentEditorOpen(true); }} onEdit={(article) => { setEditingArticle(article); setContentEditorOpen(true); }} />}
        {activeView === 'hero' && <HeroSlidesView items={payload?.items || []} onCreate={() => { setEditingSlide(null); setSlideEditorOpen(true); }} onEdit={(slide) => { setEditingSlide(slide); setSlideEditorOpen(true); }} onRefresh={refresh} />}
        {activeView === 'users' && <UsersView items={payload?.items || []} currentUserId={payload?.current_user_id || ''} onCreate={() => { setEditingUser(null); setUserEditorOpen(true); }} onEdit={(user) => { setEditingUser(user); setUserEditorOpen(true); }} onRefresh={refresh} />}
        {activeView === 'security' && <SecurityView />}
        {activeView === 'notifications' && <NotificationsView settings={payload as EmailSettings | null} onRefresh={refresh} />}
        {activeView === 'privacy' && <PrivacyRequestsView />}
        {activeView === 'audit' && <AuditView />}
      </>}</main>
    </div>
    {jobEditorOpen && <JobEditor job={editingJob} onClose={() => setJobEditorOpen(false)} onSaved={() => { setJobEditorOpen(false); refresh(); }} />}
    {contentEditorOpen && <ContentEditor article={editingArticle} onClose={() => setContentEditorOpen(false)} onSaved={() => { setContentEditorOpen(false); refresh(); }} />}
    {userEditorOpen && <UserEditor user={editingUser} onClose={() => setUserEditorOpen(false)} onSaved={() => { setUserEditorOpen(false); refresh(); }} />}
    {slideEditorOpen && <SlideEditor slide={editingSlide} onClose={() => setSlideEditorOpen(false)} onSaved={() => { setSlideEditorOpen(false); refresh(); }} />}
  </div>;
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: (session: { csrf: string; user: { email: string; name?: string } }) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(''); const [code, setCode] = useState(''); const [recoveryMode, setRecoveryMode] = useState(false);
  function finish(response: AdminSession) {
    if (response.authenticated && response.csrf && response.user) onAuthenticated({ csrf: response.csrf, user: response.user });
    else setError('Não foi possível iniciar a sessão.');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await apiPost<AdminSession>('/api/admin/login', { email, password });
      // Conta com verificação em duas etapas: a senha abre apenas o desafio do código.
      if (response.totp_required && response.challenge) { setChallenge(response.challenge); setCode(''); return; }
      finish(response);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }
  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try { finish(await apiPost<AdminSession>('/api/admin/login/totp', { challenge, code })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o código.'); }
    finally { setBusy(false); }
  }
  return <main className="admin-login-page"><div className="login-decoration"><div className="login-orbit login-orbit-a" /><div className="login-orbit login-orbit-b" /><span className="login-watermark">IM</span><div className="login-editorial"><span className="eyebrow eyebrow-light">IM PERSONNEL / GESTÃO</span><h1>Decisões de pessoas,<br /><em>com clareza.</em></h1><p>Área administrativa reservada à equipe autorizada.</p></div><span className="login-copyright">RECIFE · PERNAMBUCO</span></div><section className="login-form-wrap"><div className="login-form-top"><Logo /><Link to="/" className="text-link">Voltar ao site <ArrowUpRight size={15} /></Link></div><div className="login-form-content"><span className="login-icon"><LockKeyhole size={21} /></span><span className="eyebrow">ACESSO SEGURO</span><h2>Entre no painel.</h2><p>{challenge ? 'Falta confirmar o código do seu aplicativo autenticador.' : 'Use as credenciais da sua conta administrativa.'}</p>{challenge ? <form onSubmit={submitCode} noValidate><label><span>{recoveryMode ? 'Código de recuperação' : 'Código de verificação'}</span><input inputMode={recoveryMode ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus value={code} onChange={(event) => setCode(event.target.value)} required placeholder={recoveryMode ? 'ABCDE-12345' : '000000'} /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar e entrar'} <ArrowUpRight size={16} /></button><div className="login-mfa-help"><button type="button" className="text-link" onClick={() => { setRecoveryMode(!recoveryMode); setCode(''); setError(''); }}>{recoveryMode ? 'Usar o código do aplicativo' : 'Perdi o acesso ao aplicativo'}</button><button type="button" className="text-link" onClick={() => { setChallenge(''); setPassword(''); setCode(''); setRecoveryMode(false); setError(''); }}>Voltar ao início</button></div></form> : <form onSubmit={submit} noValidate><label><span>E-mail de acesso</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nome@empresa.com.br" /></label><label><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Sua senha" /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary login-submit" type="submit" disabled={busy}>{busy ? 'Validando acesso…' : 'Entrar no painel'} <ArrowUpRight size={16} /></button></form>}<div className="login-security-note"><Shield size={15} /><span>Acesso restrito. Todas as ações administrativas relevantes são registradas.</span></div><details className="admin-setup-help"><summary>Primeiro acesso?</summary><p>Crie a conta inicial pelo terminal com <code>npm run admin:create</code>. Consulte a documentação de instalação.</p></details></div></section></main>;
}

function DashboardView({ data }: { data: any }) {
  const counts = data?.counts || { active_jobs: 0, applications: 0, new_leads: 0, expiring_jobs: 0 };
  const metrics = [
    { label: 'Vagas ativas', value: counts.active_jobs, icon: BriefcaseBusiness, note: 'Publicadas e dentro da validade' },
    { label: 'Candidaturas', value: counts.applications, icon: ClipboardList, note: 'Recebidas neste portal' },
    { label: 'Novos leads', value: counts.new_leads, icon: UsersRound, note: 'Aguardando primeiro contato' },
    { label: 'Próximas do fim', value: counts.expiring_jobs, icon: Activity, note: 'Encerramento em até 7 dias' },
  ];
  const byJob = data?.applications_by_job || []; const maxApplications = Math.max(1, ...byJob.map((row: any) => Number(row.total)));
  return <div className="admin-dashboard"><div className="admin-page-intro"><div><span className="eyebrow">DADOS OPERACIONAIS</span><h2>{new Date().getHours() < 12 ? 'Bom dia.' : new Date().getHours() < 18 ? 'Boa tarde.' : 'Boa noite.'} Veja o que está acontecendo.</h2><p>Indicadores calculados a partir das informações registradas no painel.</p></div><span className="admin-today">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span></div>
    <div className="admin-metrics">{metrics.map(({ label, value, icon: Icon, note }) => <article className="admin-metric" key={label}><div className="admin-metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{note}</small></article>)}</div>
    <section className="admin-panel-card admin-backup-card"><div className="admin-card-heading"><div><span className="eyebrow">GUARDA E PORTABILIDADE</span><h3>Backup da operação</h3></div></div><p>O download reúne a base de dados, os currículos recebidos e as imagens de conteúdo, com um arquivo de instruções para restaurar. A exportação em CSV de cada lista respeita a busca e o filtro aplicados na tela.</p><div className="admin-backup-actions"><a className="button button-primary button-small" href="/api/admin/backup" download><ArrowDownToLine size={15} /> Baixar backup completo</a><Link className="button button-outline button-small" to="/admin/applications">Exportar dados por lista</Link></div><small className="admin-backup-note"><ShieldCheck size={13} /> Todo backup e toda exportação entram na auditoria com data, usuário e quantidade de registros.</small></section>
    {data?.email_health?.attention && <div className="admin-notice admin-notice-danger" role="alert"><MailWarning size={17} /><div><strong>O último envio de e-mail falhou.</strong><p>Candidatos e a equipe podem não estar recebendo as confirmações e os avisos. Último erro registrado ({formatDate(data.email_health.last_failure_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}): <code>{data.email_health.last_error}</code>. Confira as credenciais em <Link to="/admin/notifications">Notificações</Link>.</p></div></div>}
    {data?.email_health?.configured === true && !data.email_health.attention && data.email_health.last_success_at && <div className="admin-notice" role="status"><Mail size={17} /><div><strong>Entrega de e-mail em dia.</strong><p>Último envio confirmado em {formatDate(data.email_health.last_success_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Nenhuma falha nas últimas 24 horas.</p></div></div>}
    {data && data.email_health && data.email_health.configured === false && <div className="admin-notice admin-notice-warning" role="status"><MailWarning size={17} /><div><strong>Notificações por e-mail desativadas.</strong><p>Os formulários de contato, candidatura e currículo continuam gravando os envios neste painel, mas nenhuma confirmação ou aviso é disparado porque o SMTP não está configurado. Defina <code>SMTP_HOST</code>, <code>EMAIL_FROM</code> e, para avisar a equipe, <code>LEADS_NOTIFICATION_EMAIL</code> no ambiente de execução.</p></div></div>}
    {data?.email_health?.configured === true && !data.email_health.notification_email && <div className="admin-notice" role="status"><MailWarning size={17} /><div><strong>Avisos à equipe desligados.</strong><p>O SMTP está ativo e quem envia o formulário recebe confirmação, mas a equipe não é avisada. Defina <code>LEADS_NOTIFICATION_EMAIL</code> para receber os novos contatos, candidaturas e currículos.</p></div></div>}
    <div className="admin-dashboard-grid"><section className="admin-panel-card"><div className="admin-card-heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h3>Candidaturas por vaga</h3></div><Link to="/admin/applications" className="admin-card-link">Ver candidaturas <ArrowUpRight size={14} /></Link></div>{byJob.length ? <div className="bar-chart-list">{byJob.map((row: any) => <div className="bar-chart-row" key={row.id}><div className="bar-chart-label"><span>{row.title}</span><strong>{row.total}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(4, Number(row.total) / maxApplications * 100)}%` }} /></div></div>)}</div> : <div className="admin-empty-inline"><ClipboardList size={19} /><p>Os dados de candidaturas por vaga aparecerão aqui conforme os registros forem recebidos.</p></div>}</section>
      <section className="admin-panel-card"><div className="admin-card-heading"><div><span className="eyebrow">MOVIMENTAÇÃO RECENTE</span><h3>Solicitações empresariais</h3></div><Link to="/admin/leads" className="admin-card-link">Abrir CRM <ArrowUpRight size={14} /></Link></div>{data?.recent_leads?.length ? <div className="admin-recent-list">{data.recent_leads.map((lead: any) => <div className="admin-recent-row" key={lead.id}><span className="admin-recent-avatar">{lead.company.slice(0, 1).toUpperCase()}</span><div><strong>{lead.company}</strong><small>{lead.service} · {lead.contact_name}</small></div><span className="admin-status-pill">{lead.status}</span></div>)}</div> : <div className="admin-empty-inline"><UsersRound size={19} /><p>Nenhuma solicitação empresarial recebida ainda.</p></div>}</section>
      <section className="admin-panel-card admin-publication-chart"><div className="admin-card-heading"><div><span className="eyebrow">HISTÓRICO</span><h3>Publicações de vagas</h3></div></div>{data?.publication_timeline?.length ? <div className="admin-month-chart">{(() => { const values = data.publication_timeline; const max = Math.max(1, ...values.map((item: any) => Number(item.total))); return values.map((item: any) => <div className="admin-month-col" key={item.month}><strong>{item.total}</strong><div className="admin-month-track"><span style={{ height: `${Number(item.total) > 0 ? Math.max(4, Number(item.total) / max * 100) : 0}%` }} /></div><small>{item.label}</small></div>); })()}</div> : <div className="admin-empty-inline"><p>O histórico de publicações ficará disponível conforme vagas forem publicadas no painel.</p></div>}<span className="admin-chart-note">Eventos registrados no painel nos últimos seis meses.</span></section>
      <section className="admin-panel-card admin-recent-applications"><div className="admin-card-heading"><div><span className="eyebrow">TALENTOS</span><h3>Candidaturas recentes</h3></div><Link to="/admin/applications" className="admin-card-link">Ver todas <ArrowUpRight size={14} /></Link></div>{data?.recent_applications?.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Candidato</th><th>Oportunidade</th><th>Status</th><th>Recebida</th></tr></thead><tbody>{data.recent_applications.map((item: any) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{item.job_title}</td><td><span className="admin-status-pill">{item.status}</span></td><td>{formatDate(item.created_at)}</td></tr>)}</tbody></table></div> : <div className="admin-empty-inline"><p>As candidaturas recebidas serão listadas aqui.</p></div>}</section>
    </div><div className="admin-dashboard-foot"><ShieldCheck size={16} /> Os indicadores refletem registros reais do portal. Nenhum dado demonstrativo é incluído.</div>
  </div>;
}

function JobsView({ jobs, onEdit, onCreate, onRefresh }: { jobs: Job[]; loading: boolean; onEdit: (job: Job) => void; onCreate: () => void; onRefresh: () => void }) {
  const [query, setQuery] = useState(''); const [busyId, setBusyId] = useState(''); const [feedback, setFeedback] = useState('');
  const filtered = jobs.filter((job) => `${job.title} ${job.area} ${job.city}`.toLowerCase().includes(query.toLowerCase()));
  async function duplicate(job: Job) { setBusyId(job.id); setFeedback(''); try { await apiPost(`/api/admin/jobs/${job.id}/duplicate`, {}); setFeedback('Vaga duplicada como rascunho.'); onRefresh(); } catch (reason) { setFeedback(reason instanceof Error ? reason.message : 'Não foi possível duplicar a vaga.'); } finally { setBusyId(''); } }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">PUBLICAÇÕES DE OPORTUNIDADES</span><h2>Gerencie as vagas do portal.</h2><p>Rascunhos, publicações e encerramentos em um só lugar.</p></div><button className="button button-primary" type="button" onClick={onCreate}><Plus size={17} /> Nova vaga</button></div>{feedback && <div className="admin-inline-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback('')}><X size={14} /></button></div>}
    <div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cargo, área ou cidade" /></label><CollectionExport kind="jobs" query={query} /><span>{filtered.length} {filtered.length === 1 ? 'vaga' : 'vagas'} cadastradas</span></div>
    {filtered.length ? <div className="admin-table-card"><div className="admin-table-wrap"><table className="admin-table admin-jobs-table"><thead><tr><th>Oportunidade</th><th>Localidade</th><th>Publicação</th><th>Encerramento</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filtered.map((job) => <tr key={job.id}><td><strong>{job.title}</strong><small>{job.area} · {job.employment_type}</small></td><td>{job.city}, {job.state}<small>{job.modality}</small></td><td>{formatDate(job.created_at)}</td><td>{job.expires_at ? formatDate(job.expires_at) : 'Sem data definida'}</td><td><span className={`admin-status-pill ${job.published ? 'status-live' : 'status-draft'}`}>{job.published ? 'Publicada' : 'Rascunho'}</span></td><td><div className="admin-row-actions"><button type="button" title="Editar vaga" onClick={() => onEdit(job)}><FileText size={16} /></button><button type="button" title="Duplicar como rascunho" onClick={() => duplicate(job)} disabled={busyId === job.id}><FilePlus2 size={16} /></button>{job.published && <a href={`/vagas/${job.slug}`} target="_blank" rel="noreferrer" title="Abrir página pública"><ArrowUpRight size={16} /></a>}</div></td></tr>)}</tbody></table></div></div> : <div className="admin-empty-state"><span className="admin-empty-icon"><BriefcaseBusiness size={22} /></span><h3>{jobs.length ? 'Nenhuma vaga encontrada.' : 'Nenhuma vaga cadastrada.'}</h3><p>{jobs.length ? 'Tente outra busca.' : 'Crie um rascunho para começar. As vagas só aparecem no site quando forem publicadas.'}</p>{!jobs.length && <button className="button button-dark" type="button" onClick={onCreate}><Plus size={16} /> Criar primeira vaga</button>}</div>}
  </div>;
}

function JobEditor({ job, onClose, onSaved }: { job: Job | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const form = new FormData(event.currentTarget);
    const body: Record<string, any> = Object.fromEntries(form.entries());
    body.published = form.get('published') === 'on'; body.featured = form.get('featured') === 'on';
    for (const field of ['responsibilities', 'requirements', 'differentiators', 'benefits']) body[field] = String(body[field] || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    setBusy(true);
    try { if (job) await apiPut(`/api/admin/jobs/${job.id}`, body); else await apiPost('/api/admin/jobs', body); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a vaga.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="admin-job-modal" role="dialog" aria-modal="true" aria-labelledby="job-modal-title"><div className="admin-modal-head"><div><span className="eyebrow">GERENCIAR OPORTUNIDADE</span><h2 id="job-modal-title">{job ? 'Editar vaga' : 'Nova vaga'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="admin-editor-form" onSubmit={submit} noValidate><div className="form-grid"><label className="field-full"><span>Título da vaga <i>*</i></span><input name="title" defaultValue={job?.title || ''} required maxLength={140} /></label><label className="field-full"><span>Empresa contratante <small>Opcional · preencha somente se houver autorização para divulgar</small></span><input name="hiring_organization" defaultValue={job?.hiring_organization || ''} maxLength={180} placeholder="Empresa ou organização" /></label><label><span>Área <i>*</i></span><input name="area" defaultValue={job?.area || ''} required maxLength={90} placeholder="Ex.: Recursos Humanos" /></label><label><span>Cidade <i>*</i></span><input name="city" defaultValue={job?.city || ''} required maxLength={100} /></label><label><span>Estado (UF) <i>*</i></span><input name="state" defaultValue={job?.state || ''} required maxLength={2} /></label><label><span>Modalidade <i>*</i></span><select name="modality" defaultValue={job?.modality || 'Presencial'}><option>Presencial</option><option>Híbrido</option><option>Remoto</option></select></label><label><span>Tipo de contratação <i>*</i></span><select name="employment_type" defaultValue={job?.employment_type || 'CLT'}><option>CLT</option><option>PJ</option><option>Temporário</option><option>Estágio</option><option>Aprendiz</option><option>Consultoria</option><option>A combinar</option></select></label><label><span>Data de encerramento</span><input name="expires_at" type="date" defaultValue={job?.expires_at || ''} /></label><label className="field-full"><span>Resumo da oportunidade <i>*</i></span><textarea name="summary" rows={3} defaultValue={job?.summary || ''} required maxLength={1500} /></label><label className="field-full"><span>Responsabilidades <small>Uma por linha</small></span><textarea name="responsibilities" rows={4} defaultValue={job?.responsibilities.join('\n') || ''} /></label><label className="field-full"><span>Requisitos <small>Uma por linha</small></span><textarea name="requirements" rows={4} defaultValue={job?.requirements.join('\n') || ''} /></label><label className="field-full"><span>Diferenciais <small>Uma por linha</small></span><textarea name="differentiators" rows={3} defaultValue={job?.differentiators.join('\n') || ''} /></label><label className="field-full"><span>Benefícios autorizados <small>Uma por linha</small></span><textarea name="benefits" rows={3} defaultValue={job?.benefits.join('\n') || ''} /></label><div className="admin-toggle-row field-full"><label><input name="published" type="checkbox" defaultChecked={job?.published || false} /><span><strong>Publicar oportunidade</strong><small>Vagas expiradas ou despublicadas não aparecem no portal.</small></span></label><label><input name="featured" type="checkbox" defaultChecked={job?.featured || false} /><span><strong>Destacar na página inicial</strong><small>Somente oportunidades ativas serão exibidas.</small></span></label></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : job ? 'Salvar alterações' : 'Salvar vaga'} <Check size={16} /></button></div></form></section></div>;
}

function ApplicationsView() {
  const collection = useAdminCollection<any>('/api/admin/applications');
  const [busyId, setBusyId] = useState(''); const [error, setError] = useState('');
  const filtered = collection.items;
  async function save(item: any, event: FormEvent<HTMLFormElement>) { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget).entries()); setBusyId(item.id); setError(''); try { await apiPut(`/api/admin/applications/${item.id}`, body); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar.'); } finally { setBusyId(''); } }
  async function remove(item: any) { if (!window.confirm(`Excluir permanentemente a candidatura de ${item.full_name} e o currículo anexado?`)) return; try { await apiDelete(`/api/admin/applications/${item.id}`); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a candidatura.'); } }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">PROCESSOS SELETIVOS</span><h2>Acompanhe as candidaturas.</h2><p>Consulte informações profissionais, currículo e status compartilhado com a equipe.</p></div><span className="admin-count-chip">{collection.total} registros</span></div>{(error || collection.error) && <div className="admin-alert" role="alert">{error || collection.error}</div>}<div className="admin-toolbar"><CollectionSearch value={collection.query} onChange={collection.setQuery} placeholder="Buscar pessoa, e-mail ou vaga" status={collection.status} onStatusChange={collection.setStatus} statusOptions={appStatuses} statusLabel="Filtrar por status" /><CollectionExport kind="applications" query={collection.query} status={collection.status} /></div>{filtered.length ? <div className="admin-accordion-list">{filtered.map((item) => <details className="admin-record-card" key={item.id}><summary><span className="admin-record-avatar">{item.full_name.slice(0, 1).toUpperCase()}</span><span className="admin-record-main"><strong>{item.full_name}</strong><small>{item.job_title} · {item.city}, {item.state}</small></span><span className="admin-status-pill">{item.status}</span><span className="admin-record-date">{formatDate(item.created_at)}</span><ChevronDown size={17} /></summary><div className="admin-record-detail"><div className="admin-record-facts"><span><small>E-mail</small><a href={`mailto:${item.email}`}>{item.email}</a></span><span><small>Telefone</small><a href={`tel:${item.phone}`}>{item.phone}</a></span>{item.linkedin && <span><small>LinkedIn</small><a href={item.linkedin} target="_blank" rel="noreferrer">Abrir perfil <ArrowUpRight size={13} /></a></span>}<span><small>Privacidade</small>{item.privacy_notice_version}</span></div>{item.cover_letter && <div className="admin-candidate-note"><small>APRESENTAÇÃO</small><p>{item.cover_letter}</p></div>}<div className="admin-resume-download"><FileText size={17} /><span>Currículo protegido <small>Download registrado em auditoria</small></span><a href={`/api/admin/files/${item.resume_key}`} target="_blank" rel="noreferrer"><ArrowDownToLine size={15} /> Baixar</a></div><form className="admin-record-form" onSubmit={(event) => save(item, event)}><label><span>Status compartilhado</span><select name="status" defaultValue={item.status}>{appStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label className="admin-notes"><span>Observação interna</span><textarea name="internal_notes" rows={2} defaultValue={item.internal_notes} maxLength={4000} placeholder="Acesso restrito à equipe autorizada." /></label><div><button className="button button-primary button-small" disabled={busyId === item.id}>{busyId === item.id ? 'Salvando…' : 'Salvar atualização'} <Check size={14} /></button><button className="admin-delete-link" type="button" onClick={() => remove(item)}><Trash2 size={14} /> Excluir registro</button></div></form></div></details>)}</div> : <AdminEmpty icon={<ClipboardList size={21} />} title="Nenhuma candidatura encontrada." text="As inscrições recebidas para vagas ativas aparecerão aqui." />}<CollectionFooter shown={filtered.length} total={collection.total} loading={collection.loading} hasMore={collection.hasMore} onLoadMore={collection.loadMore} label="candidaturas" /></div>;
}

function TalentView() {
  const collection = useAdminCollection<any>('/api/admin/talent');
  const [error, setError] = useState('');
  const filtered = collection.items;
  async function remove(item: any) { if (!window.confirm(`Excluir o perfil de ${item.full_name} e remover seu currículo do armazenamento privado?`)) return; try { await apiDelete(`/api/admin/talent/${item.id}`); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o perfil.'); } }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">ACESSO RESTRITO</span><h2>Banco de talentos.</h2><p>Perfis enviados com autorização para futuras oportunidades. Currículos não são públicos.</p></div><span className="admin-count-chip">{collection.total} perfis</span></div>{(error || collection.error) && <div className="admin-alert" role="alert">{error || collection.error}</div>}<div className="admin-toolbar"><CollectionSearch value={collection.query} onChange={collection.setQuery} placeholder="Buscar nome, e-mail, área ou cidade" /><CollectionExport kind="talent" query={collection.query} /><span><LockKeyhole size={14} /> Somente usuários autorizados</span></div>{filtered.length ? <div className="admin-table-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Profissional</th><th>Área de interesse</th><th>Localidade</th><th>Autorização</th><th>Cadastro</th><th>Arquivo</th><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{item.area}</td><td>{item.city}, {item.state}</td><td><span className="admin-status-pill status-live">Registrada</span><small>{item.privacy_notice_version}</small></td><td>{formatDate(item.created_at)}</td><td><a className="admin-file-link" href={`/api/admin/files/${item.resume_key}`} target="_blank" rel="noreferrer"><ArrowDownToLine size={14} /> Currículo</a></td><td><button className="admin-icon-danger" type="button" aria-label={`Excluir cadastro de ${item.full_name}`} onClick={() => remove(item)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></div> : <AdminEmpty icon={<UserRoundSearch size={21} />} title="Nenhum perfil encontrado." text="Novos cadastros autorizados aparecerão aqui." />}<div className="admin-privacy-reminder"><ShieldCheck size={16} /><span>Respeite a finalidade e o prazo de retenção aprovados pela IM Personnel. Solicitações de remoção devem ser tratadas na aba Privacidade.</span></div><CollectionFooter shown={filtered.length} total={collection.total} loading={collection.loading} hasMore={collection.hasMore} onLoadMore={collection.loadMore} label="perfis" /></div>;
}

function LeadsView() {
  const collection = useAdminCollection<any>('/api/admin/leads');
  const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const filtered = collection.items;
  async function save(item: any, event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setBusy(item.id); try { await apiPut(`/api/admin/leads/${item.id}`, Object.fromEntries(new FormData(event.currentTarget).entries())); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); } finally { setBusy(''); } }
  async function remove(item: any) { if (!window.confirm(`Excluir o registro comercial de ${item.company}?`)) return; setError(''); try { await apiDelete(`/api/admin/leads/${item.id}`); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o lead.'); } }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">CRM COMERCIAL</span><h2>Acompanhe as conversas com empresas.</h2><p>Organize as solicitações, próximas ações e histórico de atendimento.</p></div><span className="admin-count-chip">{collection.total} leads</span></div>{(error || collection.error) && <div className="admin-alert" role="alert">{error || collection.error}</div>}<div className="admin-toolbar"><CollectionSearch value={collection.query} onChange={collection.setQuery} placeholder="Buscar empresa, contato ou serviço" status={collection.status} onStatusChange={collection.setStatus} statusOptions={leadStatuses} statusLabel="Filtrar etapa comercial" /><CollectionExport kind="leads" query={collection.query} status={collection.status} /></div>{filtered.length ? <div className="admin-accordion-list">{filtered.map((item) => <details className="admin-record-card lead-record" key={item.id}><summary><span className="admin-record-avatar lead-avatar">{item.company.slice(0, 1).toUpperCase()}</span><span className="admin-record-main"><strong>{item.company}</strong><small>{item.contact_name} · {item.service}</small></span><span className="admin-status-pill">{item.status}</span><span className="admin-record-date">{formatDate(item.created_at)}</span><ChevronDown size={17} /></summary><div className="admin-record-detail"><div className="admin-record-facts"><span><small>Contato</small>{item.contact_name}{item.contact_role ? ` · ${item.contact_role}` : ''}</span><span><small>E-mail</small><a href={`mailto:${item.email}`}>{item.email}</a></span><span><small>Telefone</small><a href={`tel:${item.phone}`}>{item.phone}</a></span><span><small>Localidade</small>{item.city}, {item.state}</span><span><small>Segmento</small>{item.segment || 'Não informado'}</span><span><small>Posições</small>{item.position_count || 'Não informado'}</span><span><small>Prazo</small>{item.desired_timeline || 'Não informado'}</span></div><div className="admin-lead-need"><small>NECESSIDADE DESCRITA</small><p>{item.need}</p></div><form className="admin-record-form" onSubmit={(event) => save(item, event)}><label><span>Etapa comercial</span><select name="status" defaultValue={item.status}>{leadStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Responsável</span><input name="assigned_to" defaultValue={item.assigned_to} maxLength={160} placeholder="Pessoa responsável pelo retorno" /></label><label className="admin-notes"><span>Histórico / observações</span><textarea name="notes" rows={2} defaultValue={item.notes} maxLength={4000} placeholder="Registre contato, reunião ou próximo passo." /></label><button className="button button-primary button-small" disabled={busy === item.id}>{busy === item.id ? 'Salvando…' : 'Salvar atualização'} <Check size={14} /></button><button className="admin-delete-link" type="button" onClick={() => remove(item)}><Trash2 size={14} /> Excluir lead</button></form></div></details>)}</div> : <AdminEmpty icon={<UsersRound size={21} />} title="Nenhum lead encontrado." text="Solicitações enviadas pelo formulário comercial aparecerão aqui." />}<CollectionFooter shown={filtered.length} total={collection.total} loading={collection.loading} hasMore={collection.hasMore} onLoadMore={collection.loadMore} label="leads" /></div>;
}

function PrivacyRequestsView() {
  const collection = useAdminCollection<any>('/api/admin/privacy-requests');
  const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const items = collection.items;
  async function save(item: any, event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setBusy(item.id); try { await apiPut(`/api/admin/privacy-requests/${item.id}`, Object.fromEntries(new FormData(event.currentTarget).entries())); collection.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar.'); } finally { setBusy(''); } }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">DIREITOS DOS TITULARES</span><h2>Solicitações de privacidade.</h2><p>Pedidos recebidos pelo formulário de privacidade. Valide a identidade e registre o encaminhamento.</p></div><span className="admin-count-chip">{collection.total} pedidos</span></div>{(error || collection.error) && <div className="admin-alert" role="alert">{error || collection.error}</div>}<div className="admin-toolbar"><CollectionSearch value={collection.query} onChange={collection.setQuery} placeholder="Buscar nome, e-mail ou tipo de pedido" status={collection.status} onStatusChange={collection.setStatus} statusOptions={privacyStatuses} statusLabel="Filtrar status do pedido" /><CollectionExport kind="privacy" query={collection.query} status={collection.status} /></div>{items.length ? <div className="admin-accordion-list">{items.map((item) => <details className="admin-record-card privacy-record" key={item.id}><summary><span className="admin-record-avatar privacy-avatar"><ShieldCheck size={17} /></span><span className="admin-record-main"><strong>{item.request_type}</strong><small>{item.full_name} · {item.email}</small></span><span className="admin-status-pill">{item.status}</span><span className="admin-record-date">{formatDate(item.created_at)}</span><ChevronDown size={17} /></summary><div className="admin-record-detail"><div className="admin-lead-need"><small>DETALHES DO PEDIDO</small><p>{item.details || 'Nenhum detalhe adicional informado.'}</p></div><form className="admin-record-form" onSubmit={(event) => save(item, event)}><label><span>Status</span><select name="status" defaultValue={item.status}>{privacyStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label className="admin-notes"><span>Encaminhamento interno</span><textarea name="internal_notes" rows={3} defaultValue={item.internal_notes} maxLength={3000} placeholder="Validação de identidade, análise da solicitação, providências tomadas." /></label><button className="button button-primary button-small" disabled={busy === item.id}>{busy === item.id ? 'Salvando…' : 'Registrar andamento'} <Check size={14} /></button></form></div></details>)}</div> : <AdminEmpty icon={<ShieldCheck size={21} />} title="Nenhuma solicitação registrada." text="Pedidos de titulares enviados pelo site serão listados aqui." />}<div className="admin-privacy-reminder"><ShieldCheck size={16} /><span>Confirme a identidade com proporcionalidade e avalie obrigações de guarda antes de excluir registros ou arquivos.</span></div><CollectionFooter shown={items.length} total={collection.total} loading={collection.loading} hasMore={collection.hasMore} onLoadMore={collection.loadMore} label="pedidos" /></div>;
}

function AuditView() {
  const collection = useAdminCollection<any>('/api/admin/audit', { limit: 200 });
  const items = collection.items;
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">RASTREABILIDADE</span><h2>Histórico de ações administrativas.</h2><p>Alterações de vagas, leads, candidaturas, solicitações, envios de e-mail e downloads de currículos.</p></div><span className="admin-count-chip">{collection.total} eventos</span></div><div className="admin-toolbar"><CollectionSearch value={collection.query} onChange={collection.setQuery} placeholder="Buscar por usuário, ação ou registro" /><CollectionExport kind="audit" query={collection.query} /></div>{collection.error && <div className="admin-alert" role="alert">{collection.error}</div>}{items.length ? <div className="admin-table-card"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{formatDate(item.created_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>{item.actor_email}</td><td><span className="audit-action-label">{item.action}</span></td><td>{item.entity_type} · {item.entity_id.slice(0, 8)}</td><td>{JSON.stringify(JSON.parse(item.details || '{}'))}</td></tr>)}</tbody></table></div></div> : <AdminEmpty icon={<Activity size={21} />} title="Ainda não há eventos." text="Ações administrativas relevantes e downloads de currículos serão registrados aqui." />}<CollectionFooter shown={items.length} total={collection.total} loading={collection.loading} hasMore={collection.hasMore} onLoadMore={collection.loadMore} label="eventos" /></div>;
}

function ContentView({ items, onCreate, onEdit }: { items: AdminArticle[]; onCreate: () => void; onEdit: (article: AdminArticle) => void }) {
  const [query, setQuery] = useState('');
  const filtered = items.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">ARTIGOS E INSIGHTS</span><h2>Conteúdos para publicar e atualizar.</h2><p>Revise os textos, escolha a data de publicação e mantenha os conteúdos em dia.</p></div><button className="button button-primary" type="button" onClick={onCreate}><Plus size={16} /> Novo conteúdo</button></div><div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título ou categoria" /></label><span>{filtered.length} conteúdos · rascunhos e publicados</span></div>{filtered.length ? <div className="content-admin-grid">{filtered.map((article) => <article className="content-admin-card" key={article.id}>{article.image_url ? <div className="content-admin-thumb"><img src={article.image_url} alt={article.image_alt || ''} loading="lazy" /></div> : <div className="content-admin-thumb content-admin-thumb-empty"><ImagePlus size={18} /><small>Sem imagem de capa</small></div>}<div className="content-admin-top"><span className="job-area-tag">{article.category}</span><span className={`admin-status-pill ${article.published ? 'status-live' : 'status-draft'}`}>{article.published ? 'Publicado' : 'Rascunho'}</span></div><h3>{article.title}</h3><p>{article.intro}</p><div className="content-admin-meta"><span>{article.minutes} min de leitura</span><span>Atualizado {formatDate(article.updated_at)}</span></div><div className="content-admin-actions"><button type="button" className="button button-outline button-small" onClick={() => onEdit(article)}>Editar conteúdo <FileText size={14} /></button>{article.published && <a href={`/conteudos/${article.slug}`} target="_blank" rel="noreferrer">Abrir publicação <ArrowUpRight size={13} /></a>}</div></article>)}</div> : <AdminEmpty icon={<BookOpenText size={21} />} title="Nenhum conteúdo encontrado." text="Crie um rascunho para começar a editar os artigos publicados no site." />}</div>;
}

function ContentEditor({ article, onClose, onSaved }: { article: AdminArticle | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [optimizing, setOptimizing] = useState(false); const [optimization, setOptimization] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const currentImage = article?.image_url || '';
  const preview = previewUrl || (removeImage ? '' : currentImage);
  useEffect(() => {
    if (!image) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  async function chooseImage(next: File | null) {
    setError(''); setOptimization('');
    if (!next) { setImage(null); setRemoveImage(false); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(next.type)) { setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; setError('Use uma imagem JPG, PNG, WebP ou AVIF.'); return; }
    if (next.size > 5 * 1024 * 1024) { setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; setError('A imagem deve ter no máximo 5 MB.'); return; }
    setImage(next); setRemoveImage(false);
    // A imagem é reduzida no navegador: o arquivo enviado já sai leve para o site.
    setOptimizing(true);
    const result = await optimizeImage(next);
    setOptimizing(false);
    setImage(result.file);
    if (result.optimized) setOptimization(`Imagem otimizada de ${formatBytes(result.originalBytes)} para ${formatBytes(result.bytes)}.`);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (optimizing) { setError('Aguarde a otimização da imagem terminar.'); return; }
    const form = new FormData(event.currentTarget);
    form.set('published', form.get('published') === 'on' ? 'true' : 'false');
    form.set('remove_image', removeImage && !image ? 'true' : 'false');
    // O input ainda guarda o arquivo original: aqui entra a versão reduzida no navegador.
    if (image) form.set('image', image, image.name); else form.delete('image');
    setBusy(true);
    try { if (article) await apiAdminForm(`/api/admin/articles/${article.id}`, form, 'PUT'); else await apiAdminForm('/api/admin/articles', form); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o conteúdo.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="admin-job-modal content-editor-modal" role="dialog" aria-modal="true" aria-labelledby="article-modal-title"><div className="admin-modal-head"><div><span className="eyebrow">GESTÃO EDITORIAL</span><h2 id="article-modal-title">{article ? 'Editar conteúdo' : 'Novo conteúdo'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="admin-editor-form" onSubmit={submit} noValidate><div className="form-grid"><label className="field-full"><span>Título <i>*</i></span><input name="title" defaultValue={article?.title || ''} required maxLength={180} /></label><label><span>Categoria <i>*</i></span><input name="category" defaultValue={article?.category || ''} required maxLength={100} placeholder="Ex.: Liderança" /></label><label><span>Endereço amigável (slug)</span><input name="slug" defaultValue={article?.slug || ''} maxLength={100} placeholder="Gerado a partir do título se vazio" /></label><label className="field-full"><span>Resumo <i>*</i></span><textarea name="intro" rows={3} defaultValue={article?.intro || ''} maxLength={900} required /></label><div className="field-full admin-image-field"><span className="admin-image-field-title">Imagem de capa <small>Opcional · JPG, PNG, WebP ou AVIF · até 5 MB</small></span><div className="admin-image-picker"><div className="admin-image-preview">{preview ? <img src={preview} alt="Pré-visualização da imagem de capa" /> : <span className="admin-image-placeholder"><ImagePlus size={20} /><small>Sem imagem</small></span>}</div><div className="admin-image-controls"><label className="upload-zone upload-zone-compact" htmlFor="article-image" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseImage(event.dataTransfer.files?.[0] || null); }}><input ref={imageInputRef} type="file" id="article-image" name="image" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void chooseImage(event.target.files?.[0] || null)} /><span className="upload-icon"><ImagePlus size={18} /></span><span className="upload-copy"><strong>{optimizing ? 'Otimizando imagem…' : image ? image.name : preview ? 'Substituir imagem' : 'Enviar imagem'}</strong><small>{optimizing ? 'Reduzindo o arquivo antes de enviar' : image ? `${formatBytes(image.size)} · Clique para trocar` : 'Proporção recomendada 16:9'}</small></span></label><label className="field-full"><span>Texto alternativo <small>Descreva a imagem para leitores de tela e para busca</small></span><input name="image_alt" defaultValue={article?.image_alt || ''} maxLength={300} placeholder="Ex.: Equipe em reunião de alinhamento" /></label>{optimization && <p className="admin-image-note">{optimization}</p>}{(currentImage || image) && <button type="button" className="admin-delete-link" onClick={() => { const next = !(removeImage && !image); setRemoveImage(next); setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; }}>{removeImage && !image ? 'Manter imagem atual' : 'Remover imagem'} <Trash2 size={14} /></button>}</div></div></div><label><span>Tempo de leitura (minutos)</span><input name="minutes" type="number" min={1} max={30} defaultValue={article?.minutes || 4} /></label><label className="field-full"><span>Texto do artigo <i>*</i> <small>Separe os parágrafos com uma linha em branco.</small></span><textarea name="body" rows={12} defaultValue={article?.body.join('\n\n') || ''} required /></label><div className="admin-toggle-row field-full"><label><input type="checkbox" name="published" defaultChecked={article?.published || false} /><span><strong>Publicar conteúdo</strong><small>O artigo fica disponível no site quando esta opção está ativa.</small></span></label></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : article ? 'Salvar alterações' : 'Criar conteúdo'} <Check size={15} /></button></div></form></section></div>;
}

function UsersView({ items, currentUserId, onCreate, onEdit, onRefresh }: { items: AdminUser[]; currentUserId: string; onCreate: () => void; onEdit: (user: AdminUser) => void; onRefresh: () => void }) {
  const [query, setQuery] = useState(''); const [busyId, setBusyId] = useState(''); const [error, setError] = useState(''); const [feedback, setFeedback] = useState('');
  const filtered = items.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const activeCount = items.filter((user) => user.active).length;
  async function toggleActive(user: AdminUser) {
    const next = !user.active;
    const confirmation = next
      ? `Reativar o acesso de ${user.name || user.email} ao painel administrativo?`
      : `Desativar o acesso de ${user.name || user.email}? A pessoa perde o acesso imediatamente, mas o histórico de auditoria é mantido.`;
    if (!window.confirm(confirmation)) return;
    setBusyId(user.id); setError(''); setFeedback('');
    try { await apiPut(`/api/admin/users/${user.id}`, { active: next }); setFeedback(next ? 'Acesso reativado.' : 'Acesso desativado.'); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o acesso.'); }
    finally { setBusyId(''); }
  }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2>Gerencie os usuários do painel.</h2><p>Crie contas administrativas e desative acessos que não devem mais entrar. Toda ação fica registrada em auditoria.</p></div><button className="button button-primary" type="button" onClick={onCreate}><Plus size={17} /> Novo usuário</button></div>{error && <div className="admin-alert" role="alert">{error}<button type="button" onClick={onRefresh}>Tentar novamente</button></div>}{feedback && <div className="admin-inline-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback('')}><X size={14} /></button></div>}
    <div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" /></label><span>{activeCount} de {items.length} contas ativas</span></div>
    {filtered.length ? <div className="admin-table-card"><div className="admin-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>Pessoa</th><th>E-mail</th><th>Criada em</th><th>Último acesso</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td><strong>{user.name || user.email.split('@')[0]}</strong><small>{user.id === currentUserId ? 'Sua conta' : user.name ? 'Usuário administrativo' : 'Nome não informado · edite para preencher'}</small></td><td>{user.email}</td><td>{formatDate(user.created_at)}</td><td>{user.last_login_at ? formatDate(user.last_login_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Nunca acessou'}</td><td><span className={`admin-status-pill ${user.active ? 'status-live' : 'status-draft'}`}>{user.active ? 'Ativo' : 'Desativado'}</span>{user.totp_enabled && <span className="admin-status-pill status-ok">2FA</span>}</td><td><div className="admin-row-actions"><button type="button" title="Editar usuário" onClick={() => onEdit(user)}><UserCog size={16} /></button><button type="button" className={user.active ? 'admin-row-danger' : ''} title={user.active ? 'Desativar acesso' : 'Reativar acesso'} aria-label={user.active ? `Desativar acesso de ${user.name || user.email}` : `Reativar acesso de ${user.name || user.email}`} disabled={busyId === user.id} onClick={() => toggleActive(user)}>{user.active ? <Ban size={16} /> : <CircleCheck size={16} />}</button></div></td></tr>)}</tbody></table></div></div> : <AdminEmpty icon={<UserCog size={21} />} title={items.length ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'} text={items.length ? 'Tente outra busca.' : 'Crie uma conta administrativa para começar.'} />}
    <div className="admin-privacy-reminder"><ShieldCheck size={16} /><span>Desativar corta o acesso na hora e preserva o histórico registrado. Para trocar a senha de alguém, edite a conta e defina uma nova senha.</span></div>
  </div>;
}

function UserEditor({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, any> = { name: String(form.get('name') || '').trim(), active: form.get('active') === 'on' };
    const password = String(form.get('password') || '');
    if (password) body.password = password;
    if (!user) body.email = String(form.get('email') || '').trim();
    setBusy(true);
    try { if (user) await apiPut(`/api/admin/users/${user.id}`, body); else await apiPost('/api/admin/users', body); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o usuário.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="admin-job-modal user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><div className="admin-modal-head"><div><span className="eyebrow">CONTROLE DE ACESSO</span><h2 id="user-modal-title">{user ? 'Editar usuário' : 'Novo usuário'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="admin-editor-form" onSubmit={submit} noValidate><div className="form-grid"><label className="field-full"><span>Nome completo <i>*</i></span><input name="name" defaultValue={user?.name || ''} required maxLength={160} placeholder="Quem vai usar o painel" /></label><label className="field-full"><span>E-mail de acesso {!user && <i>*</i>}</span><input name="email" type="email" defaultValue={user?.email || ''} required={!user} readOnly={Boolean(user)} maxLength={254} autoComplete="off" placeholder="nome@empresa.com.br" />{user && <small className="field-hint">O e-mail de acesso não pode ser alterado depois da criação.</small>}</label><label className="field-full"><span>{user ? <>Nova senha <small>Deixe em branco para manter a atual</small></> : <>Senha inicial <i>*</i></>}</span><input name="password" type="password" autoComplete="new-password" required={!user} minLength={14} placeholder="Mínimo de 14 caracteres, com maiúsculas, minúsculas e números" /></label><div className="admin-toggle-row field-full"><label><input name="active" type="checkbox" defaultChecked={user ? user.active : true} /><span><strong>Acesso ativo</strong><small>Contas desativadas não entram no painel e perdem a sessão aberta.</small></span></label></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : user ? 'Salvar alterações' : 'Criar usuário'} <Check size={16} /></button></div></form></section></div>;
}

function HeroSlidesView({ items, onCreate, onEdit, onRefresh }: { items: AdminSlide[]; onCreate: () => void; onEdit: (slide: AdminSlide) => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [feedback, setFeedback] = useState('');
  async function move(slide: AdminSlide, direction: -1 | 1) {
    const index = items.findIndex((item) => item.id === slide.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const order = items.map((item) => item.id);
    [order[index], order[target]] = [order[target], order[index]];
    setBusy(slide.id); setError(''); setFeedback('');
    try { await apiPost('/api/admin/hero-slides/reorder', { order }); setFeedback('Ordem dos destaques atualizada.'); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível reordenar os destaques.'); }
    finally { setBusy(''); }
  }
  async function toggleActive(slide: AdminSlide) {
    setBusy(slide.id); setError(''); setFeedback('');
    try { await apiPut(`/api/admin/hero-slides/${slide.id}`, { active: !slide.active }); setFeedback(slide.active ? 'Destaque desativado: saiu da página inicial.' : 'Destaque ativado: já aparece na página inicial.'); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o destaque.'); }
    finally { setBusy(''); }
  }
  async function remove(slide: AdminSlide) {
    if (!window.confirm(`Excluir o destaque "${slide.navigationLabel}"? Para tirá-lo do site sem perder o conteúdo, prefira desativar.`)) return;
    setBusy(slide.id); setError(''); setFeedback('');
    try { await apiDelete(`/api/admin/hero-slides/${slide.id}`); setFeedback('Destaque excluído.'); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o destaque.'); }
    finally { setBusy(''); }
  }
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">APRESENTAÇÃO DO SITE</span><h2>Slides da página inicial.</h2><p>Edite os textos, botões e a imagem de cada destaque do carrossel. A ordem definida aqui é a ordem exibida no site.</p></div><button className="button button-primary" type="button" onClick={onCreate}><Plus size={17} /> Novo slide</button></div>{error && <div className="admin-alert" role="alert">{error}<button type="button" onClick={onRefresh}>Tentar novamente</button></div>}{feedback && <div className="admin-inline-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback('')}><X size={14} /></button></div>}
    <div className="admin-toolbar"><span>{items.length} slides · {items.filter((slide) => slide.active).length} ativos no carrossel</span><span><Presentation size={14} /> Alterações entram no ar ao salvar</span></div>
    {items.length ? <div className="hero-slide-list">{items.map((slide, index) => <article className="hero-slide-card" key={slide.id}><div className="hero-slide-thumb"><img src={slide.imageUrl} alt={slide.imageAlt || slide.navigationLabel} loading="lazy" />{!slide.active && <span className="hero-slide-thumb-off">Desativado</span>}</div><div className="hero-slide-body"><div className="hero-slide-head"><span className="hero-slide-index">{String(index + 1).padStart(2, '0')}</span><div><strong>{slide.navigationLabel}</strong><small>{slide.eyebrow}{slide.location ? ` · ${slide.location}` : ''}</small></div><span className={`admin-status-pill ${slide.active ? 'status-live' : 'status-draft'}`}>{slide.active ? 'No site' : 'Fora do site'}</span></div><p className="hero-slide-title">{slide.title.map((line) => line.text).join(' ')}</p><p className="hero-slide-text">{slide.text}</p><div className="hero-slide-links"><span>{slide.primary.label} → {slide.primary.to}</span>{slide.secondary.label && <span>{slide.secondary.label} → {slide.secondary.to}</span>}</div></div><div className="hero-slide-actions"><button type="button" title="Mover para cima" aria-label={`Mover ${slide.navigationLabel} para cima`} disabled={busy === slide.id || index === 0} onClick={() => move(slide, -1)}><ArrowUp size={15} /></button><button type="button" title="Mover para baixo" aria-label={`Mover ${slide.navigationLabel} para baixo`} disabled={busy === slide.id || index === items.length - 1} onClick={() => move(slide, 1)}><ArrowDown size={15} /></button><button type="button" title="Editar slide" aria-label={`Editar ${slide.navigationLabel}`} onClick={() => onEdit(slide)}><FileText size={15} /></button><button type="button" className={slide.active ? 'admin-row-danger' : ''} title={slide.active ? 'Desativar slide' : 'Ativar slide'} aria-label={slide.active ? `Desativar ${slide.navigationLabel}` : `Ativar ${slide.navigationLabel}`} disabled={busy === slide.id} onClick={() => toggleActive(slide)}>{slide.active ? <Ban size={15} /> : <CircleCheck size={15} />}</button><button type="button" className="admin-row-danger" title="Excluir slide" aria-label={`Excluir ${slide.navigationLabel}`} disabled={busy === slide.id || items.length <= 1} onClick={() => remove(slide)}><Trash2 size={15} /></button></div></article>)}</div> : <AdminEmpty icon={<Presentation size={21} />} title="Nenhum slide cadastrado." text="Crie o primeiro destaque para preencher o carrossel da página inicial." />}
    <div className="admin-privacy-reminder"><Presentation size={16} /><span>Deixe ao menos um slide ativo. Sem destaques ativos, a página inicial mantém o conteúdo revisado de fábrica.</span></div>
  </div>;
}

function SlideEditor({ slide, onClose, onSaved }: { slide: AdminSlide | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [optimizing, setOptimizing] = useState(false); const [optimization, setOptimization] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const currentImage = slide?.imageKey && slide?.imageUrl ? slide.imageUrl : '';
  const preview = previewUrl || (removeImage ? '' : currentImage);
  useEffect(() => {
    if (!image) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  async function chooseImage(next: File | null) {
    setError(''); setOptimization('');
    if (!next) { setImage(null); setRemoveImage(false); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(next.type)) { setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; setError('Use uma imagem JPG, PNG, WebP ou AVIF.'); return; }
    if (next.size > 5 * 1024 * 1024) { setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; setError('A imagem deve ter no máximo 5 MB.'); return; }
    setImage(next); setRemoveImage(false);
    // A imagem é reduzida no navegador: o arquivo enviado já sai leve para o site.
    setOptimizing(true);
    const result = await optimizeImage(next);
    setOptimizing(false);
    setImage(result.file);
    if (result.optimized) setOptimization(`Imagem otimizada de ${formatBytes(result.originalBytes)} para ${formatBytes(result.bytes)}.`);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (optimizing) { setError('Aguarde a otimização da imagem terminar.'); return; }
    const form = new FormData(event.currentTarget);
    form.set('active', form.get('active') === 'on' ? 'true' : 'false');
    form.set('remove_image', removeImage && !image ? 'true' : 'false');
    // O input ainda guarda o arquivo original: aqui entra a versão reduzida no navegador.
    if (image) form.set('image', image, image.name); else form.delete('image');
    setBusy(true);
    try { if (slide) await apiAdminForm(`/api/admin/hero-slides/${slide.id}`, form, 'PUT'); else await apiAdminForm('/api/admin/hero-slides', form); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o slide.'); }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="admin-job-modal slide-editor-modal" role="dialog" aria-modal="true" aria-labelledby="slide-modal-title"><div className="admin-modal-head"><div><span className="eyebrow">CARROSSEL DA PÁGINA INICIAL</span><h2 id="slide-modal-title">{slide ? 'Editar slide' : 'Novo slide'}</h2></div><button type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button></div><form className="admin-editor-form" onSubmit={submit} noValidate><div className="form-grid">
    <label className="field-full"><span>Etiqueta acima do título <i>*</i></span><input name="eyebrow" defaultValue={slide?.eyebrow || ''} required maxLength={120} placeholder="Ex.: CONSULTORIA DE PESSOAS & NEGÓCIOS" /></label>
    <label><span>Localidade / apoio da etiqueta</span><input name="location" defaultValue={slide?.location || ''} maxLength={120} placeholder="Ex.: RECIFE, PE" /></label>
    <label><span>Rótulo lateral</span><input name="side_label" defaultValue={slide?.sideLabel || ''} maxLength={120} placeholder="Ex.: HUMAN CAPITAL / RECIFE" /></label>
    <label className="field-full"><span>Nome do slide <i>*</i> <small>Aparece na navegação, nos controles e em leitores de tela.</small></span><input name="navigation_label" defaultValue={slide?.navigationLabel || ''} required maxLength={160} placeholder="Ex.: Recrutamento e seleção" /></label>
    <label className="field-full"><span>Título <i>*</i> <small>Uma linha por vez. As linhas são exibidas em sequência.</small></span><textarea name="title" rows={3} defaultValue={(slide?.title || []).map((line) => line.text).join('\n')} required placeholder={'Pessoas certas\ntransformam\nnegócios.'} /></label>
    <label><span>Linha destacada <small>Nº da linha com cor de destaque</small></span><input name="accent_line" type="number" min={0} max={6} defaultValue={slide?.accentLine || ''} placeholder="Ex.: 2" /></label>
    <label><span>Posição no carrossel <small>0 vem primeiro</small></span><input name="position" type="number" min={0} max={99} defaultValue={slide?.position ?? 0} /></label>
    <label className="field-full"><span>Texto de apoio <i>*</i></span><textarea name="text" rows={3} defaultValue={slide?.text || ''} required maxLength={600} /></label>
    <label><span>Botão principal: texto <i>*</i></span><input name="primary_label" defaultValue={slide?.primary?.label || ''} required maxLength={80} placeholder="Ex.: Encontre sua solução" /></label>
    <label><span>Botão principal: destino <i>*</i> <small>Caminho interno, começando com /</small></span><input name="primary_to" defaultValue={slide?.primary?.to || ''} required maxLength={300} placeholder="/solucoes" /></label>
    <label><span>Botão secundário: texto</span><input name="secondary_label" defaultValue={slide?.secondary?.label || ''} maxLength={80} placeholder="Ex.: Explore oportunidades" /></label>
    <label><span>Botão secundário: destino</span><input name="secondary_to" defaultValue={slide?.secondary?.to || ''} maxLength={300} placeholder="/vagas" /></label>
    <label className="field-full"><span>Rodapé do slide</span><input name="footnote" defaultValue={slide?.footnote || ''} maxLength={200} placeholder="Ex.: Pessoas no centro. Negócios em movimento." /></label>
    <div className="field-full admin-image-field"><span className="admin-image-field-title">Imagem de fundo <small>Opcional · JPG, PNG, WebP ou AVIF até 5 MB · sem envio, usa a imagem padrão do site</small></span><div className="admin-image-picker"><div className="admin-image-preview hero-image-preview">{preview ? <img src={preview} alt="Pré-visualização da imagem do slide" /> : <span className="admin-image-placeholder"><ImagePlus size={20} /><small>Sem imagem própria</small></span>}</div><div className="admin-image-controls"><label className="upload-zone upload-zone-compact" htmlFor="slide-image" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseImage(event.dataTransfer.files?.[0] || null); }}><input ref={imageInputRef} type="file" id="slide-image" name="image" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void chooseImage(event.target.files?.[0] || null)} /><span className="upload-icon"><ImagePlus size={18} /></span><span className="upload-copy"><strong>{optimizing ? 'Otimizando imagem…' : image ? image.name : preview ? 'Substituir imagem' : 'Enviar imagem'}</strong><small>{optimizing ? 'Reduzindo o arquivo antes de enviar' : image ? `${formatBytes(image.size)} · Clique para trocar` : 'Imagem larga, proporção recomendada 16:9'}</small></span></label>{optimization && <p className="admin-image-note">{optimization}</p>}<label><span>Texto alternativo <small>Obrigatório para acessibilidade</small></span><input name="image_alt" defaultValue={slide?.imageAlt || ''} maxLength={300} placeholder="Descreva a cena da imagem" /></label><label><span>Posição de foco <small>Ex.: center 52% ou 42% 52%</small></span><input name="image_position" defaultValue={slide?.imagePosition || 'center 52%'} maxLength={40} /></label>{(currentImage || image) && <button type="button" className="admin-delete-link" onClick={() => { const next = !(removeImage && !image); setRemoveImage(next); setImage(null); if (imageInputRef.current) imageInputRef.current.value = ''; }}>{removeImage && !image ? 'Manter imagem atual' : 'Remover imagem e voltar à padrão'} <Trash2 size={14} /></button>}</div></div></div>
    <div className="admin-toggle-row field-full"><label><input type="checkbox" name="active" defaultChecked={slide ? slide.active : true} /><span><strong>Exibir este slide no site</strong><small>Slides desativados ficam guardados no painel, fora do carrossel.</small></span></label></div>
  </div>{error && <div className="form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancelar</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : slide ? 'Salvar alterações' : 'Criar slide'} <Check size={16} /></button></div></form></section></div>;
}

function SecurityView() {
  const [state, setState] = useState<SecurityState | null>(null);
  const [error, setError] = useState(''); const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState(''); const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]); const [copied, setCopied] = useState('');
  useEffect(() => { apiGet<SecurityState>('/api/admin/security').then(setState).catch((reason: Error) => setError(reason.message)); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setFeedback('');
    try { await action(); } finally { setBusy(false); }
  }
  async function startSetup() { await run(async () => { const data = await apiPost<{ secret: string; uri: string }>('/api/admin/security/totp/setup', {}); setSetup(data); setCodes([]); }); }
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      try {
        const data = await apiPost<{ recovery_codes: string[]; state: SecurityState }>('/api/admin/security/totp/enable', { code });
        setCodes(data.recovery_codes); setState(data.state); setSetup(null); setCode('');
        setFeedback('Verificação em duas etapas ativada. Guarde os códigos de recuperação agora: eles não são exibidos de novo.');
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível ativar.'); }
    });
  }
  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      try {
        const data = await apiPost<{ state: SecurityState }>('/api/admin/security/totp/disable', { password });
        setState(data.state); setPassword(''); setCodes([]); setFeedback('Verificação em duas etapas desativada.');
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível desativar.'); }
    });
  }
  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      try {
        const data = await apiPost<{ recovery_codes: string[]; state: SecurityState }>('/api/admin/security/recovery-codes', { password });
        setCodes(data.recovery_codes); setState(data.state); setPassword('');
        setFeedback('Novos códigos gerados. Os anteriores deixaram de funcionar.');
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar os códigos.'); }
    });
  }
  async function copy(value: string, tag: string) {
    try { await navigator.clipboard.writeText(value); setCopied(tag); setTimeout(() => setCopied(''), 2500); }
    catch { setError('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.'); }
  }
  if (!state) return <div className="admin-list-view">{error ? <div className="admin-alert" role="alert">{error}</div> : <div className="admin-loading"><span className="loading-spinner" />Carregando o estado de segurança…</div>}</div>;
  const confirmed = state.totp_confirmed_at ? formatDate(state.totp_confirmed_at, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">PROTEÇÃO DO ACESSO</span><h2>Segurança da sua conta.</h2><p>Quem entra no painel vê currículos, dados de contato e informações salariais de candidatos. A verificação em duas etapas soma um código do seu celular à senha.</p></div><span className={`admin-count-chip ${state.totp_enabled ? 'chip-live' : ''}`}>{state.totp_enabled ? '2FA ativo' : '2FA desativado'}</span></div>
    {error && <div className="admin-alert" role="alert">{error}</div>}
    {feedback && <div className="admin-notice" role="status"><ShieldCheck size={17} /><div><strong>{feedback}</strong></div></div>}
    {!state.encryption_available && <div className="admin-notice admin-notice-warning" role="status"><MailWarning size={17} /><div><strong>APP_SECRET não está definido no ambiente.</strong><p>Sem essa chave, a senha do SMTP guardada pelo painel fica em texto puro no arquivo do banco. Defina APP_SECRET no ambiente de execução para protegê-la.</p></div></div>}
    <section className="admin-panel-card"><div className="admin-card-heading"><div><span className="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span><h3>{state.totp_enabled ? 'Ativa nesta conta' : 'Adicione um código do celular à senha'}</h3></div>{state.totp_enabled && <span className="admin-status-pill status-ok">Verificado</span>}</div>
      {state.totp_enabled ? <div className="admin-security-sections">
        <div className="admin-security-facts"><span><small>Ativada em</small><strong>{confirmed || '—'}</strong></span><span><small>Códigos de recuperação</small><strong>{state.recovery_codes_left} restantes</strong></span><span><small>Aplicativos aceitos</small><strong>Google, Authy, 1Password, Microsoft</strong></span></div>
        <p className="admin-security-copy">Para entrar, além da senha, é pedido o código de seis dígitos do aplicativo. Se o celular não estiver à mão, use um código de recuperação — cada um funciona uma única vez.</p>
        <div className="admin-security-forms">
          <form className="admin-inline-form" onSubmit={regenerate}><label><span>Gerar novos códigos de recuperação</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Confirme sua senha" /></label><button className="button button-outline button-small" type="submit" disabled={busy}>{busy ? 'Gerando…' : 'Gerar novos códigos'}</button></form>
          <form className="admin-inline-form" onSubmit={disable}><label><span>Desativar a verificação em duas etapas</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Confirme sua senha" /></label><button className="admin-delete-link" type="submit" disabled={busy}><Ban size={14} /> Desativar</button></form>
        </div>
      </div> : <div className="admin-security-sections">
        {!setup ? <>
          <p className="admin-security-copy">Você vai precisar de um aplicativo autenticador no celular. O processo leva um minuto: o painel mostra uma chave, você digita no aplicativo e confirma com o código gerado.</p>
          <div className="admin-backup-actions"><button className="button button-primary button-small" type="button" disabled={busy} onClick={() => { void startSetup(); }}><KeyRound size={15} /> Começar a ativação</button></div>
        </> : <>
          <ol className="admin-security-steps">
            <li>Abra o aplicativo autenticador e escolha adicionar uma conta.</li>
            <li>Digite a chave abaixo (ou cole o endereço <code>otpauth://</code>, quando o aplicativo aceitar):</li>
          </ol>
          <div className="admin-secret-box"><code>{setup.secret.match(/.{1,4}/g)?.join(' ') || setup.secret}</code><button type="button" className="admin-copy-button" onClick={() => { void copy(setup.secret, 'secret'); }}><Copy size={14} /> {copied === 'secret' ? 'Copiado' : 'Copiar chave'}</button></div>
          <p className="admin-security-copy">No aplicativo: <strong>{state.email}</strong> · SHA-1 · 6 dígitos · 30 segundos.</p>
          <form className="admin-inline-form" onSubmit={enable}><label><span>Confirme com o código de seis dígitos</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required placeholder="000000" /></label><button className="button button-primary button-small" type="submit" disabled={busy}>{busy ? 'Confirmando…' : 'Ativar agora'}</button><button className="button button-outline button-small" type="button" onClick={() => { setSetup(null); setCode(''); }}>Cancelar</button></form>
        </>}
      </div>}
    </section>
    {codes.length > 0 && <section className="admin-panel-card admin-recovery-card"><div className="admin-card-heading"><div><span className="eyebrow">GUARDE AGORA</span><h3>Códigos de recuperação</h3></div></div><p className="admin-security-copy">Cada código entra uma única vez e substitui o aplicativo. Guarde em local seguro e fora do computador de trabalho — esta lista não será mostrada novamente.</p><div className="admin-recovery-codes">{codes.map((item) => <code key={item}>{item}</code>)}</div><div className="admin-backup-actions"><button type="button" className="button button-outline button-small" onClick={() => { void copy(codes.join('\n'), 'all'); }}><Copy size={14} /> {copied === 'all' ? 'Códigos copiados' : 'Copiar todos'}</button></div></section>}
  </div>;
}

function NotificationsView({ settings, onRefresh }: { settings: EmailSettings | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [feedback, setFeedback] = useState('');
  const [testTo, setTestTo] = useState(''); const [testing, setTesting] = useState(false);
  if (!settings) return <AdminEmpty icon={<Mail size={21} />} title="Configurações indisponíveis." text="Não foi possível carregar as configurações de notificação." />;
  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setFeedback('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, any> = {
      SMTP_HOST: String(form.get('SMTP_HOST') || '').trim(),
      SMTP_PORT: String(form.get('SMTP_PORT') || '').trim(),
      SMTP_SECURE: form.get('SMTP_SECURE') === 'on',
      SMTP_USER: String(form.get('SMTP_USER') || '').trim(),
      EMAIL_FROM: String(form.get('EMAIL_FROM') || '').trim(),
      LEADS_NOTIFICATION_EMAIL: String(form.get('LEADS_NOTIFICATION_EMAIL') || '').trim(),
    };
    // Senha em branco mantém a atual: só enviamos quando o campo foi preenchido.
    const password = String(form.get('SMTP_PASS') || '');
    if (password) body.SMTP_PASS = password;
    setBusy(true);
    try { await apiPut('/api/admin/email-settings', body); setFeedback('Configuração de e-mail salva.'); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a configuração.'); }
    finally { setBusy(false); }
  }
  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setFeedback(''); setTesting(true);
    try { const result = await apiPost<{ ok: boolean; message: string }>('/api/admin/email-settings/test', { to: testTo }); setFeedback(result.message || 'Teste enviado.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o teste.'); }
    finally { setTesting(false); }
  }
  const fromPanel = (key: string) => settings.stored_in_panel.includes(key);
  const health = settings.health;
  const events = settings.recent_events || [];
  const eventLabels: Record<string, string> = { sent: 'Enviado', skipped: 'Não enviado', failed: 'Falhou' };
  <section className="admin-panel-card admin-email-health">
    <div className="admin-card-heading"><div><span className="eyebrow">SAÚDE DA ENTREGA</span><h3>O que saiu nos últimos envios.</h3></div>{health?.attention && <span className="admin-status-pill status-alert">Requer atenção</span>}</div>
    <div className="admin-health-grid">
      <div><small>Último envio confirmado</small><strong>{health?.last_success_at ? formatDate(health.last_success_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nenhum ainda'}</strong></div>
      <div><small>Falhas nas últimas 24h</small><strong>{health?.failures_24h ?? 0}</strong></div>
      <div><small>Última falha</small><strong>{health?.last_failure_at ? formatDate(health.last_failure_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nenhuma'}</strong></div>
    </div>
    {settings.SMTP_PASS_SET && !settings.secrets_protected && settings.encryption_available && <div className="admin-notice admin-notice-warning" role="status"><ShieldCheck size={17} /><div><strong>A senha guardada ainda está em texto puro.</strong><p>Salve a senha novamente para que ela passe a ser protegida: a aplicação já reescreve o valor na primeira inicialização com <code>APP_SECRET</code> definido, mas um novo salvamento garante a troca.</p></div></div>}
    {settings.SMTP_PASS_SET && !settings.pass_readable && <div className="admin-notice admin-notice-danger" role="alert"><MailWarning size={17} /><div><strong>A senha guardada não pode ser aberta.</strong><p>A chave <code>APP_SECRET</code> mudou ou está ausente no ambiente, e o envio de e-mail vai falhar até a senha ser informada de novo.</p></div></div>}
    {settings.SMTP_PASS_SET && settings.secrets_protected && <div className="admin-notice" role="status"><ShieldCheck size={17} /><div><strong>Senha do SMTP protegida.</strong><p>O valor fica cifrado (AES-256-GCM) no arquivo do banco e nunca é devolvido pela API nem escrito na auditoria.</p></div></div>}
    {!settings.encryption_available && <div className="admin-notice admin-notice-warning" role="status"><MailWarning size={17} /><div><strong>Sem <code>APP_SECRET</code> no ambiente.</strong><p>A senha digitada aqui fica em texto puro no arquivo do banco. Defina a chave no ambiente para protegê-la.</p></div></div>}
    {health?.attention && <div className="admin-alert" role="alert">O último resultado foi uma falha. Mensagens para candidatos e para a equipe podem estar sendo recusadas pelo provedor. Erro: <code>{health.last_error}</code></div>}
    {events.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Quando</th><th>Mensagem</th><th>Destino</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDate(event.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td><strong>{event.template_key || (event.kind === 'test' ? 'Teste de configuração' : 'Sem modelo')}</strong></td><td>{event.recipient || '—'}</td><td><span className={`admin-status-pill ${event.status === 'failed' ? 'status-alert' : event.status === 'sent' ? 'status-ok' : ''}`}>{eventLabels[event.status] || event.status}</span></td><td>{event.detail || '—'}</td></tr>)}</tbody></table></div> : <div className="admin-empty-inline"><Mail size={19} /><p>Nenhum envio registrado ainda. Assim que um formulário for respondido, o resultado de cada mensagem aparece aqui.</p></div>}
  </section>
  return <div className="admin-list-view"><div className="admin-page-intro"><div><span className="eyebrow">ENTREGA DE MENSAGENS</span><h2>Notificações por e-mail.</h2><p>Configure o servidor SMTP, acompanhe a entrega e revise o texto de cada mensagem enviada pelos formulários de contato, candidatura e currículo.</p></div><span className={`admin-count-chip ${settings.configured ? 'chip-live' : 'chip-off'}`}>{settings.configured ? 'E-mail ativo' : 'E-mail desativado'}</span></div>{error && <div className="admin-alert" role="alert">{error}</div>}{feedback && <div className="admin-inline-feedback" role="status">{feedback}<button type="button" onClick={() => setFeedback('')}><X size={14} /></button></div>}
    {!settings.configured && <div className="admin-notice admin-notice-warning" role="status"><MailWarning size={17} /><div><strong>Nenhum e-mail está sendo enviado.</strong><p>Os formulários continuam gravando contatos, candidaturas e currículos neste painel, mas confirmações e avisos só saem depois que o servidor SMTP e o remetente estiverem configurados abaixo.</p></div></div>}
    <section className="admin-panel-card"><div className="admin-card-heading"><div><span className="eyebrow">SERVIDOR DE E-MAIL</span><h3>Configuração SMTP</h3></div><span className="admin-card-note">Os valores salvos aqui têm prioridade sobre as variáveis de ambiente.</span></div>
      <form className="admin-editor-form" onSubmit={saveSmtp} noValidate><div className="form-grid">
        <label><span>Servidor (host) <i>*</i></span><input name="SMTP_HOST" defaultValue={settings.SMTP_HOST} maxLength={253} placeholder="smtp.seuprovedor.com" />{fromPanel('SMTP_HOST') && <small className="field-hint">Definido no painel</small>}</label>
        <label><span>Porta</span><input name="SMTP_PORT" type="number" min={1} max={65535} defaultValue={settings.SMTP_PORT || 587} /></label>
        <label><span>Usuário</span><input name="SMTP_USER" defaultValue={settings.SMTP_USER} maxLength={254} autoComplete="off" placeholder="usuario@seudominio.com.br" /></label>
        <label><span>Senha</span><input name="SMTP_PASS" type="password" autoComplete="new-password" maxLength={512} placeholder={settings.SMTP_PASS_SET ? 'Já definida · deixe em branco para manter' : 'Senha do provedor SMTP'} /><small className="field-hint">{settings.SMTP_PASS_SET ? 'Guardada no banco da aplicação. Em branco, mantém a atual.' : 'Nunca exibida de volta após salvar.'}</small></label>
        <label className="field-full"><span>Remetente <i>*</i></span><input name="EMAIL_FROM" defaultValue={settings.EMAIL_FROM} maxLength={254} placeholder="IM Personnel <contato@seudominio.com.br>" />{fromPanel('EMAIL_FROM') && <small className="field-hint">Definido no painel</small>}</label>
        <label className="field-full"><span>Caixa que recebe os avisos da equipe <small>Contatos, candidaturas e currículos novos</small></span><input name="LEADS_NOTIFICATION_EMAIL" type="email" defaultValue={settings.LEADS_NOTIFICATION_EMAIL} maxLength={254} placeholder="contato@seudominio.com.br" /></label>
        <div className="admin-toggle-row field-full"><label><input type="checkbox" name="SMTP_SECURE" defaultChecked={settings.SMTP_SECURE} /><span><strong>Conexão segura (SSL/TLS)</strong><small>Use para porta 465. Deixe desmarcado para 587 com STARTTLS.</small></span></label></div>
      </div><div className="admin-modal-actions"><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configuração'} <Check size={16} /></button></div></form>
      <form className="admin-test-form" onSubmit={sendTest}><label><span>Enviar mensagem de teste para</span><input value={testTo} type="email" onChange={(event) => setTestTo(event.target.value)} maxLength={254} placeholder={settings.LEADS_NOTIFICATION_EMAIL || 'destino@seudominio.com.br'} /></label><button type="submit" className="button button-outline button-small" disabled={testing || !settings.configured}>{testing ? 'Enviando…' : 'Testar conexão'} <Send size={14} /></button><small>Salve a configuração antes de testar.</small></form>
    </section>
    <section className="admin-panel-card"><div className="admin-card-heading"><div><span className="eyebrow">MENSAGENS ENVIADAS</span><h3>Modelos de e-mail</h3></div><span className="admin-card-note">Use as variáveis entre chaves duplas; elas são preenchidas a cada envio.</span></div>
      <div className="admin-accordion-list">{settings.templates.map((template) => <TemplateCard key={template.key} template={template} onChanged={onRefresh} />)}</div>
    </section>
    <div className="admin-privacy-reminder"><ShieldCheck size={16} /><span>A senha SMTP fica gravada no banco da aplicação, no mesmo volume dos currículos. Proteja o disco, restrinja backups e prefira credenciais exclusivas para envio.</span></div>
  </div>;
}

function TemplateCard({ template, onChanged }: { template: EmailTemplate; onChanged: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSaved('');
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try { await apiPut(`/api/admin/email-templates/${template.key}`, { subject: String(form.get('subject') || ''), body: String(form.get('body') || ''), enabled: form.get('enabled') === 'on' }); setSaved('Modelo salvo.'); setPreview(null); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o modelo.'); }
    finally { setBusy(false); }
  }
  async function loadPreview() {
    setError('');
    try { setPreview(await apiPost<{ subject: string; body: string }>(`/api/admin/email-templates/${template.key}/preview`, {})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar a prévia.'); }
  }
  return <details className="admin-record-card"><summary><span className="admin-record-avatar template-avatar"><Mail size={17} /></span><span className="admin-record-main"><strong>{template.label}</strong><small>{template.audience} · {template.subject}</small></span><span className={`admin-status-pill ${template.enabled ? 'status-live' : 'status-draft'}`}>{template.enabled ? 'Enviando' : 'Desligado'}</span><ChevronDown size={17} /></summary>
    <div className="admin-record-detail">
      <div className="template-variables"><span>VARIÁVEIS DISPONÍVEIS</span><div>{template.variables.map((name) => <code key={name}>{`{{${name}}}`}</code>)}</div></div>
      <form className="admin-editor-form" onSubmit={save} noValidate><div className="form-grid">
        <label className="field-full"><span>Assunto <i>*</i></span><input name="subject" defaultValue={template.subject} required maxLength={200} /></label>
        <label className="field-full"><span>Mensagem <small>Texto simples, com quebras de linha</small></span><textarea name="body" rows={9} defaultValue={template.body} maxLength={4000} /></label>
        <div className="admin-toggle-row field-full"><label><input type="checkbox" name="enabled" defaultChecked={template.enabled} /><span><strong>Enviar esta mensagem</strong><small>Desligado, o formulário segue gravando os dados sem disparar este e-mail.</small></span></label></div>
      </div>{error && <div className="form-error" role="alert">{error}</div>}{saved && <div className="admin-inline-feedback" role="status">{saved}</div>}<div className="admin-modal-actions"><button type="button" className="button button-outline button-small" onClick={loadPreview}>Ver prévia <Eye size={14} /></button><button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? 'Salvando…' : 'Salvar modelo'} <Check size={14} /></button></div></form>
      {preview && <div className="template-preview" role="status"><small>PRÉVIA COM DADOS DE EXEMPLO</small><strong>{preview.subject}</strong><pre>{preview.body}</pre></div>}
    </div>
  </details>;
}

function AdminEmpty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="admin-empty-state"><span className="admin-empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}
