import { ArrowRight, ArrowUpRight, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { services } from '../data';
import { Logo } from './Logo';
import { companyContact } from '../lib/contact';

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M20.52 3.48A11.82 11.82 0 0 0 12.1 0C5.55 0 .22 5.33.22 11.88c0 2.1.55 4.16 1.6 5.98L.12 24l6.28-1.65a11.9 11.9 0 0 0 5.69 1.45h.01c6.55 0 11.88-5.33 11.89-11.88a11.8 11.8 0 0 0-3.47-8.44ZM12.1 21.78h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.22-3.73.98.99-3.64-.24-.37a9.85 9.85 0 0 1-1.52-5.27c0-5.46 4.45-9.9 9.91-9.9 2.65 0 5.14 1.03 7.02 2.91a9.85 9.85 0 0 1 2.9 7.02c0 5.46-4.45 9.9-9.92 9.9Zm5.44-7.42c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.06 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" /></svg>;
}

function InstagramIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.8" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>;
}

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
            <a href={companyContact.whatsappHref} target="_blank" rel="noreferrer" aria-label="Fale com a IM Personnel pelo WhatsApp"><WhatsAppIcon /></a>
            <a href="https://www.instagram.com/impersonnel_consultoria" target="_blank" rel="noreferrer" aria-label="IM Personnel no Instagram"><InstagramIcon /></a>
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
