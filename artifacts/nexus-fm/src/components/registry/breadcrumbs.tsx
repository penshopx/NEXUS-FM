import { Link } from 'wouter';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center text-sm font-mono text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap pb-2">
      <Link href="/app" className="hover:text-primary transition-colors flex items-center gap-1.5 shrink-0" data-testid="link-breadcrumb-home">
        <Home className="size-4" />
      </Link>
      <ChevronRight className="size-4 mx-2 opacity-50 shrink-0" />
      
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        return (
          <div key={index} className="flex items-center shrink-0">
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-primary transition-colors" data-testid={`link-breadcrumb-${index}`}>
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-foreground font-medium" : ""} data-testid={`text-breadcrumb-${index}`}>
                {item.label}
              </span>
            )}
            
            {!isLast && <ChevronRight className="size-4 mx-2 opacity-50 shrink-0" />}
          </div>
        );
      })}
    </nav>
  );
}