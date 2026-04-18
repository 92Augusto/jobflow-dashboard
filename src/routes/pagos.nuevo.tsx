import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/pagos/nuevo")({
  head: () => ({
    meta: [
      { title: "Nuevo pago — ObrasPro" },
      { name: "description", content: "Registrá un nuevo cobro o cuota a una obra existente." },
    ],
  }),
  component: NuevoPago,
});

type ObraOption = { id: string; cliente: string; descripcion: string; presupuesto: number };

function NuevoPago() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [obras, setObras] = useState<ObraOption[]>([]);

  const [obraId, setObraId] = useState("");
  const [numeroPago, setNumeroPago] = useState("1");
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [monto, setMonto] = useState("");
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("obras")
        .select("id, cliente, descripcion, presupuesto")
        .order("created_at", { ascending: false });
      setObras((data as ObraOption[]) ?? []);
    })();
  }, [user]);

  // Auto-incrementar número de pago según obra
  useEffect(() => {
    if (!obraId) return;
    (async () => {
      const { count } = await supabase
        .from("pagos")
        .select("*", { count: "exact", head: true })
        .eq("obra_id", obraId);
      setNumeroPago(String((count ?? 0) + 1));
    })();
  }, [obraId]);

  const obraSeleccionada = useMemo(
    () => obras.find((o) => o.id === obraId),
    [obras, obraId],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("pagos").insert({
      user_id: user.id,
      obra_id: obraId,
      numero_pago: Number(numeroPago) || 1,
      fecha_pago: fechaPago,
      monto: Number(monto) || 0,
      observaciones: observaciones || null,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pago registrado");
    navigate({ to: "/" });
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-subtle)" }}>
      <Header email={user.email} />
      <main className="container mx-auto max-w-2xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </Button>

        <Card style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <CardTitle>Nuevo pago</CardTitle>
          </CardHeader>
          <CardContent>
            {obras.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
                Primero tenés que crear una obra.{" "}
                <Link to="/obras/nueva" className="font-medium text-primary hover:underline">
                  Crear obra
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="obra">Obra *</Label>
                  <Select value={obraId} onValueChange={setObraId} required>
                    <SelectTrigger id="obra">
                      <SelectValue placeholder="Seleccioná una obra" />
                    </SelectTrigger>
                    <SelectContent>
                      {obras.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.cliente} — {o.descripcion.slice(0, 40)}
                          {o.descripcion.length > 40 ? "..." : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {obraSeleccionada && (
                    <p className="text-xs text-muted-foreground">
                      Presupuesto: {fmtMoney(Number(obraSeleccionada.presupuesto))}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="numero">N° de pago *</Label>
                    <Input
                      id="numero"
                      type="number"
                      min="1"
                      required
                      value={numeroPago}
                      onChange={(e) => setNumeroPago(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fecha">Fecha *</Label>
                    <Input
                      id="fecha"
                      type="date"
                      required
                      value={fechaPago}
                      onChange={(e) => setFechaPago(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monto">Monto (USD) *</Label>
                    <Input
                      id="monto"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="obs">Observaciones</Label>
                  <Textarea
                    id="obs"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej: Pago en efectivo, transferencia, etc."
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => navigate({ to: "/" })}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading || !obraId}>
                    <Save className="h-4 w-4" />
                    {loading ? "Guardando..." : "Registrar pago"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
