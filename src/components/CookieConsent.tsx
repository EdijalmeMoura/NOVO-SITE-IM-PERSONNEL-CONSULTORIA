import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Settings2, X } from 'lucide-react';
import { readCookiePreferences, saveCookiePreferences } from '../lib/cookies';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [personalization, setPersonalization] = useState(false);
  useEffect(() => { const saved = readCookiePreferences(); setVisible(!saved); if (saved) { setAnalytics(saved.analytics); setPersonalization(saved.personalization); } }, []);
  if (!visible) return null;
  const save = () => { saveCookiePreferences({ analytics, personalization }); setVisible(false); };
  return (
    <aside className="cookie-banner" aria-label="Preferências de cookies">
      <button className="cookie-close" type="button" aria-label="Fechar aviso de cookies" onClick={save}><X size={17} /></button>
      <div className="cookie-icon"><Settings2 size={19} /></div>
      <div className="cookie-copy">
        <strong>Privacidade em primeiro lugar.</strong>
        <p>Usamos recursos essenciais para o funcionamento do site. Ferramentas opcionais de análise ou publicidade não estão habilitadas neste ambiente.</p>
        <Link to="/cookies">Saiba mais sobre suas preferências</Link>
        {customize && <div className="cookie-options">
          <label><input type="checkbox" checked readOnly /> <span><b>Essenciais</b><small>Necessários para navegação e segurança.</small></span></label>
          <label><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /> <span><b>Análise</b><small>Ajuda a entender a navegação. Não há ferramenta ativa no momento.</small></span></label>
          <label><input type="checkbox" checked={personalization} onChange={(event) => setPersonalization(event.target.checked)} /> <span><b>Personalização</b><small>Preferências opcionais. Não há ferramenta ativa no momento.</small></span></label>
        </div>}
      </div>
      <div className="cookie-actions">
        {customize ? <button type="button" className="button button-primary cookie-save" onClick={save}><Check size={15} /> Salvar escolhas</button> : <button type="button" className="button button-outline cookie-config" onClick={() => setCustomize(true)}>Preferências</button>}
        {!customize && <button type="button" className="cookie-essential" onClick={save}>Somente essenciais</button>}
      </div>
    </aside>
  );
}
