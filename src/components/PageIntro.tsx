import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export function PageIntro({ eyebrow, title, text, current, compact = false }: { eyebrow: string; title: ReactNode; text: string; current?: string; compact?: boolean }) {
  return (
    <section className={`page-intro ${compact ? 'page-intro-compact' : ''}`}>
      <div className="page-intro-pattern" aria-hidden="true" />
      <div className="container page-intro-content">
        <nav className="breadcrumbs" aria-label="Trilha de navegação"><Link to="/">Início</Link><ArrowRight size={13} />{current && <span>{current}</span>}</nav>
        <span className="eyebrow eyebrow-light">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      <span className="intro-index" aria-hidden="true">IM / {new Date().getFullYear()}</span>
    </section>
  );
}
