import { ExternalLink } from 'lucide-react';
import { explorerTxUrl, shortHash } from '../utils/format.js';

export function TxLink({ hash, url }) {
  if (!hash) return <span className="text-muted">—</span>;
  return (
    <a href={url || explorerTxUrl(hash)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-[12px] text-accent hover:underline">
      {shortHash(hash)}<ExternalLink className="size-3" />
    </a>
  );
}
