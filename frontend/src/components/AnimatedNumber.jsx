import { useCountUp } from '../hooks/useCountUp';

export default function AnimatedNumber({ value, format }) {
  const animated = useCountUp(value);
  return format ? format(animated) : Math.round(animated).toLocaleString();
}
