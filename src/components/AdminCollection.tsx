import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { apiGet } from '../lib/api';

type CollectionResponse<T> = { items?: T[]; total?: number };

export type AdminCollection<T> = {
  items: T[];
  total: number;
  loading: boolean;
  error: string;
  query: string;
  setQuery: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
};

// Listas administrativas vêm paginadas do servidor com a busca aplicada antes do corte.
// Assim encontrar um registro antigo não depende de ele ter cabido na primeira página.
export function useAdminCollection<T>(path: string, { limit = 100 }: { limit?: number } = {}): AdminCollection<T> {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);
  const search = useDebounced(query, 350);

  const buildUrl = useCallback((offset: number) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search.trim()) params.set('q', search.trim());
    if (status) params.set('status', status);
    return `${path}?${params.toString()}`;
  }, [path, limit, search, status]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    apiGet<CollectionResponse<T>>(buildUrl(0))
      .then((data) => {
        if (id !== requestId.current) return;
        setItems(data.items || []); setTotal(data.total ?? (data.items || []).length); setLoading(false);
      })
      .catch((reason: Error) => { if (id === requestId.current) { setError(reason.message); setLoading(false); } });
  }, [buildUrl, nonce]);

  const loadMore = useCallback(async () => {
    const id = requestId.current;
    setLoading(true);
    try {
      const data = await apiGet<CollectionResponse<T>>(buildUrl(items.length));
      if (id !== requestId.current) return;
      const next = data.items || [];
      setItems((current) => [...current, ...next]);
      setTotal(data.total ?? total);
      setLoading(false);
    } catch (reason) {
      if (id === requestId.current) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar mais registros.'); setLoading(false); }
    }
  }, [buildUrl, items.length, total]);

  return {
    items, total, loading, error, query, setQuery, status, setStatus,
    hasMore: items.length < total,
    loadMore: () => { void loadMore(); },
    reload: () => { requestId.current += 1; setNonce((value) => value + 1); },
  };
}

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CollectionSearch({ value, onChange, placeholder, status, onStatusChange, statusOptions, statusLabel }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  status?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: readonly string[];
  statusLabel?: string;
}) {
  return <>
    <label className="admin-search"><Search size={16} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
    {statusOptions && onStatusChange && <select value={status || ''} onChange={(event) => onStatusChange(event.target.value)} aria-label={statusLabel || 'Filtrar'}>
      <option value="">Todos</option>
      {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>}
  </>;
}

export function CollectionFooter({ shown, total, loading, hasMore, onLoadMore, label }: {
  shown: number;
  total: number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  label: string;
}) {
  if (total === 0) return null;
  return <div className="admin-collection-footer">
    <span>Mostrando <strong>{shown}</strong> de <strong>{total}</strong> {label}{hasMore ? '' : ' — fim da lista'}</span>
    {hasMore && <button className="admin-load-more" type="button" disabled={loading} onClick={onLoadMore}>{loading ? 'Carregando…' : 'Carregar mais registros'}</button>}
  </div>;
}
