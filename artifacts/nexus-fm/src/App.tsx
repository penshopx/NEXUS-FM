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
import Landing from '@/pages/landing';
import NotFound from '@/pages/not-found';
import { Profile } from '@/pages/profile';

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
          colorBackground: 'hsl(216 28% 9%)',
          colorInput: 'hsl(216 25% 13%)',
          colorInputForeground: 'hsl(210 40% 98%)',
          colorNeutral: 'hsl(215 20% 32%)',
          fontFamily: 'Inter, sans-serif',
          borderRadius: '0.5rem',
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
        signIn: { start: { title: 'Access NEXUS-FM', subtitle: 'Authenticate to enter the facility control system' } },
        signUp: { start: { title: 'Create your operator identity', subtitle: 'Set up secure access to NEXUS-FM' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthStateSync />
          <Routes />
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