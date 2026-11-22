import { ArrowUpRight } from 'lucide-react';
import IdentityMark from './IdentityMark.jsx';

export default function OpeningPreview({ opening }) {
  return <li><a className="opening-preview" href={`/openings/${opening.id}`}>
    <IdentityMark className="org-mark" name={opening.organizationName || opening.teamName} src={opening.organizationLogoUrl} />
    <div>
      <strong dir="auto">{opening.role}</strong>
      <p className="small muted"><bdi>{opening.teamName}</bdi> · <bdi>{opening.gameName}</bdi></p>
    </div>
    <ArrowUpRight size={16} aria-hidden="true" />
  </a></li>;
}
