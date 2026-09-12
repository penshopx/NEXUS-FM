import { SignIn, SignUp } from '@clerk/react';
import { Link } from 'wouter';

export function SignInPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="size-12 bg-primary rounded-md flex items-center justify-center shadow-lg shadow-primary/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6 text-primary-foreground">
            <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 15h10" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="m9 18 3-3-3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <Link href="/">
          <span className="text-xl font-bold tracking-tight text-foreground font-mono cursor-pointer hover:text-primary transition-colors">
            NEXUS-FM
          </span>
        </Link>
      </div>
      <SignIn path={`${basePath}/sign-in`} routing="path" signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/app`} />
    </div>
  );
}

export function SignUpPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="size-12 bg-primary rounded-md flex items-center justify-center shadow-lg shadow-primary/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6 text-primary-foreground">
            <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 15h10" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="m9 18 3-3-3-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <Link href="/">
          <span className="text-xl font-bold tracking-tight text-foreground font-mono cursor-pointer hover:text-primary transition-colors">
            NEXUS-FM
          </span>
        </Link>
      </div>
      <SignUp path={`${basePath}/sign-up`} routing="path" signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/app`} />
    </div>
  );
}
