import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck, Activity, Database, Network } from 'lucide-react';
import { useAuth } from '@clerk/react';

export default function Landing() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-primary rounded flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.3)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 text-primary-foreground">
                <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 15h10" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="m9 18 3-3-3-3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-mono font-bold tracking-tight text-lg">NEXUS-FM</span>
          </div>
          <nav className="flex items-center gap-4">
            {isSignedIn ? (
              <Link href="/app">
                <Button className="font-mono text-xs shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  ENTER SYSTEM <ArrowRight className="ml-2 size-3" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" className="font-mono text-xs hidden sm:inline-flex">
                    SIGN IN
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button className="font-mono text-xs shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                    INITIALIZE <ArrowRight className="ml-2 size-3" />
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-32 md:pt-32 md:pb-40">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,var(--color-primary)_0%,transparent_20%)] opacity-20" />
          <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#11141a_1px,transparent_1px),linear-gradient(to_bottom,#11141a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
          
          <div className="container relative z-10 flex flex-col items-center text-center">
            <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary mb-8 backdrop-blur-sm">
              <span className="flex size-1.5 rounded-full bg-primary mr-2 animate-pulse" />
               <span className="font-mono text-xs uppercase tracking-wider">Sistem Operasional</span>
            </div>
            
            <h1 className="max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
               Kendali presisi untuk <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">
                 tim fasilitas.
              </span>
            </h1>
            
            <p className="mt-8 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
               NEXUS-FM adalah sistem operasi digital tepercaya yang menyediakan kendali berbasis bukti atas organisasi, akses, fasilitas, aset, pekerjaan, risiko, dan kepatuhan.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              {isSignedIn ? (
                <Link href="/app">
                  <Button size="lg" className="font-mono w-full sm:w-auto px-8 h-12 shadow-[0_0_25px_rgba(0,229,255,0.25)] hover:shadow-[0_0_35px_rgba(0,229,255,0.4)] transition-all">
                     AKSES TERMINAL <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              ) : (
                <Link href="/sign-up">
                  <Button size="lg" className="font-mono w-full sm:w-auto px-8 h-12 shadow-[0_0_25px_rgba(0,229,255,0.25)] hover:shadow-[0_0_35px_rgba(0,229,255,0.4)] transition-all">
                     INISIALISASI SISTEM <ArrowRight className="ml-2 size-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="border-t border-border bg-card/50">
          <div className="container py-24 sm:py-32">
            <div className="grid gap-12 md:grid-cols-3">
              <div className="flex flex-col gap-4 p-6 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 transition-colors group">
                <div className="size-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Database className="size-6" />
                </div>
                 <h3 className="text-xl font-semibold font-mono">Siklus Hidup Aset</h3>
                <p className="text-muted-foreground leading-relaxed">
                   Lacak setiap aset sejak diperoleh hingga dinonaktifkan. Kelola status secara presisi, peristiwa siklus hidup, dan jejak audit.
                </p>
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 transition-colors group">
                <div className="size-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Network className="size-6" />
                </div>
                 <h3 className="text-xl font-semibold font-mono">Orkestrasi Pekerjaan</h3>
                <p className="text-muted-foreground leading-relaxed">
                   Perutean dinamis untuk perintah kerja. Peran kanonis menentukan batas akses dan tindakan. Alur operasional yang murni.
                </p>
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-lg border border-border/50 bg-background/50 hover:border-primary/50 transition-colors group">
                <div className="size-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <ShieldCheck className="size-6" />
                </div>
                 <h3 className="text-xl font-semibold font-mono">Kepatuhan & Risiko</h3>
                <p className="text-muted-foreground leading-relaxed">
                   Status audit berkelanjutan. Log historis yang tidak dapat diubah. Kepastian matematis untuk kepatuhan fasilitas.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Data Density Preview Section */}
        <section className="border-t border-border overflow-hidden">
          <div className="container py-24 sm:py-32 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 size-[500px] bg-primary/5 rounded-full blur-[100px]" />
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
                   Kepadatan informasi tanpa beban kognitif.
                </h2>
                <p className="text-lg text-muted-foreground mb-8">
                   Dirancang untuk operator yang membaca tabel, bukan grafik. Kami mengutamakan efisiensi pemindaian, tipografi tegas, dan status yang jelas daripada bualan pemasaran.
                </p>
                <ul className="space-y-4 font-mono text-sm">
                  <li className="flex items-center gap-3">
                    <Activity className="size-4 text-primary" />
                     <span>Sinkronisasi status waktu nyata</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <ShieldCheck className="size-4 text-primary" />
                     <span>Penerapan Kontrol Akses Berbasis Peran (RBAC)</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <Database className="size-4 text-primary" />
                     <span>Tabel entitas berthroughput tinggi</span>
                  </li>
                </ul>
              </div>
              
              <div className="relative border border-border rounded-xl bg-card shadow-2xl p-8">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
                  <div className="size-16 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(0,229,255,0.15)] relative">
                    <div className="absolute inset-0 rounded-full border border-primary/50 animate-ping opacity-20" />
                    <Activity className="size-8 text-primary" />
                  </div>
                   <h3 className="text-xl font-mono font-bold">SISTEM SIAP</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                     Menunggu otorisasi untuk menginisialisasi konteks organisasi dan menyinkronkan vektor infrastruktur.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-12">
        <div className="container flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
            <div className="size-6 bg-primary/20 border border-primary/50 rounded flex items-center justify-center">
              <span className="text-[10px] text-primary">N</span>
            </div>
            <span>NEXUS-FM OS V1.0.0</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono text-center sm:text-right">
             OPERASI FASILITAS AMAN<br/>
            &copy; {new Date().getFullYear()} NEXUS SYSTEMS
          </div>
        </div>
      </footer>
    </div>
  );
}
