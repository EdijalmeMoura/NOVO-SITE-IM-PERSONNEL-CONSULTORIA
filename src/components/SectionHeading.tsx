export function SectionHeading({ eyebrow, title, text, light = false, center = false }: { eyebrow?: string; title: string; text?: string; light?: boolean; center?: boolean }) {
  return (
    <div className={`section-heading ${light ? 'is-light' : ''} ${center ? 'is-centered' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}
