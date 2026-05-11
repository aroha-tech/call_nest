import { useInView } from '../hooks/useInView';

export function Reveal({ children, className = '', delay = 0, as: Tag = 'div', style, ...rest }) {
  const [ref, inView] = useInView({ once: true });
  const combined = [className, 'reveal', inView ? 'is-in' : ''].filter(Boolean).join(' ');

  return (
    <Tag
      ref={ref}
      className={combined}
      style={{
        ...style,
        ...(delay && inView ? { transitionDelay: `${delay}s` } : null),
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
