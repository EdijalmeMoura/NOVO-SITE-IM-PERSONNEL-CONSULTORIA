import { ArrowRight, ArrowUpRight, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { services } from '../data';
import { Logo } from './Logo';
import { companyContact } from '../lib/contact';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top container">
        <div className="footer-brand-col">
          <Logo light />
          <p>Conectamos talentos, lideranças e organizações com escuta, estratégia e cuidado em cada escolha.</p>
          <span className="footer-location"><span className="location-dot" /> Recife · Pernambuco</span>
        </div>
        <div className="footer-links-col">
          <h3>Explore</h3>
          <Link to="/sobre">A empresa</Link>
          <Link to="/solucoes">Soluções</Link>
          <Link to="/vagas">Vagas disponíveis</Link>
          <Link to="/conteudos">Conteúdos e insights</Link>
        </div>
        <div className="footer-links-col footer-services-col">
          <h3>Soluções</h3>
          {services.slice(0, 4).map((service) => <Link key={service.slug} to={`/servicos/${service.slug}`}>{service.title}</Link>)}
          <Link to="/solucoes">Ver todas <ArrowRight size={14} /></Link>
        </div>
        <div className="footer-contact-col">
          <h3>Vamos conversar?</h3>
          <p>Conte sobre o desafio da sua empresa. Nossa equipe poderá dar o próximo passo com você.</p>
          <a className="footer-contact-detail" href={`tel:${companyContact.phoneHref}`}><Phone size={14} /><span>{companyContact.phoneDisplay}</span></a>
          <a className="footer-contact-detail" href={`mailto:${companyContact.email}`}><Mail size={14} /><span>{companyContact.email}</span></a>
          <a className="footer-contact-detail footer-contact-address" href={companyContact.mapsHref} target="_blank" rel="noreferrer"><MapPin size={14} /><span>{companyContact.addressLine}<br />Recife · Pernambuco, Brasil</span></a>
          <Link className="footer-contact-link" to="/contato">Fale com a IM Personnel <ArrowRight size={16} /></Link>
          <div className="footer-socials">
            <a href="https://br.linkedin.com/company/impersonnel-consultoria" target="_blank" rel="noreferrer" aria-label="IM Personnel no LinkedIn"><Linkedin size={17} /></a>
            <a href={companyContact.whatsappHref} target="_blank" rel="noreferrer" aria-label="Fale com a IM Personnel pelo WhatsApp"><span className="wa-mark">w</span></a>
          </div>
        </div>
      </div>
      <div className="footer-bottom container">
        <span>© {new Date().getFullYear()} IM Personnel Consultoria. Todos os direitos reservados.</span>
        <div><Link to="/privacidade">Privacidade</Link><Link to="/cookies">Preferências de cookies</Link><Link to="/admin">Acesso administrativo <ArrowUpRight size={12} /></Link></div>
      </div>
    </footer>
  );
}
