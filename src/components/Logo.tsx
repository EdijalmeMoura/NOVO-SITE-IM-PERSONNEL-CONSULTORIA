import { useState } from 'react';
import { Link } from 'react-router-dom';

const logoUrl = 'https://impersonnel.com.br/imagens/logo1.png';

export function Logo({ light = false, large = false }: { light?: boolean; large?: boolean }) {
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  return (
    <Link
      className={`brand ${light ? 'brand-light' : ''} ${large ? 'brand-large' : ''}`}
      to="/"
      aria-label="IM Personnel — página inicial"
    >
      {logoUnavailable ? (
        <span className="brand-fallback" aria-hidden="true">
          <strong>IM Personnel</strong>
          <small>CONSULTORIA</small>
        </span>
      ) : (
        <img
          className="brand-logo-img"
          src={logoUrl}
          alt=""
          decoding="async"
          onError={() => setLogoUnavailable(true)}
        />
      )}
    </Link>
  );
}
