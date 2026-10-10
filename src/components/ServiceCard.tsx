import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ServiceItem } from '../data';
import { ServiceIcon } from './ServiceIcon';

export function ServiceCard({ service, index = 0 }: { service: ServiceItem; index?: number }) {
  return (
    <Link to={`/servicos/${service.slug}`} className="service-card" style={{ animationDelay: `${index * 55}ms` }}>
      <span className="service-icon"><ServiceIcon service={service} /></span>
      <div className="service-card-copy"><h3>{service.title}</h3><p>{service.short}</p></div>
      <span className="service-card-arrow" aria-label={`Conheça ${service.title}`}><ArrowUpRight size={18} /></span>
    </Link>
  );
}
