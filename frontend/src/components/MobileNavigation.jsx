import { Link, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, Compass, MoreHorizontal, Search } from 'lucide-react';

const subjectQuery = (subject) => `?subject=${encodeURIComponent(subject || 'Operating Systems')}`;

/** Touch-first navigation for the primary workspaces. */
export default function MobileNavigation({ subject }) {
  const { pathname, hash } = useLocation();
  const dashboardPath = `/dashboard${subjectQuery(subject)}`;
  const items = [
    { label: 'Dashboard', icon: Compass, to: dashboardPath, active: pathname === '/dashboard' && !hash },
    { label: 'Study', icon: BookOpen, to: `${dashboardPath}#study-workspace`, active: pathname === '/dashboard' && hash === '#study-workspace' },
    { label: 'Query', icon: Search, to: `/query${subjectQuery(subject)}`, active: pathname === '/query' },
    { label: 'Planner', icon: CalendarDays, to: `${dashboardPath}#study-planner`, active: pathname === '/dashboard' && hash === '#study-planner' },
    { label: 'More', icon: MoreHorizontal, to: `/upload${subjectQuery(subject)}`, active: pathname === '/upload' },
  ];

  return <nav className="mobile-nav" aria-label="Primary navigation">
    {items.map(({ label, icon: Icon, to, active }) => <Link key={label} to={to} className={`mobile-nav__item${active ? ' is-active' : ''}`}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </nav>;
}
