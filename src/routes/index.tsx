import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Briefcase,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  CircleDashed,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { fmtMoney, estadoLabel } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ObrasPro — Gestión profesional de obras y cobros" },
      {
        name: "description",
        content: "Administrá tus obras, presupuestos y cobros en un solo lugar.",
      },
    ],
  }),
  component: Index,
});

type Obra = {
  id: string;
  cliente: string;
  descripcion: string;
  presupuesto: number;
  fecha_inicio: string;
  estado: "en_curso" | "completado" | "pendiente";
  notas: string | null;
};

type Pago = { obra_id: string; monto: number };

function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [obras, setObras] = useState<Obra[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [authLoading, user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: o }, { data: p }] = await Promise.all([
      supabase.from("obras").select("*").order("created_at", { ascending: false }),
      supabase.from("pagos").select("obra_id, monto"),
    ]);
    setObras((o as Obra[]) ?? []);
    setPagos((p as Pago[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const cobradoPorObra = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pagos) m.set(p.obra_id, (m.get(p.obra_id) ?? 0) + Number(p.monto));
    return m;
  }, [pagos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter(
      (o) =>
        o.cliente.toLowerCase().includes(q) ||
        o.descripcion.toLowerCase().includes(q) ||
        estadoLabel[o.estado].toLowerCase().includes(q),
    );
  }, [obras, search]);

  const totals = useMemo(() => {
    const presupuesto = obras.reduce((s, o) => s + Number(o.presupuesto), 0);
    const cobrado = pagos.reduce((s, p) => s + Number(p.monto), 0);
    return {
      presupuesto,
      cobrado,
      deuda: presupuesto - cobrado,
      enCurso: obras.filter((o) => o.estado === "en_curso").length,
      completados: obras.filter((o) => o.estado === "completado").length,
      pendientes: obras.filter((o) => o.estado === "pendiente").length,
    };
  }, [obras, pagos]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("obras").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Obra eliminada");
    fetchData();
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-subtle)" }}>
      <Header email={user.email} />
      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Briefcase className="h-5 w-5" />}
            label="Obras"
            value={String(obras.length)}
            tone="primary"
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="Presupuestado"
            value={fmtMoney(totals.presupuesto)}
            tone="primary"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Cobrado"
            value={fmtMoney(totals.cobrado)}
            tone="success"
          />
          <StatCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="Deuda total"
            value={fmtMoney(totals.deuda)}
            tone={totals.deuda > 0 ? "destructive" : "success"}
          />
        </div>

        {/* Resumen estados */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MiniStat
            icon={<Clock className="h-4 w-4 text-warning" />}
            label="En curso"
            value={totals.enCurso}
          />
          <MiniStat
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            label="Completados"
            value={totals.completados}
          />
          <MiniStat
            icon={<CircleDashed className="h-4 w-4 text-muted-foreground" />}
            label="Pendientes"
            value={totals.pendientes}
          />
        </div>

        {/* Toolbar */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, descripción o estado..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/pagos/nuevo">
                <Plus className="h-4 w-4" />
                Nuevo pago
              </Link>
            </Button>
            <Button asChild>
              <Link to="/obras/nueva">
                <Plus className="h-4 w-4" />
                Nueva obra
              </Link>
            </Button>
          </div>
        </div>

        {/* Tabla */}
        <Card className="mt-4 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Cliente</TableHead>
                    <TableHead>Trabajo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Presupuesto</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                    <TableHead className="text-right">Deuda</TableHead>
                    <TableHead className="w-[160px]">% Cobrado</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        Cargando obras...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                        {obras.length === 0
                          ? "Aún no hay obras. Creá la primera."
                          : "No hay resultados para tu búsqueda."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((o) => {
                      const cobrado = cobradoPorObra.get(o.id) ?? 0;
                      const presupuesto = Number(o.presupuesto);
                      const deuda = presupuesto - cobrado;
                      const pct = presupuesto > 0 ? (cobrado / presupuesto) * 100 : 0;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.cliente}</TableCell>
                          <TableCell className="max-w-[280px] truncate">{o.descripcion}</TableCell>
                          <TableCell>
                            <EstadoBadge estado={o.estado} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(presupuesto)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-success">
                            {fmtMoney(cobrado)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${deuda > 0 ? "text-destructive" : "text-success"}`}
                          >
                            {fmtMoney(deuda)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2" />
                              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar obra?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Se eliminará la obra de {o.cliente} y todos sus pagos. Esta
                                    acción no se puede deshacer.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(o.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Card style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${toneClasses}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-bold tracking-tight">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: Obra["estado"] }) {
  const map = {
    en_curso: "bg-warning/20 text-warning-foreground border-warning/30",
    completado: "bg-success/15 text-success border-success/30",
    pendiente: "bg-muted text-muted-foreground border-border",
  } as const;
  return (
    <Badge variant="outline" className={map[estado]}>
      {estadoLabel[estado]}
    </Badge>
  );
}
