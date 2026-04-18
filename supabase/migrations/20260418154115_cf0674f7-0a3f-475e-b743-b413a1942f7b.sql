-- Enum para estado de obras
CREATE TYPE public.obra_estado AS ENUM ('en_curso', 'completado', 'pendiente');

-- Tabla obras
CREATE TABLE public.obras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cliente TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  presupuesto NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  estado public.obra_estado NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla pagos
CREATE TABLE public.pagos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE NOT NULL,
  numero_pago INT NOT NULL DEFAULT 1,
  fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
  monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_obras_user ON public.obras(user_id);
CREATE INDEX idx_pagos_user ON public.pagos(user_id);
CREATE INDEX idx_pagos_obra ON public.pagos(obra_id);

-- RLS
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own obras" ON public.obras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own obras" ON public.obras FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own obras" ON public.obras FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own obras" ON public.obras FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own pagos" ON public.pagos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pagos" ON public.pagos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pagos" ON public.pagos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pagos" ON public.pagos FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_obras_updated BEFORE UPDATE ON public.obras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pagos_updated BEFORE UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();