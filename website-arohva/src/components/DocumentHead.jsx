import { useEffect } from 'react';
import { siteConfig } from '../siteConfig';

export default function DocumentHead() {
  useEffect(() => {
    document.title = siteConfig.documentTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', siteConfig.metaDescription);
  }, []);
  return null;
}
