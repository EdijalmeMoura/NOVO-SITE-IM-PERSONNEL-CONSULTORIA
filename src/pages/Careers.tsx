import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, Filter, MapPin, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet, formatDate, type Job } from '../lib/api';
import { PageIntro } from '../components/PageIntro';
import { usePageMeta } from '../hooks/usePageMeta';

interface JobFilters { areas: string[]; cities: string[]; states: string[]; modalities: string[]; employment_types: string[] }
type SearchFilters = { q: string; area: string; city: string; state: string; modality: string; employment_type: string; published_within: string; sort: string };
const emptyFilters: SearchFilters = { q: '', area: '', city: '', state: '', modality: '', employment_type: '', published_within: '', sort: 'newest' };
const modalityLabels: Record<string, string> = { 'Presencial': 'Presencial', 'Híbrido': 'Híbrido', 'Remoto': 'Remoto' };

export function Careers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>({ ...emptyFilters, q: searchParams.get('q') || '' });
  const [applied, setApplied] = useState<SearchFilters>({ ...emptyFilters, q: searchParams.get('q') || '' });
  const [results, setResults] = useState<{ items: Job[]; total: number; pages: number; page: number }>({ items: [], total: 0, pages: 0, page: 1 });
  const [options, setOptions] = useState<JobFilters>({ areas: [], cities: [], states: [], modalities: [], employment_types: [] });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  usePageMeta('Vagas disponíveis', 'Pesquise oportunidades de trabalho divulgadas pela IM Personnel em Recife e outras localidades.', '/vagas');

  useEffect(() => { apiGet<JobFilters>('/api/jobs/filters').then(setOptions).catch(() => setOptions({ areas: [], cities: [], states: [], modalities: [], employment_types: [] })); }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), per_page: '9', sort: applied.sort });
    Object.entries(applied).forEach(([key, value]) => { if (value && key !== 'sort') params.set(key, value); });
    apiGet<typeof results>(`/api/jobs?${params.toString()}`).then((data) => { if (!cancelled) setResults(data); }).catch((reason: Error) => { if (!cancelled) setError(reason.message || 'Não foi possível carregar as vagas.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applied, page]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault(); setPage(1); setApplied(filters); setSearchParams(filters.q ? { q: filters.q } : {}, { replace: true });
  }
  function clearFilters() { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1); setSearchParams({}, { replace: true }); }
  return <main>
    <PageIntro eyebrow="Oportunidades" title={<>Seu próximo passo<br /><span className="intro-title-accent">começa aqui.</span></>} text="Busque oportunidades abertas e encontre a vaga que conversa com o que você quer construir." current="Vagas" />
    <section className="careers-page section-pad"><div className="container">
      <form className="career-search-panel" onSubmit={submitSearch}>
        <div className="career-search-heading"><div><span className="eyebrow">PORTAL DE OPORTUNIDADES</span><h2>Encontre sua próxima oportunidade.</h2></div><span className="search-live-dot"><i /> Atualizado com vagas publicadas</span></div>
        <div className="career-search-fields">
          <label className="search-main-field"><span>Cargo ou palavra-chave</span><div className="input-icon-wrap"><Search size={18} /><input type="search" placeholder="Ex.: analista, vendas, liderança" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /></div></label>
          <label><span>Área profissional</span><select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}><option value="">Todas as áreas</option>{options.areas.map((area) => <option key={area}>{area}</option>)}</select></label>
          <label><span>Cidade</span><select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })}><option value="">Todas as cidades</option>{options.cities.map((city) => <option key={city}>{city}</option>)}</select></label>
          <label><span>Estado</span><select value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value })}><option value="">Todos os estados</option>{options.states.map((state) => <option key={state}>{state}</option>)}</select></label>
          <label><span>Modalidade</span><select value={filters.modality} onChange={(event) => setFilters({ ...filters, modality: event.target.value })}><option value="">Todas</option>{options.modalities.map((modality) => <option key={modality} value={modality}>{modalityLabels[modality] || modality}</option>)}</select></label>
          <label><span>Contratação</span><select value={filters.employment_type} onChange={(event) => setFilters({ ...filters, employment_type: event.target.value })}><option value="">Todos os tipos</option>{options.employment_types.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>Publicadas</span><select value={filters.published_within} onChange={(event) => setFilters({ ...filters, published_within: event.target.value })}><option value="">Qualquer data</option><option value="today">Últimas 24 horas</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option></select></label>
          <button className="button button-primary career-search-button" type="submit"><Search size={16} /> Buscar oportunidades</button>
        </div>
      </form>
      <div className="career-results-heading"><div><span className="eyebrow">VAGAS DISPONÍVEIS</span><h2>{loading ? 'Buscando oportunidades…' : `${results.total} ${results.total === 1 ? 'oportunidade encontrada' : 'oportunidades encontradas'}`}</h2></div><div className="results-controls"><label htmlFor="sort-jobs">Ordenar por</label><select id="sort-jobs" value={filters.sort} onChange={(event) => { const next = { ...filters, sort: event.target.value }; setFilters(next); setApplied(next); setPage(1); }}><option value="newest">Mais recentes</option><option value="oldest">Mais antigas</option></select><button type="button" className="clear-filter-button" onClick={clearFilters}><X size={14} /> Limpar filtros</button></div></div>
      {loading ? <div className="career-list-grid">{[1, 2, 3].map((index) => <div className="job-skeleton" key={index}><span /><span /><span /></div>)}</div> : error ? <div className="state-panel state-error"><span className="state-icon"><Filter size={18} /></span><h3>Não conseguimos carregar as vagas.</h3><p>{error}</p><button className="button button-dark" type="button" onClick={() => setApplied({ ...applied })}>Tentar novamente</button></div> : results.items.length ? <div className="career-list-grid">{results.items.map((job) => <article className="career-result-card" key={job.id}><div className="career-card-top"><span className="job-area-tag">{job.area}</span><span className="career-date">Publicada em {formatDate(job.created_at)}</span></div><h3><Link to={`/vagas/${job.slug}`}>{job.title}</Link></h3><p>{job.summary}</p><div className="career-card-tags"><span><MapPin size={14} />{job.city}, {job.state}</span><span><BriefcaseBusiness size={14} />{job.modality}</span><span>{job.employment_type}</span></div><div className="career-card-bottom"><span>{job.featured ? 'Oportunidade em destaque' : 'Conheça os detalhes da posição'}</span><Link to={`/vagas/${job.slug}`}>Ver oportunidade <ArrowUpRight size={16} /></Link></div></article>)}</div> : <div className="state-panel state-empty"><span className="empty-orbit"><Search size={19} /></span><span className="eyebrow">SEM RESULTADOS POR AGORA</span><h3>Nenhuma oportunidade encontrada.</h3><p>Experimente ajustar os filtros ou cadastre seu perfil para participar de futuras seleções.</p><div className="state-panel-actions"><button className="button button-outline" type="button" onClick={clearFilters}>Limpar filtros <X size={15} /></button><Link className="button button-dark" to="/curriculo">Cadastrar currículo <ArrowRight size={16} /></Link></div></div>}
      {!loading && results.pages > 1 && <nav className="pagination" aria-label="Paginação das oportunidades"><button type="button" disabled={page <= 1} onClick={() => { setPage((old) => old - 1); window.scrollTo({ top: 500, behavior: 'smooth' }); }}>Anterior</button><span>Página {page} de {results.pages}</span><button type="button" disabled={page >= results.pages} onClick={() => { setPage((old) => old + 1); window.scrollTo({ top: 500, behavior: 'smooth' }); }}>Próxima <ArrowRight size={15} /></button></nav>}
      <div className="career-talent-note"><div className="talent-note-dot" /><div><h3>Não encontrou uma vaga para você?</h3><p>Cadastre seu currículo no banco de talentos e apresente seu perfil para futuras oportunidades.</p></div><Link to="/banco-de-talentos" className="text-link">Quero participar <ArrowUpRight size={16} /></Link></div>
    </div></section>
  </main>;
}
