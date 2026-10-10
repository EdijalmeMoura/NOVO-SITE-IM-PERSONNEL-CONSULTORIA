import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { CookieConsent } from './components/CookieConsent';
import { Home } from './pages/Home';
import { About } from './pages/About';
import { Solutions } from './pages/Solutions';
import { ServiceDetail } from './pages/ServiceDetail';
import { Careers } from './pages/Careers';
import { JobDetail } from './pages/JobDetail';
import { Application } from './pages/Application';
import { TalentBank } from './pages/TalentBank';
import { Contact } from './pages/Contact';
import { Insights, InsightDetail } from './pages/Insights';
import { CookiesPage, PrivacyPage } from './pages/Legal';
import { AdminPanel } from './pages/Admin';
import { InitialSetup } from './pages/InitialSetup';
import { usePageMeta } from './hooks/usePageMeta';

function PublicLayout({ children }: { children: ReactNode }) {
  return <><SiteHeader />{children}<SiteFooter /><CookieConsent /></>;
}
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}
function NotFound() {
  usePageMeta('Página não encontrada', 'A página que você procura não foi localizada.', '/404', true);
  return <main className="not-found-page"><div className="container"><span className="eyebrow">ERRO 404 / CAMINHO NÃO ENCONTRADO</span><span className="not-found-number">404</span><h1>Esta página tomou outro caminho.</h1><p>Confira o endereço ou retorne à página inicial para continuar navegando.</p><Link className="button button-primary" to="/">Voltar ao início</Link></div></main>;
}
function RouteTree() {
  return <><ScrollToTop /><Routes>
    <Route path="/admin/*" element={<AdminPanel />} />
    <Route path="/configuracao-inicial" element={<PublicLayout><InitialSetup /></PublicLayout>} />
    <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
    <Route path="/sobre" element={<PublicLayout><About /></PublicLayout>} />
    <Route path="/solucoes" element={<PublicLayout><Solutions /></PublicLayout>} />
    <Route path="/servicos/:slug" element={<PublicLayout><ServiceDetail /></PublicLayout>} />
    <Route path="/vagas" element={<PublicLayout><Careers /></PublicLayout>} />
    <Route path="/vagas/:slug/candidatar" element={<PublicLayout><Application /></PublicLayout>} />
    <Route path="/vagas/:slug" element={<PublicLayout><JobDetail /></PublicLayout>} />
    <Route path="/curriculo" element={<PublicLayout><TalentBank /></PublicLayout>} />
    <Route path="/banco-de-talentos" element={<PublicLayout><TalentBank /></PublicLayout>} />
    <Route path="/solicitar-proposta" element={<PublicLayout><Contact /></PublicLayout>} />
    <Route path="/contato" element={<PublicLayout><Contact /></PublicLayout>} />
    <Route path="/conteudos" element={<PublicLayout><Insights /></PublicLayout>} />
    <Route path="/conteudos/:slug" element={<PublicLayout><InsightDetail /></PublicLayout>} />
    <Route path="/privacidade" element={<PublicLayout><PrivacyPage /></PublicLayout>} />
    <Route path="/cookies" element={<PublicLayout><CookiesPage /></PublicLayout>} />
    <Route path="/404" element={<PublicLayout><NotFound /></PublicLayout>} />
    <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
  </Routes></>;
}

export default function App() {
  return <BrowserRouter><RouteTree /></BrowserRouter>;
}
