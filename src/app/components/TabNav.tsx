'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Portfolio', href: '/' },
  { label: 'News', href: '/news' },
];

export default function TabNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-6 border-b border-gray-800 px-4 sm:px-6" aria-label="Main navigation">
      {tabs.map(({ label, href }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={[
              'pb-3 pt-3 text-sm font-medium tracking-wide transition-colors',
              isActive
                ? 'border-b-2 border-emerald-400 text-emerald-400'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-300',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
