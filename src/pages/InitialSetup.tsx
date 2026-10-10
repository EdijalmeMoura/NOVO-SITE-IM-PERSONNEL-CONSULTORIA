import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, apiPost } from '../lib/api';
import { usePageMeta } from '../hooks/usePageMeta';

const passwordIsStrong = (password: string) => password.length >= 14 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

export function InitialSetup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  usePageMeta('Configuração inicial', 'Crie o primeiro acesso administrativo da IM Personnel.', '/configuracao-inicial', true);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um endereço de e-mail válido.');
      return;
    }
    if (!passwordIsStrong(password)) {
      setError('A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('A confirmação não corresponde à senha informada.');
      return;
    }

    setBusy(true);
    try {
      await apiPost('/api/setup/initial-admin', { email, password });
      setPassword('');
      setPasswordConfirmation('');
      setCompleted(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setError('A configuração inicial já foi concluída. Entre no painel com uma conta administrativa existente.');
      else setError(reason instanceof Error ? reason.message : 'Não foi possível criar o acesso agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="initial-setup-page">
    <div className="container initial-setup-layout">
      <section className="initial-setup-intro" aria-labelledby="initial-setup-title">
        <span className="eyebrow eyebrow-light">IM PERSONNEL / ACESSO ADMINISTRATIVO</span>
        <div className="initial-setup-symbol" aria-hidden="true"><KeyRound size={27} /></div>
        <h1 id="initial-setup-title">Configure o <em>primeiro acesso.</em></h1>
        <p>Use esta etapa somente na instalação inicial. Depois que a primeira conta for criada, os demais acessos devem ser cadastrados pela operação autorizada.</p>
        <div className="initial-setup-safeguard"><ShieldCheck size={17} /><span>Esta página deixa de criar contas assim que o primeiro administrador é registrado.</span></div>
      </section>

      <section className="initial-setup-card" aria-labelledby="initial-setup-form-title">
        {completed ? <div className="initial-setup-success" role="status">
          <span><CheckCircle2 size={28} /></span>
          <div><span className="eyebrow">CONFIGURAÇÃO CONCLUÍDA</span><h2>Conta inicial criada.</h2><p>O acesso de <strong>{email.trim().toLowerCase()}</strong> já pode entrar no painel administrativo.</p></div>
          <Link className="button button-primary" to="/admin">Entrar no painel <ArrowRight size={16} /></Link>
        </div> : <>
          <div className="initial-setup-card-heading"><span className="eyebrow">ETAPA ÚNICA</span><h2 id="initial-setup-form-title">Criar administrador</h2><p>Não há credenciais padrão no sistema. Escolha um e-mail institucional e uma senha forte.</p></div>
          <form className="initial-setup-form" onSubmit={submit} noValidate>
            <label><span>E-mail administrativo</span><input type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="nome@empresa.com.br" /></label>
            <label><span>Senha</span><input type="password" name="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={14} placeholder="Crie uma senha forte" /></label>
            <label><span>Confirmar senha</span><input type="password" name="password_confirmation" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required minLength={14} placeholder="Repita a senha" /></label>
            <p className="initial-setup-password-help">Use pelo menos 14 caracteres, incluindo letras maiúsculas, minúsculas e números.</p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Criando acesso…' : 'Criar primeiro acesso'} <ArrowRight size={16} /></button>
          </form>
          <p className="initial-setup-signin">Já existe uma conta? <Link to="/admin">Entrar no painel</Link></p>
        </>}
      </section>
    </div>
  </main>;
}
