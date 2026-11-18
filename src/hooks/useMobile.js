import { useEffect, useState } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 840);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 839px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
