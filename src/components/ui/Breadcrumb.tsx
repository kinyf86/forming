"use client";

import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="mb-6 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-2">&gt;</span>}
          {item.href ? (
            <Link href={item.href} className="text-blue-600 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
