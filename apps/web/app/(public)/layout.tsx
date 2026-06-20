import { LanguageSwitcher } from "@/i18n";
import { Toaster } from "@/components/ui/sonner";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="absolute end-4 top-4">
        <LanguageSwitcher />
      </div>
      {children}
      <Toaster />
    </main>
  );
}
