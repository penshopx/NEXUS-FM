import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSession,
  useListOrganizations,
  useSelectOrganization,
  useGetMyPermissions,
} from '@workspace/api-client-react';
import { Building2, LayoutDashboard, Shield, ChevronDown, LogOut, KeyRound, MapPin } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { replaceOrganizationContext } from '@/lib/organization-context';

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useGetSession();
  const { data: orgs, isLoading: orgsLoading } = useListOrganizations();
  const selectOrg = useSelectOrganization();
  const { data: myPermissions } = useGetMyPermissions();

  const [, setLocation] = useLocation();

  const handleSelectOrg = (organizationId: string) => {
    selectOrg.mutate({ data: { organizationId } }, {
      onSuccess: (nextSession) => {
        replaceOrganizationContext(queryClient, nextSession);
        setLocation('/app');
      }
    });
  };

  const hasAuthAccess = (() => {
    if (!myPermissions) return false;
    const required = ['ROLE.MANAGE', 'USER.VIEW', 'USER.MANAGE', 'AUDIT_LOG.VIEW_AUDIT'];
    for (const permCode of required) {
      const grants = myPermissions.permissions.filter((p) => p.code === permCode);
      const isDenied = grants.some((g) => g.effect === 'DENY');
      const isAllowed = grants.some((g) => g.effect === 'ALLOW');
      if (isDenied) continue;
      if (isAllowed) return true;
    }
    return false;
  })();

  const navItems = [
    { href: '/app', label: 'Dasbor', icon: LayoutDashboard },
    { href: '/app/facilities', label: 'Fasilitas', icon: MapPin },
    ...(hasAuthAccess ? [{ href: '/authorization', label: 'Otorisasi', icon: KeyRound }] : []),
    { href: '/profile', label: 'Identitas & Akses', icon: Shield },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card">
        <div className="flex h-14 items-center px-4 md:px-6 gap-6">
          <Link href="/app" aria-label="Dasbor TATABANGUN" className="flex items-center gap-2 mr-4">
            <div className="size-6 bg-primary rounded flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-4 text-primary-foreground">
                <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-mono font-bold tracking-tight hidden md:inline-block">TATABANGUN</span>
          </Link>

          <div className="flex-1 flex items-center gap-2">
            {sessionLoading || orgsLoading ? (
              <Skeleton className="h-9 w-[200px]" />
            ) : session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label={`Pilih organisasi, organisasi saat ini: ${session.activeOrganization?.organization.name ?? 'belum dipilih'}`}
                    className="font-mono justify-between min-w-[200px] border-border hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="size-4 text-primary" />
                      <span className="truncate">
                        {session.activeOrganization?.organization.name ?? "Pilih Organisasi"}
                      </span>
                    </div>
                    <ChevronDown className="size-4 ml-2 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px] font-mono">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">
                    Organisasi yang Tersedia
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={session.activeOrganization?.organization.id}
                    onValueChange={handleSelectOrg}
                  >
                    {orgs?.map((orgAccess) => (
                      <DropdownMenuRadioItem
                        key={orgAccess.organization.id}
                        value={orgAccess.organization.id}
                        disabled={selectOrg.isPending}
                        className="cursor-pointer"
                      >
                        <span className="truncate">{orgAccess.organization.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {orgs?.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                       Tidak ada organisasi yang tersedia.
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Keluar"
              onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
            >
              <LogOut className="size-4" />
               <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
        <nav
          aria-label="Navigasi utama"
          className="flex items-center px-4 md:px-6 h-10 border-t border-border bg-background overflow-x-auto gap-1"
        >
          {navItems.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== '/app');
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-mono transition-colors cursor-pointer whitespace-nowrap
                    ${isActive 
                      ? 'bg-primary/10 text-primary border border-primary/20' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                    }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </div>
              </Link>
            )
          })}
        </nav>
      </header>

      <main
        key={session?.activeOrganization?.organization.id ?? 'no-active-organization'}
        className="flex-1 overflow-y-auto"
      >
        <div className="container py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
