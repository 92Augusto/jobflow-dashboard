import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function Header({ email }: { email?: string | null }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    navigate({ to: "/auth" });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Building2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">ObrasPro</div>
            <div className="text-xs text-muted-foreground">Gestión de obras y cobros</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {email && <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>}
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
