import { useEffect, useRef, useState } from 'react';

// Fades/slides a section in the first time it scrolls into view.
export default function Reveal({ children, className = '', delay = 0, as: Tag = 'div', style }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ '--delay': `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}
