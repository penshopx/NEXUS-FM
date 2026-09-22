import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck, Activity, Database, PenTool, HardHat, Camera, CheckSquare } from 'lucide-react';
import { useAuth } from '@clerk/react';

export default function Landing() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b-2 border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,hsl(var(--primary)/0.2)_10px,hsl(var(--primary)/0.2)_20px)]" />
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-primary rounded-sm flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-5 text-primary-foreground">
                <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 15h10" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="m9 18 3-3-3-3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-mono font-bold tracking-tight text-xl uppercase">TATABANGUN</span>
          </div>
          <nav className="flex items-center gap-4">
            {isSignedIn ? (
              <Link href="/app">
                <Button className="font-mono text-xs uppercase" data-testid="enter-system-btn">
                  Akses Terminal <ArrowRight className="ml-2 size-3" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" className="font-mono text-xs hidden sm:inline-flex uppercase" data-testid="sign-in-btn">
                    Masuk
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button className="font-mono text-xs uppercase" data-testid="initialize-btn">
                    Inisialisasi <ArrowRight className="ml-2 size-3" />
                  </Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-20 pb-24 md:pt-32 md:pb-40 border-b border-border">
          {/* Blueprint/Grid Pattern Background */}
          <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,#000_30%,transparent_100%)] opacity-30" />
          
          <div className="container relative z-10 flex flex-col items-center text-center">
            <div className="inline-flex items-center border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary mb-8 font-mono">
              <span className="flex size-2 bg-primary mr-3 animate-pulse" />
              <span className="text-xs uppercase tracking-widest font-semibold">Sistem Tata Kelola & Eksekusi Teknis</span>
            </div>
            
            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-6xl md:text-7xl lg:text-8xl uppercase leading-[1.1]">
              Eksekusi Teknis <span className="text-primary">Presisi.</span> <br />
              Kepatuhan <span className="text-primary">Terjamin.</span>
            </h1>
            
            <p className="mt-8 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
              Sistem tata kelola untuk gedung, gudang, dan infrastruktur. Dirancang untuk tim teknis di lapangan, memastikan setiap aset terpantau dan setiap pekerjaan terdokumentasi dengan kepastian matematis.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              {isSignedIn ? (
                <Link href="/app">
                  <Button size="lg" className="font-mono w-full sm:w-auto px-8 h-14 text-base uppercase rounded-none border-b-4 border-r-4 border-black hover:translate-y-[2px] hover:translate-x-[2px] hover:border-b-2 hover:border-r-2 transition-all active:translate-y-[4px] active:translate-x-[4px] active:border-0" data-testid="hero-enter-system-btn">
                     Akses Terminal <ArrowRight className="ml-2 size-5" />
                  </Button>
                </Link>
              ) : (
                <Link href="/sign-up">
                  <Button size="lg" className="font-mono w-full sm:w-auto px-8 h-14 text-base uppercase rounded-none border-b-4 border-r-4 border-black hover:translate-y-[2px] hover:translate-x-[2px] hover:border-b-2 hover:border-r-2 transition-all active:translate-y-[4px] active:translate-x-[4px] active:border-0" data-testid="hero-initialize-btn">
                     Inisialisasi Sistem <ArrowRight className="ml-2 size-5" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Tactical Features Grid */}
        <section className="border-b border-border bg-card/40">
          <div className="container py-20 sm:py-28">
            <div className="flex flex-col items-center mb-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight">Dirancang untuk Lapangan</h2>
              <div className="w-16 h-1 bg-primary mt-6"></div>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-4 p-6 rounded-none border-2 border-border bg-background hover:border-primary transition-colors group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--primary))_4px,hsl(var(--primary))_8px)] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="size-12 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <HardHat className="size-6" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase tracking-tight">Eksekusi Lapangan</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Terminal data instan untuk teknisi. Panduan perutean kerja, batas akses yang jelas, dan penyelesaian tugas di titik aset.
                </p>
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-none border-2 border-border bg-background hover:border-primary transition-colors group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--primary))_4px,hsl(var(--primary))_8px)] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="size-12 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <Activity className="size-6" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase tracking-tight">Kesehatan Aset</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Telemetri siklus hidup aset dari pengadaan hingga penonaktifan. Sinkronisasi status waktu nyata dari lapangan ke pusat.
                </p>
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-none border-2 border-border bg-background hover:border-primary transition-colors group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--primary))_4px,hsl(var(--primary))_8px)] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="size-12 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <Camera className="size-6" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase tracking-tight">Bukti Inspeksi</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Log historis yang tidak dapat diubah. Tangkapan bukti kondisi aset secara langsung untuk audit dan kepatuhan absolut.
                </p>
              </div>

              <div className="flex flex-col gap-4 p-6 rounded-none border-2 border-border bg-background hover:border-primary transition-colors group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,hsl(var(--primary))_4px,hsl(var(--primary))_8px)] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="size-12 bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
                  <CheckSquare className="size-6" />
                </div>
                <h3 className="text-xl font-bold font-mono uppercase tracking-tight">Serah Terima</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Penyelesaian proyek dan transisi infrastruktur yang terstruktur, dikawal oleh sistem otorisasi berbasis peran (RBAC).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Data Density Detail Section */}
        <section className="border-b border-border overflow-hidden">
          <div className="container py-20 sm:py-28">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="order-2 lg:order-1 relative border-2 border-border bg-card p-6 sm:p-8">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-primary" />
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-16 bg-background border-2 border-border flex flex-col justify-evenly py-2 items-center">
                  <div className="w-1 h-1 bg-border rounded-full" />
                  <div className="w-1 h-1 bg-border rounded-full" />
                  <div className="w-1 h-1 bg-border rounded-full" />
                </div>
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center justify-between border-b-2 border-border pb-4">
                     <h3 className="text-lg font-mono font-bold uppercase tracking-widest text-muted-foreground">Prinsip Sistem</h3>
                  </div>
                  <div className="space-y-4 font-mono text-sm">
                    <div className="flex flex-col border-b border-border/50 pb-3">
                      <span className="text-foreground uppercase font-bold text-xs mb-1">Otoritas Berbasis Peran</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">Tindakan operasional dan visibilitas diatur ketat oleh lapisan RBAC yang diverifikasi server.</span>
                    </div>
                    <div className="flex flex-col border-b border-border/50 pb-3">
                      <span className="text-foreground uppercase font-bold text-xs mb-1">Integritas Log Audit</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">Registri aset kanonis mencatat setiap peristiwa. Seluruh aksi perubahan direkam dan tidak dapat dihapus.</span>
                    </div>
                    <div className="flex flex-col border-b border-border/50 pb-3">
                      <span className="text-foreground uppercase font-bold text-xs mb-1">Fokus Eksekusi Lapangan</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">Antarmuka dirancang untuk pemindaian instan, menghilangkan grafik kosong demi kepadatan informasi.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-6 leading-tight">
                  Kepastian Matematis,<br/> Bukan Sekadar Janji.
                </h2>
                <p className="text-lg text-muted-foreground mb-8">
                  Dirancang untuk tim lapangan yang membutuhkan data nyata. Kami menolak beban kognitif yang tidak perlu demi mengutamakan kepadatan informasi dan status yang presisi.
                </p>
                <ul className="space-y-4 font-mono text-sm">
                  <li className="flex items-start gap-4">
                    <div className="mt-0.5 bg-primary/20 p-1 text-primary">
                      <Database className="size-4" />
                    </div>
                    <div>
                      <span className="font-bold text-foreground block uppercase mb-1">Arsitektur Kanonis</span>
                      <span className="text-muted-foreground text-xs leading-relaxed block">Akses terpadu ke catatan aset tanpa hambatan rendering.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="mt-0.5 bg-primary/20 p-1 text-primary">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div>
                      <span className="font-bold text-foreground block uppercase mb-1">Batas Kewenangan Tegas</span>
                      <span className="text-muted-foreground text-xs leading-relaxed block">Peran menentukan secara absolut visibilitas dan hak perubahan.</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-4 border-border bg-card py-8">
        <div className="container flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 font-mono text-sm text-muted-foreground">
            <div className="size-8 border-2 border-primary flex items-center justify-center font-bold text-primary bg-primary/10">
              TB
            </div>
            <span className="uppercase tracking-widest font-semibold">Tatabangun Platform &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono tracking-widest uppercase">
            Sistem Eksekusi Teknis
          </div>
        </div>
      </footer>
    </div>
  );
}
