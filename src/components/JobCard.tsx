import { ArrowUpRight, BriefcaseBusiness, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Job } from '../lib/api';
import { formatDate } from '../lib/api';

export function JobCard({ job, featured = false }: { job: Job; featured?: boolean }) {
  return (
    <article className={`job-card ${featured ? 'job-card-featured' : ''}`}>
      {featured && <span className="job-featured-label">Oportunidade em destaque</span>}
      <div className="job-card-top"><span className="job-area-tag">{job.area}</span><span className="job-date">{formatDate(job.created_at)}</span></div>
      <h3><Link to={`/vagas/${job.slug}`}>{job.title}</Link></h3>
      <p className="job-summary">{job.summary}</p>
      <div className="job-meta"><span><MapPin size={15} /> {job.city}, {job.state}</span><span><BriefcaseBusiness size={15} /> {job.modality}</span></div>
      <div className="job-card-bottom"><span>{job.employment_type}</span><Link to={`/vagas/${job.slug}`} aria-label={`Ver oportunidade: ${job.title}`}>Ver oportunidade <ArrowUpRight size={16} /></Link></div>
    </article>
  );
}
