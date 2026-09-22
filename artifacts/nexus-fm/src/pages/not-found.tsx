import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md p-8 rounded-xl border border-border bg-card/50 shadow-2xl relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <AlertCircle className="w-32 h-32" />
        </div>

        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <h1 className="text-2xl font-mono font-bold tracking-tight">404_NOT_FOUND</h1>
          </div>
          
          <div className="space-y-2 text-muted-foreground font-mono text-sm leading-relaxed">
            <p>
               Vektor yang diminta tidak dapat ditemukan.
            </p>
            <p>
               Jalur target tidak ada dalam indeks operasional saat ini. Verifikasi endpoint atau kembali ke zona aman.
            </p>
          </div>

          <div className="pt-4 border-t border-border/50">
            <Link href="/">
              <Button className="w-full font-mono gap-2 shadow-[0_0_15px_rgba(0,229,255,0.1)] hover:shadow-[0_0_20px_rgba(0,229,255,0.2)]">
                <ArrowLeft className="h-4 w-4" />
                 KEMBALI KE AKAR SISTEM
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
