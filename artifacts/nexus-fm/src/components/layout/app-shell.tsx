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
import { Building2, LayoutDashboard, Shield, ChevronDown, LogOut, KeyRound, MapPin, HardHat } from 'lucide-react';
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
    { href: '/app', label: 'Terminal', icon: LayoutDashboard },
    { href: '/app/facilities', label: 'Fasilitas', icon: MapPin },
    ...(hasAuthAccess ? [{ href: '/authorization', label: 'Otorisasi', icon: KeyRound }] : []),
    { href: '/profile', label: 'Identitas', icon: Shield },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <header className="sticky top-0 z-40 w-full border-b-2 border-border bg-card">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-primary" />
        <div className="flex h-14 items-center px-4 md:px-6 gap-4 sm:gap-6">
          <Link href="/app" aria-label="Dasbor TATABANGUN" className="flex items-center gap-2 mr-2 sm:mr-4 shrink-0" data-testid="app-logo">
            <div className="size-7 bg-primary flex items-center justify-center">
              <HardHat className="size-4 text-primary-foreground" />
            </div>
             <span className="font-mono font-bold tracking-tight hidden sm:inline-block text-sm md:text-lg">TATABANGUN</span>
          </Link>

          <div className="flex-1 flex items-center min-w-0">
            {sessionLoading || orgsLoading ? (
              <Skeleton className="h-9 w-[180px] rounded-none" />
            ) : session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label={`Pilih organisasi, organisasi saat ini: ${session.activeOrganization?.organization.name ?? 'belum dipilih'}`}
                    className="font-mono justify-between min-w-[160px] max-w-[240px] border-2 border-border hover:bg-muted hover:border-primary/50 rounded-none h-9 px-3"
                    data-testid="org-selector-btn"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="size-4 text-primary shrink-0" />
                      <span className="truncate text-xs font-bold uppercase tracking-wider">
                        {session.activeOrganization?.organization.name ?? "Pilih Organisasi"}
                      </span>
                    </div>
                    <ChevronDown className="size-4 ml-2 opacity-50 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px] font-mono rounded-none border-2 border-border">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider font-bold bg-muted/50 p-2">
                    Konteks Organisasi
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuRadioGroup
                    value={session.activeOrganization?.organization.id}
                    onValueChange={handleSelectOrg}
                  >
                    {orgs?.map((orgAccess) => (
                      <DropdownMenuRadioItem
                        key={orgAccess.organization.id}
                        value={orgAccess.organization.id}
                        disabled={selectOrg.isPending}
                        className="cursor-pointer text-xs uppercase tracking-wide rounded-none focus:bg-primary/10 focus:text-primary"
                        data-testid={`org-option-${orgAccess.organization.id}`}
                      >
                        <span className="truncate font-bold">{orgAccess.organization.name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {orgs?.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground uppercase">
                       Tidak ada akses.
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="flex items-center shrink-0">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Keluar"
              onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL })}
              className="rounded-none hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
              data-testid="logout-btn"
            >
              <LogOut className="size-4" />
               <span className="hidden sm:inline ml-2 font-mono text-xs uppercase font-bold tracking-wider">Keluar</span>
            </Button>
          </div>
        </div>

        {/* Sub-nav matching the rugged aesthetic */}
        <nav
          aria-label="Navigasi utama"
          className="flex items-center px-4 md:px-6 h-12 bg-background overflow-x-auto gap-2 border-t border-border hide-scrollbar"
        >
          {navItems.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== '/app');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`nav-${item.href.replace('/', '')}`}
              >
                <div
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer whitespace-nowrap border-b-2
                    ${isActive 
                      ? 'text-primary border-primary bg-primary/5'
                      : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50 hover:border-border'
                    }`}
                >
                  <Icon className="size-3.5 mb-0.5" />
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
