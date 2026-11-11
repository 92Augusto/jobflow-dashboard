import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, updateDoc, addDoc, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  MapPin, Upload, Layers, CheckCircle2, Clock, AlertTriangle,
  ZoomIn, Navigation, Search, Trash2, FileText, X, Check, ShieldCheck
} from 'lucide-react'
import { procesarArchivoGis, ParsedGisResult, LatLng } from '@/lib/gisParser'

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type EstadoObra = 'en_curso' | 'completado' | 'pendiente'

export type ObraGeometria = {
  type: 'Polygon' | 'LineString' | 'Point'
  coordinates: LatLng[]
  areaM2?: number
  areaHa?: number
  perimeterM?: number
  bounds?: [LatLng, LatLng]
  fileName?: string
}

export type Obra = {
  id: string
  cliente: string
  descripcion: string
  presupuesto: number
  fechaInicio: string
  estado: EstadoObra
  notas: string
  userId: string
  createdAt?: any
  geometria?: ObraGeometria
}

interface MapaTabProps {
  obras: Obra[]
  userId: string
}

const ESTADO_COLORES: Record<EstadoObra, { fill: string; stroke: string; label: string }> = {
  completado: { fill: '#10B981', stroke: '#047857', label: 'Completado' },
  en_curso:   { fill: '#3B82F6', stroke: '#1D4ED8', label: 'En curso' },
  pendiente:  { fill: '#F59E0B', stroke: '#B45309', label: 'Pendiente' },
}

const LOCALIDADES_CORRIENTES: Array<{ nombre: string; coords: LatLng; zoom: number }> = [
  { nombre: 'Corrientes Capital', coords: [-27.4692, -58.8341], zoom: 14 },
  { nombre: 'Paso de la Patria', coords: [-27.3195, -58.5724], zoom: 14 },
  { nombre: 'Riachuelo', coords: [-27.5794, -58.7456], zoom: 14 },
  { nombre: 'Santa Ana de los Guácaras', coords: [-27.4589, -58.6577], zoom: 14 },
  { nombre: 'San Luis del Palmar', coords: [-27.5097, -58.5542], zoom: 14 },
  { nombre: 'Itatí', coords: [-27.2703, -58.2439], zoom: 14 },
  { nombre: 'Empedrado', coords: [-27.9547, -58.7958], zoom: 14 },
  { nombre: 'Bella Vista', coords: [-28.5086, -59.0433], zoom: 14 },
  { nombre: 'Goya', coords: [-29.1417, -59.2639], zoom: 14 },
  { nombre: 'Ituzaingó', coords: [-27.5833, -56.6833], zoom: 14 },
]

export function MapaTab({ obras, userId }: MapaTabProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const layersGroupRef = useRef<any>(null)
  const previewLayerRef = useRef<any>(null)

  const [mapType, setMapType] = useState<'satelite' | 'calles' | 'hibrido'>('satelite')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoObra>('todos')
  const [busqueda, setBusqueda] = useState('')

  // Subida de archivos espaciales
  const [loadingFile, setLoadingFile] = useState(false)
  const [errorFile, setErrorFile] = useState('')
  const [gisResult, setGisResult] = useState<ParsedGisResult | null>(null)
  const [asignarModo, setAsignarModo] = useState<'existente' | 'nueva'>('existente')
  const [obraSeleccionadaId, setObraSeleccionadaId] = useState<string>('')
  
  // Formulario para nueva obra a partir de archivo
  const [nuevaCliente, setNuevaCliente] = useState('')
  const [nuevaDescripcion, setNuevaDescripcion] = useState('')
  const [nuevaPresupuesto, setNuevaPresupuesto] = useState('')
  const [nuevaEstado, setNuevaEstado] = useState<EstadoObra>('en_curso')
  const [guardando, setGuardando] = useState(false)
  const [mensajeExito, setMensajeExito] = useState('')

  // ─── INICIALIZAR LEAFLET ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function initMap() {
      if (typeof window === 'undefined' || !mapContainerRef.current) return
      if (mapInstanceRef.current) return

      const L = (await import('leaflet')).default

      // Fix standard leaflet icon path issues
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapContainerRef.current, {
        center: [-27.4692, -58.8341],
        zoom: 13,
        zoomControl: true,
      })

      // Layer Satelital ESRI World Imagery (Por defecto)
      const esriSatelite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; World Imagery' }
      )

      // Layer Calles OpenStreetMap
      const osmCalles = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
      )

      // Layer Etiquetas y Rutas de Referencia
      const esriEtiquetas = L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }
      )

      const layerHibrido = L.layerGroup([esriSatelite, esriEtiquetas])

      // Añadir la capa inicial
      esriSatelite.addTo(map)

      mapInstanceRef.current = map
      ;(map as any)._customLayers = {
        satelite: esriSatelite,
        calles: osmCalles,
        hibrido: layerHibrido,
      }

      layersGroupRef.current = L.featureGroup().addTo(map)
      previewLayerRef.current = L.featureGroup().addTo(map)
    }

    initMap()

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // ─── CAMBIAR CAPA BASE DEL MAPA ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !(map as any)._customLayers) return

    const { satelite, calles, hibrido } = (map as any)._customLayers

    map.removeLayer(satelite)
    map.removeLayer(calles)
    map.removeLayer(hibrido)

    if (mapType === 'satelite') satelite.addTo(map)
    else if (mapType === 'calles') calles.addTo(map)
    else if (mapType === 'hibrido') hibrido.addTo(map)
  }, [mapType])

  // ─── DIBUJAR OBRAS EN EL MAPA ───────────────────────────────────────────────
  useEffect(() => {
    async function renderObras() {
      const map = mapInstanceRef.current
      const group = layersGroupRef.current
      if (!map || !group) return

      const L = (await import('leaflet')).default
      group.clearLayers()

      const obrasFiltradas = obras.filter(o => {
        if (!o.geometria || !o.geometria.coordinates || o.geometria.coordinates.length === 0) return false
        if (filtroEstado !== 'todos' && o.estado !== filtroEstado) return false
        if (busqueda.trim()) {
          const q = busqueda.toLowerCase()
          return o.cliente.toLowerCase().includes(q) || o.descripcion.toLowerCase().includes(q)
        }
        return true
      })

      const allBounds: any[] = []

      obrasFiltradas.forEach(obra => {
        const geom = obra.geometria!
        const cfg = ESTADO_COLORES[obra.estado ?? 'pendiente']

        let layer: any = null

        if (geom.type === 'Polygon' && geom.coordinates.length >= 3) {
          layer = L.polygon(geom.coordinates, {
            color: cfg.stroke,
            weight: 2.5,
            fillColor: cfg.fill,
            fillOpacity: 0.45,
          })
        } else if (geom.type === 'LineString' && geom.coordinates.length >= 2) {
          layer = L.polyline(geom.coordinates, {
            color: cfg.stroke,
            weight: 3.5,
          })
        } else if (geom.coordinates.length > 0) {
          layer = L.marker(geom.coordinates[0])
        }

        if (layer) {
          // Tooltip con nombre del cliente
          layer.bindTooltip(`<strong>${obra.cliente}</strong><br/>${obra.descripcion}`, {
            direction: 'top',
            offset: [0, -10],
          })

          // Popup completo interactivo
          const areaInfo = geom.areaM2
            ? `<div style="font-size:12px; margin:4px 0;"><strong>📐 Superficie:</strong> ${geom.areaM2.toLocaleString('es-AR')} m² (${geom.areaHa} Ha.)</div>`
            : ''
          const perimInfo = geom.perimeterM
            ? `<div style="font-size:12px; margin:2px 0;"><strong>📏 Perímetro:</strong> ${geom.perimeterM} m</div>`
            : ''

          const popupContent = `
            <div style="font-family: inherit; min-width: 200px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; background:${cfg.fill}20; color:${cfg.stroke};">
                  ${cfg.label}
                </span>
                <span style="font-size:10px; color:#6B7280;">${obra.fechaInicio || ''}</span>
              </div>
              <h4 style="margin:0 0 4px 0; font-size:14px; font-weight:700; color:#111827;">${obra.cliente}</h4>
              <p style="margin:0 0 6px 0; font-size:12px; color:#4B5563;">${obra.descripcion}</p>
              ${areaInfo}
              ${perimInfo}
              ${geom.fileName ? `<div style="font-size:10px; color:#9CA3AF; margin-top:4px;">Archivo: ${geom.fileName}</div>` : ''}
              <hr style="margin:8px 0; border:0; border-top:1px solid #E5E7EB;"/>
              <button id="btn-remover-${obra.id}" style="width:100%; background:#FEE2E2; border:1px solid #FCA5A5; color:#991B1B; border-radius:6px; padding:4px 8px; font-size:11px; font-weight:600; cursor:pointer;">
                Desvincular polígono de esta obra
              </button>
            </div>
          `

          layer.bindPopup(popupContent)

          layer.on('popupopen', () => {
            const btnRemover = document.getElementById(`btn-remover-${obra.id}`)
            if (btnRemover) {
              btnRemover.onclick = async () => {
                if (window.confirm(`¿Deseas quitar la geometría asociada a ${obra.cliente}?`)) {
                  await desvincularGeometria(obra.id)
                  layer.closePopup()
                }
              }
            }
          })

          group.addLayer(layer)
          allBounds.push(layer.getBounds ? layer.getBounds() : layer.getLatLng())
        }
      })
    }

    renderObras()
  }, [obras, filtroEstado, busqueda])

  // ─── PROCESAMIENTO DE ARCHIVO SUBIDO (.KML / .KMZ / .DXF) ────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoadingFile(true)
    setErrorFile('')
    setGisResult(null)

    try {
      // Determinar punto de referencia central para DXF locales
      const map = mapInstanceRef.current
      const center = map ? [map.getCenter().lat, map.getCenter().lng] as LatLng : undefined

      const result = await procesarArchivoGis(file, center)
      if (result.features.length === 0) {
        throw new Error('No se detectaron polígonos, líneas o puntos en el archivo.')
      }

      setGisResult(result)

      // Cargar valores por defecto para nueva obra
      const primerFeature = result.features[0]
      setNuevaCliente(primerFeature.name || file.name.replace(/\.[^/.]+$/, ''))
      setNuevaDescripcion(`Levantamiento de ${primerFeature.name || 'parcela'} (${result.totalAreaM2} m²)`)
      setNuevaPresupuesto('')

      // Dibujar vista previa en color cian brillante en el mapa
      const L = (await import('leaflet')).default
      if (previewLayerRef.current) {
        previewLayerRef.current.clearLayers()
        result.features.forEach(f => {
          if (f.type === 'Polygon' && f.coordinates.length >= 3) {
            const poly = L.polygon(f.coordinates, {
              color: '#06B6D4',
              weight: 3,
              fillColor: '#06B6D4',
              fillOpacity: 0.35,
              dashArray: '4, 4',
            })
            poly.bindTooltip(`Previsualización: ${f.name} (${f.areaM2} m²)`).openTooltip()
            previewLayerRef.current.addLayer(poly)
          }
        })
      }

      // Hacer zoom automático al lote cargado
      if (map && result.bounds) {
        map.flyToBounds(result.bounds, { padding: [40, 40], maxZoom: 18 })
      }
    } catch (err: any) {
      setErrorFile(err.message || 'Error al procesar archivo.')
    } finally {
      setLoadingFile(false)
      // reset input
      e.target.value = ''
    }
  }

  // ─── GUARDAR GEOMETRÍA EN LA OBRA ────────────────────────────────────────────
  async function handleGuardarGeometria() {
    if (!gisResult || gisResult.features.length === 0) return
    setGuardando(true)
    setErrorFile('')

    try {
      const feat = gisResult.features[0]
      const geomData: ObraGeometria = {
        type: feat.type,
        coordinates: feat.coordinates,
        areaM2: feat.areaM2,
        areaHa: feat.areaHa,
        perimeterM: feat.perimeterM,
        bounds: feat.bounds,
        fileName: gisResult.fileName,
      }

      if (asignarModo === 'existente') {
        if (!obraSeleccionadaId) {
          throw new Error('Por favor seleccioná a qué obra asignar la geometría.')
        }
        await updateDoc(doc(db, 'obras', obraSeleccionadaId), {
          geometria: geomData,
        })
        setMensajeExito(`¡Geometría asignada con éxito a la obra!`)
      } else {
        if (!nuevaCliente.trim()) {
          throw new Error('El nombre del cliente es obligatorio.')
        }
        await addDoc(collection(db, 'obras'), {
          cliente: nuevaCliente.trim(),
          descripcion: nuevaDescripcion.trim() || 'Mensura georreferenciada',
          presupuesto: parseFloat(nuevaPresupuesto) || 0,
          fechaInicio: new Date().toISOString().split('T')[0],
          estado: nuevaEstado,
          notas: `Geometría importada desde ${gisResult.fileName} (${feat.areaM2} m²)`,
          userId,
          createdAt: serverTimestamp(),
          geometria: geomData,
        })
        setMensajeExito(`¡Nueva obra creada y geolocalizada en el mapa!`)
      }

      // Limpiar previsualización
      if (previewLayerRef.current) previewLayerRef.current.clearLayers()
      setGisResult(null)
      setTimeout(() => setMensajeExito(''), 4500)
    } catch (err: any) {
      setErrorFile(err.message || 'Error al guardar geometría.')
    } finally {
      setGuardando(false)
    }
  }

  async function desvincularGeometria(obraId: string) {
    try {
      await updateDoc(doc(db, 'obras', obraId), {
        geometria: null,
      })
      setMensajeExito('Polígono desvinculado de la obra.')
      setTimeout(() => setMensajeExito(''), 3000)
    } catch (e: any) {
      alert('Error al desvincular: ' + e.message)
    }
  }

  function enfocarTodasLasObras() {
    const map = mapInstanceRef.current
    const group = layersGroupRef.current
    if (map && group && group.getLayers().length > 0) {
      map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 17 })
    }
  }

  function volarALocalidad(coords: LatLng, zoom: number) {
    const map = mapInstanceRef.current
    if (map) {
      map.flyTo(coords, zoom, { duration: 1.5 })
    }
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const map = mapInstanceRef.current
        if (map) {
          const latLng: LatLng = [pos.coords.latitude, pos.coords.longitude]
          map.flyTo(latLng, 17)
        }
      },
      err => alert('No se pudo obtener la ubicación: ' + err.message),
      { enableHighAccuracy: true }
    )
  }

  // Métricas para la barra superior
  const obrasConMapa = obras.filter(o => o.geometria && o.geometria.coordinates?.length > 0)
  const totalM2Relevados = obrasConMapa.reduce((acc, o) => acc + (o.geometria?.areaM2 || 0), 0)
  const totalHaRelevadas = Math.round((totalM2Relevados / 10000) * 100) / 100

  return (
    <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }} className="flex flex-col gap-4">
      {/* ─── BARRA DE ESTADÍSTICAS Y ACCIONES ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div style={{ background: 'var(--color-background-primary)', borderRadius: '12px', padding: '12px 16px', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>OBRAS GEORREFERENCIADAS</div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#0F6E56' }}>
            {obrasConMapa.length} <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>/ {obras.length} obras</span>
          </div>
        </div>

        <div style={{ background: 'var(--color-background-primary)', borderRadius: '12px', padding: '12px 16px', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>SUPERFICIE EN MAPA</div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
            {totalHaRelevadas} <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Ha. ({totalM2Relevados.toLocaleString('es-AR')} m²)</span>
          </div>
        </div>

        <div style={{ background: 'var(--color-background-primary)', borderRadius: '12px', padding: '12px 16px', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>COMPLETADAS EN MAPA</div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#10B981' }}>
            {obrasConMapa.filter(o => o.estado === 'completado').length}
          </div>
        </div>

        <div style={{ background: 'var(--color-background-primary)', borderRadius: '12px', padding: '12px 16px', border: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>EN CURSO / PENDIENTES</div>
          <div style={{ fontSize: '20px', fontWeight: '600', color: '#3B82F6' }}>
            {obrasConMapa.filter(o => o.estado !== 'completado').length}
          </div>
        </div>
      </div>

      {mensajeExito && (
        <div style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#0F6E56', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check style={{ width: '16px', height: '16px' }} />
          {mensajeExito}
        </div>
      )}

      {errorFile && (
        <div style={{ background: '#FEE2E2', border: '0.5px solid #FCA5A5', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle style={{ width: '16px', height: '16px' }} />
          {errorFile}
        </div>
      )}

      {/* ─── MODAL DE ASIGNACIÓN CUANDO SE SUBE UN ARCHIVO ─────────────────────── */}
      {gisResult && (
        <Card style={{ border: '2px solid #06B6D4', background: '#F0FDFA', position: 'relative' }}>
          <button
            onClick={() => {
              setGisResult(null)
              if (previewLayerRef.current) previewLayerRef.current.clearLayers()
            }}
            style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
          <CardHeader style={{ paddingBottom: '8px' }}>
            <CardTitle style={{ fontSize: '15px', color: '#0E7490', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 style={{ width: '18px', height: '18px', color: '#06B6D4' }} />
              Archivo Espacial Procesado: <strong>{gisResult.fileName}</strong>
            </CardTitle>
            <p style={{ fontSize: '12px', color: '#155E75' }}>
              Se detectaron <strong>{gisResult.features.length} elemento(s)</strong> con un área total de{' '}
              <strong>{gisResult.totalAreaM2.toLocaleString('es-AR')} m² ({gisResult.totalAreaHa} Ha)</strong>. El lote se muestra delineado en celeste sobre el mapa.
            </p>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: '600' }}>¿Cómo deseas registrarlo?</span>
              <div style={{ display: 'inline-flex', background: 'white', borderRadius: '6px', border: '1px solid #CBD5E1', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => setAsignarModo('existente')}
                  style={{
                    padding: '4px 10px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                    background: asignarModo === 'existente' ? '#0E7490' : 'transparent',
                    color: asignarModo === 'existente' ? 'white' : '#475569',
                  }}
                >
                  Asignar a Obra Existente
                </button>
                <button
                  type="button"
                  onClick={() => setAsignarModo('nueva')}
                  style={{
                    padding: '4px 10px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                    background: asignarModo === 'nueva' ? '#0E7490' : 'transparent',
                    color: asignarModo === 'nueva' ? 'white' : '#475569',
                  }}
                >
                  Crear Nueva Obra
                </button>
              </div>
            </div>

            {asignarModo === 'existente' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div>
                  <Label style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Seleccionar Obra *</Label>
                  <Select value={obraSeleccionadaId} onValueChange={setObraSeleccionadaId}>
                    <SelectTrigger style={{ background: 'white' }}>
                      <SelectValue placeholder="Elegí la obra del comitente…" />
                    </SelectTrigger>
                    <SelectContent>
                      {obras.map(o => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.cliente} — {o.descripcion} {o.geometria ? '(ya tiene polígono)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button
                    onClick={handleGuardarGeometria}
                    disabled={guardando || !obraSeleccionadaId}
                    style={{ background: '#0E7490', color: 'white', width: '100%' }}
                  >
                    <ShieldCheck style={{ width: '15px', height: '15px', marginRight: '6px' }} />
                    {guardando ? 'Guardando...' : 'Confirmar y Asignar al Mapa'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <Label style={{ fontSize: '11px', marginBottom: '4px', display: 'block' }}>Cliente *</Label>
                  <Input value={nuevaCliente} onChange={e => setNuevaCliente(e.target.value)} placeholder="García Juan Carlos" style={{ background: 'white' }} />
                </div>
                <div>
                  <Label style={{ fontSize: '11px', marginBottom: '4px', display: 'block' }}>Ubicación / Descripción</Label>
                  <Input value={nuevaDescripcion} onChange={e => setNuevaDescripcion(e.target.value)} placeholder="Calle Las Heras 450" style={{ background: 'white' }} />
                </div>
                <div>
                  <Label style={{ fontSize: '11px', marginBottom: '4px', display: 'block' }}>Presupuesto ($)</Label>
                  <Input type="number" value={nuevaPresupuesto} onChange={e => setNuevaPresupuesto(e.target.value)} placeholder="350000" style={{ background: 'white' }} />
                </div>
                <div>
                  <Button
                    onClick={handleGuardarGeometria}
                    disabled={guardando || !nuevaCliente.trim()}
                    style={{ background: '#0E7490', color: 'white', width: '100%' }}
                  >
                    <Plus style={{ width: '15px', height: '15px', marginRight: '6px' }} />
                    {guardando ? 'Creando...' : 'Crear Obra y Guardar Polígono'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── CONTENEDOR DEL MAPA Y PANEL LATERAL ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* MAPA PRINCIPAL */}
        <div className="lg:col-span-9 flex flex-col gap-3">
          {/* BARRA DE HERRAMIENTAS DEL MAPA */}
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            {/* Selector de capas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layers style={{ width: '14px', height: '14px' }} /> Capa:
              </span>
              <div style={{ display: 'inline-flex', background: 'var(--color-background-secondary)', borderRadius: '6px', padding: '2px', border: '1px solid var(--color-border-tertiary)' }}>
                {(['satelite', 'hibrido', 'calles'] as const).map(tipo => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setMapType(tipo)}
                    style={{
                      padding: '3px 8px', fontSize: '11px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      background: mapType === tipo ? '#0F6E56' : 'transparent',
                      color: mapType === tipo ? 'white' : 'var(--color-text-secondary)',
                      fontWeight: mapType === tipo ? '600' : 'normal',
                      textTransform: 'capitalize'
                    }}
                  >
                    {tipo === 'satelite' ? '🛰️ Satélite' : (tipo === 'hibrido' ? '🗺️ Híbrido' : '🏙️ Calles')}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector de Localidades de Corrientes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin style={{ width: '13px', height: '13px', color: '#0F6E56' }} />
              <select
                onChange={e => {
                  const loc = LOCALIDADES_CORRIENTES.find(l => l.nombre === e.target.value)
                  if (loc) volarALocalidad(loc.coords, loc.zoom)
                }}
                defaultValue="Corrientes Capital"
                style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)' }}
              >
                {LOCALIDADES_CORRIENTES.map(l => (
                  <option key={l.nombre} value={l.nombre}>{l.nombre}</option>
                ))}
              </select>
            </div>

            {/* Botones de acción rápida */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={enfocarTodasLasObras}
                title="Enfocar todas las parcelas relevadas"
                style={{ fontSize: '11px', padding: '0 8px', height: '28px' }}
              >
                <ZoomIn style={{ width: '13px', height: '13px', marginRight: '4px' }} />
                Ver Todas ({obrasConMapa.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={usarMiUbicacion}
                title="Centrar en mi ubicación actual GPS"
                style={{ fontSize: '11px', padding: '0 8px', height: '28px' }}
              >
                <Navigation style={{ width: '13px', height: '13px', marginRight: '4px' }} />
                GPS
              </Button>
            </div>
          </div>

          {/* VISOR MAPA LEAFLET */}
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: '620px',
              borderRadius: '12px',
              border: '1px solid var(--color-border-tertiary)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1,
            }}
          />
        </div>

        {/* PANEL LATERAL: SUBIDA & LISTA DE TRABAJOS */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* TARJETA DE SUBIDA DE ARCHIVOS GIS */}
          <Card>
            <CardHeader style={{ padding: '14px' }}>
              <CardTitle style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload style={{ width: '16px', height: '16px', color: '#0F6E56' }} />
                Importar Archivo Espacial
              </CardTitle>
              <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Subí archivos <strong>.kml</strong>, <strong>.kmz</strong> o <strong>.dxf</strong> de AutoCAD/GPS para ubicarlos en el mapa.
              </p>
            </CardHeader>
            <CardContent style={{ padding: '14px', paddingTop: 0 }}>
              <label
                style={{
                  border: '2px dashed var(--color-border-tertiary)',
                  borderRadius: '10px',
                  padding: '20px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: loadingFile ? 'wait' : 'pointer',
                  background: 'var(--color-background-secondary)',
                  textAlign: 'center',
                }}
              >
                <div style={{ background: '#0F6E5615', color: '#0F6E56', padding: '10px', borderRadius: '50%' }}>
                  <FileText style={{ width: '22px', height: '22px' }} />
                </div>
                <div style={{ fontSize: '12px', fontWeight: '600' }}>
                  {loadingFile ? 'Procesando coordenadas…' : 'Seleccionar o arrastrar archivo'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  Soporta .KML, .KMZ (Google Earth) y .DXF (AutoCAD POSGAR 07 / UTM)
                </div>
                <input
                  type="file"
                  accept=".kml,.kmz,.dxf"
                  onChange={handleFileUpload}
                  disabled={loadingFile}
                  style={{ display: 'none' }}
                />
              </label>
            </CardContent>
          </Card>

          {/* LISTA Y FILTRO DE OBRAS CON GEOMETRÍA */}
          <Card style={{ flex: 1 }}>
            <CardHeader style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <CardTitle style={{ fontSize: '14px' }}>Trabajos Relevados</CardTitle>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>
                  {obrasConMapa.length} en mapa
                </span>
              </div>

              {/* Filtro por estado */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {(['todos', 'completado', 'en_curso', 'pendiente'] as const).map(est => (
                  <button
                    key={est}
                    type="button"
                    onClick={() => setFiltroEstado(est)}
                    style={{
                      padding: '2px 6px', fontSize: '10px', borderRadius: '4px',
                      border: '1px solid var(--color-border-tertiary)',
                      background: filtroEstado === est ? 'var(--color-background-tertiary)' : 'transparent',
                      color: filtroEstado === est ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      fontWeight: filtroEstado === est ? '600' : 'normal',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {est === 'todos' ? 'Todos' : ESTADO_COLORES[est].label}
                  </button>
                ))}
              </div>

              {/* Búsqueda rápida */}
              <div style={{ position: 'relative', marginTop: '8px' }}>
                <Input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente o calle…"
                  style={{ fontSize: '11px', height: '28px', paddingLeft: '24px' }}
                />
                <Search style={{ width: '12px', height: '12px', position: 'absolute', left: '8px', top: '8px', color: 'var(--color-text-secondary)' }} />
              </div>
            </CardHeader>
            <CardContent style={{ padding: '14px', paddingTop: 0, maxHeight: '340px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {obrasConMapa.length === 0 ? (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                    No hay obras georreferenciadas todavía. Subí un archivo .kml o .dxf para comenzar.
                  </p>
                ) : (
                  obrasConMapa.map(obra => {
                    const cfg = ESTADO_COLORES[obra.estado ?? 'pendiente']
                    return (
                      <div
                        key={obra.id}
                        onClick={() => {
                          const map = mapInstanceRef.current
                          if (map && obra.geometria) {
                            if (obra.geometria.bounds) {
                              map.flyToBounds(obra.geometria.bounds, { padding: [40, 40], maxZoom: 18 })
                            } else if (obra.geometria.coordinates?.[0]) {
                              map.flyTo(obra.geometria.coordinates[0], 17)
                            }
                          }
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border-tertiary)',
                          background: 'var(--color-background-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                            {obra.cliente}
                          </span>
                          <span style={{ fontSize: '9px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px', background: `${cfg.fill}25`, color: cfg.stroke }}>
                            {cfg.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {obra.descripcion}
                        </div>
                        {obra.geometria?.areaM2 && (
                          <div style={{ fontSize: '10px', color: '#0F6E56', fontWeight: '500' }}>
                            📐 {obra.geometria.areaM2.toLocaleString('es-AR')} m² ({obra.geometria.areaHa} Ha)
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
