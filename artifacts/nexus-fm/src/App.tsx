import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, Show } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { AuthStateSync } from '@/components/auth-state-sync';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/layout/app-shell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { SignInPage, SignUpPage } from '@/pages/auth';
import { Dashboard } from '@/pages/dashboard';
import { AuthorizationPage } from '@/pages/authorization';
import Landing from '@/pages/landing';
import NotFound from '@/pages/not-found';
import { Profile } from '@/pages/profile';
import { FacilitiesPage } from '@/pages/facilities';
import { FacilityDetailPage } from '@/pages/facilities/facility-detail';
import { BuildingDetailPage } from '@/pages/buildings/building-detail';
import { SpaceDetailPage } from '@/pages/spaces/space-detail';
import { SystemDetailPage } from '@/pages/systems/system-detail';
import { AssetDetailPage } from '@/pages/assets/asset-detail';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function Home() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/app" /></Show>
      <Show when="signed-out"><Landing /></Show>
    </>
  );
}

function Routes() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/app">
          <ProtectedPage><AppShell><Dashboard /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/facilities">
          <ProtectedPage><AppShell><FacilitiesPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/facilities/:id">
          <ProtectedPage><AppShell><FacilityDetailPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/buildings/:id">
          <ProtectedPage><AppShell><BuildingDetailPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/spaces/:id">
          <ProtectedPage><AppShell><SpaceDetailPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/systems/:id">
          <ProtectedPage><AppShell><SystemDetailPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/app/assets/:id">
          <ProtectedPage><AppShell><AssetDetailPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/authorization">
          <ProtectedPage><AppShell><AuthorizationPage /></AppShell></ProtectedPage>
        </Route>
        <Route path="/profile">
          <ProtectedPage><AppShell><Profile /></AppShell></ProtectedPage>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        theme: dark,
        cssLayerName: 'clerk',
        options: {
          logoPlacement: 'inside',
          logoLinkUrl: basePath || '/',
          logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
        },
        variables: {
          colorPrimary: 'hsl(199 100% 48%)',
          colorForeground: 'hsl(210 40% 98%)',
          colorMutedForeground: 'hsl(215 20% 72%)',
          colorBackground: 'hsl(216 28% 7%)',
          colorInput: 'hsl(216 28% 15%)',
          colorInputForeground: 'hsl(210 40% 98%)',
          colorNeutral: 'hsl(216 28% 15%)',
          fontFamily: 'Inter, sans-serif',
          borderRadius: '0.25rem',
        },
        elements: {
          rootBox: 'w-full flex justify-center',
          cardBox: 'bg-card rounded-xl w-[440px] max-w-full overflow-hidden border border-border',
          card: '!shadow-none !border-0 !bg-transparent !rounded-none',
          footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
          headerTitle: 'text-foreground',
          headerSubtitle: 'text-muted-foreground',
          socialButtonsBlockButtonText: 'text-foreground',
          formFieldLabel: 'text-foreground',
          footerActionLink: 'text-primary',
          footerActionText: 'text-muted-foreground',
          dividerText: 'text-muted-foreground',
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Akses TATABANGUN', subtitle: 'Masuk ke sistem tata kelola fasilitas' } },
        signUp: { start: { title: 'Buat identitas pengguna', subtitle: 'Siapkan akses aman ke TATABANGUN' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthStateSync>
            <Routes />
          </AuthStateSync>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}