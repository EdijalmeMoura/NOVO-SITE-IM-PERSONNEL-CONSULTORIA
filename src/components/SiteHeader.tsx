import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { services } from '../data';
import { Logo } from './Logo';

export function SiteHeader() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 30);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const isHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMobileOpen(false); setSolutionsOpen(false); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKeyDown); };
  }, []);
  useEffect(() => { setMobileOpen(false); setSolutionsOpen(false); }, [location.pathname]);
  useEffect(() => {
    document.body.classList.toggle('menu-is-open', mobileOpen);
    return () => document.body.classList.remove('menu-is-open');
  }, [mobileOpen]);

  return (
    <header className={`site-header ${isHome && !scrolled ? 'header-on-hero' : 'header-solid'} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="header-inner">
        <Logo light={isHome && !scrolled && !mobileOpen} />
        <nav id="main-navigation" className={`main-nav ${mobileOpen ? 'nav-open' : ''}`} aria-label="Navegação principal">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Início</NavLink>
          <NavLink to="/sobre" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>A empresa</NavLink>
          <div className={`nav-dropdown ${solutionsOpen ? 'dropdown-open' : ''}`}>
            <Link to="/solucoes" className={`nav-link nav-solutions ${location.pathname.startsWith('/servicos') || location.pathname === '/solucoes' ? 'active' : ''}`}>Soluções <ChevronDown size={14} aria-hidden="true" /></Link>
            <div className="nav-dropdown-menu">
              <span className="dropdown-caption">Soluções para empresas</span>
              {services.map((service) => <Link key={service.slug} to={`/servicos/${service.slug}`}>{service.title}<ArrowUpRight size={14} /></Link>)}
              <Link className="dropdown-all" to="/solucoes">Conheça todas as soluções <ArrowUpRight size={14} /></Link>
            </div>
            <button className="dropdown-toggle" type="button" onClick={() => setSolutionsOpen((value) => !value)} aria-label="Abrir menu de soluções" aria-expanded={solutionsOpen}><ChevronDown size={14} /></button>
          </div>
          <NavLink to="/vagas" className={({ isActive }) => `nav-link ${isActive || location.pathname.startsWith('/vagas/') ? 'active' : ''}`}>Vagas</NavLink>
          <NavLink to="/conteudos" className={({ isActive }) => `nav-link ${isActive || location.pathname.startsWith('/conteudos/') ? 'active' : ''}`}>Conteúdos</NavLink>
          <NavLink to="/contato" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>Contato</NavLink>
          <div className="mobile-nav-actions">
            <Link className="mobile-candidate" to="/curriculo">Sou candidato <ArrowUpRight size={15} /></Link>
            <Link className="button button-primary button-mobile" to="/solicitar-proposta">Quero contratar <ArrowUpRight size={16} /></Link>
          </div>
        </nav>
        <div className="header-actions">
          <Link className="candidate-link" to="/curriculo">Sou candidato</Link>
          <Link className="button button-primary header-cta" to="/solicitar-proposta">Quero contratar <ArrowUpRight size={16} /></Link>
        </div>
        <button type="button" className="mobile-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={mobileOpen} aria-controls="main-navigation">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    </header>
  );
}
