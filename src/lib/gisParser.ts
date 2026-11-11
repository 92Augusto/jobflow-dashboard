import PizZip from 'pizzip'

// ─── TIPOS DE DATOS GEOGRÁFICOS ───────────────────────────────────────────────
export type LatLng = [number, number] // [lat, lng]

export type ParsedFeature = {
  name: string
  description?: string
  type: 'Polygon' | 'LineString' | 'Point'
  coordinates: LatLng[]
  center: LatLng
  areaM2: number
  areaHa: number
  perimeterM: number
  bounds: [LatLng, LatLng] // [[minLat, minLng], [maxLat, maxLng]]
}

export type ParsedGisResult = {
  fileName: string
  format: 'kml' | 'kmz' | 'dxf'
  features: ParsedFeature[]
  bounds: [LatLng, LatLng]
  totalAreaM2: number
  totalAreaHa: number
}

// ─── CÁLCULOS GEODÉSICOS Y GEOMÉTRICOS ────────────────────────────────────────
const EARTH_RADIUS = 6378137 // Radio medio de la Tierra en metros (WGS84)

/**
 * Calcula el área en m² de un polígono esférico dado por [lat, lng]
 */
export function calcularAreaM2(coords: LatLng[]): number {
  if (!coords || coords.length < 3) return 0
  const n = coords.length
  let total = 0

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p1 = coords[i]
    const p2 = coords[j]
    const lat1 = (p1[0] * Math.PI) / 180
    const lat2 = (p2[0] * Math.PI) / 180
    const lon1 = (p1[1] * Math.PI) / 180
    const lon2 = (p2[1] * Math.PI) / 180

    total += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }

  const area = Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 4)
  return Math.round(area * 100) / 100
}

/**
 * Calcula el perímetro en metros de un polígono o polilínea [lat, lng]
 */
export function calcularPerimetroM(coords: LatLng[], cerrado = true): number {
  if (!coords || coords.length < 2) return 0
  let perimetro = 0
  const count = cerrado ? coords.length : coords.length - 1

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % coords.length
    perimetro += distanciaMetros(coords[i], coords[j])
  }
  return Math.round(perimetro * 100) / 100
}

/**
 * Distancia Haversine entre dos puntos [lat, lng] en metros
 */
export function distanciaMetros(p1: LatLng, p2: LatLng): number {
  const dLat = ((p2[0] - p1[0]) * Math.PI) / 180
  const dLon = ((p2[1] - p1[1]) * Math.PI) / 180
  const lat1 = (p1[0] * Math.PI) / 180
  const lat2 = (p2[0] * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

/**
 * Calcula el centroide [lat, lng] y los límites de una lista de puntos
 */
export function calcularCentroYBounds(coords: LatLng[]): { center: LatLng; bounds: [LatLng, LatLng] } {
  if (!coords || coords.length === 0) {
    return { center: [-27.4692, -58.8341], bounds: [[-27.47, -58.84], [-27.46, -58.82]] }
  }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let sumLat = 0
  let sumLng = 0

  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    sumLat += lat
    sumLng += lng
  }

  const center: LatLng = [sumLat / coords.length, sumLng / coords.length]
  const bounds: [LatLng, LatLng] = [[minLat, minLng], [maxLat, maxLng]]
  return { center, bounds }
}

// ─── REPROYECCIÓN DE COORDENADAS AGRIMENSURA (GAUSS-KRÜGER / POSGAR / UTM) ─────
// Conversión Transversa de Mercator a WGS84 para Argentina (Corrientes Faja 5 o UTM)
function transverseMercatorToWgs84(
  x: number,
  y: number,
  lon0Deg: number,
  falseEasting = 500000,
  falseNorthing = 0
): LatLng {
  const a = 6378137.0 // WGS84 semi-major axis
  const f = 1 / 298.257223563
  const b = a * (1 - f)
  const e2 = (a * a - b * b) / (a * a)
  const ePrime2 = (a * a - b * b) / (b * b)
  const k0 = 1.0 // Gauss-Krüger scale factor = 1.0 (UTM = 0.9996)

  const xAdj = x - falseEasting
  const yAdj = y - falseNorthing

  const M = yAdj / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256))

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const J1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32
  const J2 = (21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32
  const J3 = (151 * Math.pow(e1, 3)) / 96
  const J4 = (1097 * Math.pow(e1, 4)) / 512

  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu)

  const C1 = ePrime2 * Math.cos(fp) * Math.cos(fp)
  const T1 = Math.tan(fp) * Math.tan(fp)
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.sin(fp) * Math.sin(fp), 1.5)
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(fp) * Math.sin(fp))
  const D = xAdj / (N1 * k0)

  // Latitud
  const lat =
    fp -
    ((N1 * Math.tan(fp)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ePrime2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ePrime2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720)

  // Longitud
  const lon =
    (lon0Deg * Math.PI) / 180 +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ePrime2 + 24 * Math.pow(T1, 2)) * Math.pow(D, 5)) / 120) /
      Math.cos(fp)

  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI]
}

/**
 * Autodetecta si las coordenadas vienen en Gauss-Krüger Faja 5 (Corrientes), UTM o WGS84
 */
export function autodetectarYReproyectar(x: number, y: number, anclaRef?: LatLng): LatLng {
  // Caso 1: Ya son coordenadas geográficas WGS84 (-90 <= lat <= 90 y -180 <= lng <= 180)
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [y, x] // Y es Latitud, X es Longitud
  }
  if (Math.abs(y) <= 180 && Math.abs(x) <= 90) {
    return [x, y] // X es Latitud, Y es Longitud
  }

  // Caso 2: Gauss-Krüger Argentina (Faja 5 - Meridiano Central -60°)
  // En Faja 5, X (Easting) suele ser 5.xxx.xxx (ej: 5.450.000 a 5.600.000)
  // y Y (Northing) se mide desde el Polo Sur (en Corrientes ~6.900.000 a 7.100.000)
  // Para transformar a origen Ecuador en hemisferio sur: Y_adj = Y - 10.000.000
  if (x > 5000000 && x < 6000000 && y > 6000000 && y < 8000000) {
    const falseNorthing = 10000000
    const pt = transverseMercatorToWgs84(x, y, -60, 5500000, falseNorthing)
    return pt
  }

  // Caso 3: Faja 6 (Misiones / Este de Corrientes - Meridiano Central -57°)
  if (x > 6000000 && x < 7000000 && y > 6000000 && y < 8000000) {
    const falseNorthing = 10000000
    const pt = transverseMercatorToWgs84(x, y, -57, 6500000, falseNorthing)
    return pt
  }

  // Caso 4: UTM Zona 20S (Meridiano Central -63°, False Easting 500000, False Northing 10000000)
  if (x > 100000 && x < 900000 && y > 6000000 && y < 8000000) {
    const pt = transverseMercatorToWgs84(x, y, -63, 500000, 10000000)
    return pt
  }

  // Caso 5: Coordenadas relativas locales (0,0 o arbitrarias)
  // Las anclamos en un punto de referencia (ej. Corrientes Capital o donde elija el agrimensor)
  const baseLat = anclaRef ? anclaRef[0] : -27.4692
  const baseLng = anclaRef ? anclaRef[1] : -58.8341
  const metersPerDegLat = 111132.95
  const metersPerDegLng = 111132.95 * Math.cos((baseLat * Math.PI) / 180)

  const dLat = y / metersPerDegLat
  const dLng = x / metersPerDegLng
  return [baseLat + dLat, baseLng + dLng]
}

// ─── PARSER KML ───────────────────────────────────────────────────────────────
export function parseKmlString(kmlText: string, fileName = 'archivo.kml'): ParsedGisResult {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(kmlText, 'text/xml')

  const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'))
  const features: ParsedFeature[] = []

  let totalArea = 0
  let allCoords: LatLng[] = []

  for (const pm of placemarks) {
    const nameEl = pm.getElementsByTagName('name')[0]
    const descEl = pm.getElementsByTagName('description')[0]
    const name = nameEl?.textContent?.trim() || `Parcela ${features.length + 1}`
    const description = descEl?.textContent?.trim() || ''

    // 1. Polígonos
    const polygons = Array.from(pm.getElementsByTagName('Polygon'))
    for (const poly of polygons) {
      const coordEls = poly.getElementsByTagName('coordinates')
      if (coordEls.length > 0) {
        const rawCoords = coordEls[0].textContent || ''
        const coords = parseKmlCoordinateString(rawCoords)
        if (coords.length >= 3) {
          const areaM2 = calcularAreaM2(coords)
          const perimetroM = calcularPerimetroM(coords, true)
          const { center, bounds } = calcularCentroYBounds(coords)
          allCoords = allCoords.concat(coords)
          totalArea += areaM2

          features.push({
            name,
            description,
            type: 'Polygon',
            coordinates: coords,
            center,
            areaM2,
            areaHa: Math.round((areaM2 / 10000) * 10000) / 10000,
            perimeterM: perimetroM,
            bounds,
          })
        }
      }
    }

    // 2. Líneas
    const lineStrings = Array.from(pm.getElementsByTagName('LineString'))
    for (const ls of lineStrings) {
      const coordEls = ls.getElementsByTagName('coordinates')
      if (coordEls.length > 0) {
        const coords = parseKmlCoordinateString(coordEls[0].textContent || '')
        if (coords.length >= 2) {
          const perimetroM = calcularPerimetroM(coords, false)
          const { center, bounds } = calcularCentroYBounds(coords)
          allCoords = allCoords.concat(coords)

          features.push({
            name,
            description,
            type: 'LineString',
            coordinates: coords,
            center,
            areaM2: 0,
            areaHa: 0,
            perimeterM: perimetroM,
            bounds,
          })
        }
      }
    }

    // 3. Puntos
    const points = Array.from(pm.getElementsByTagName('Point'))
    for (const pt of points) {
      const coordEls = pt.getElementsByTagName('coordinates')
      if (coordEls.length > 0) {
        const coords = parseKmlCoordinateString(coordEls[0].textContent || '')
        if (coords.length > 0) {
          allCoords.push(coords[0])
          features.push({
            name,
            description,
            type: 'Point',
            coordinates: coords,
            center: coords[0],
            areaM2: 0,
            areaHa: 0,
            perimeterM: 0,
            bounds: [coords[0], coords[0]],
          })
        }
      }
    }
  }

  const { bounds } = calcularCentroYBounds(allCoords)

  return {
    fileName,
    format: 'kml',
    features,
    bounds,
    totalAreaM2: Math.round(totalArea * 100) / 100,
    totalAreaHa: Math.round((totalArea / 10000) * 10000) / 10000,
  }
}

function parseKmlCoordinateString(coordStr: string): LatLng[] {
  const points: LatLng[] = []
  const clean = coordStr.trim().replace(/\s+/g, ' ')
  const pairs = clean.split(' ')

  for (const pair of pairs) {
    const parts = pair.split(',').map(s => parseFloat(s.trim()))
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      // KML format is longitude, latitude, altitude
      const lng = parts[0]
      const lat = parts[1]
      points.push([lat, lng])
    }
  }
  return points
}

// ─── PARSER KMZ ───────────────────────────────────────────────────────────────
export function parseKmzBuffer(buffer: ArrayBuffer | Uint8Array, fileName = 'archivo.kmz'): ParsedGisResult {
  const zip = new PizZip(buffer)
  // Search for .kml file inside
  const kmlFile = Object.keys(zip.files).find(name => name.toLowerCase().endsWith('.kml'))
  if (!kmlFile) {
    throw new Error('No se encontró ningún archivo .kml válido dentro del .kmz.')
  }

  const kmlText = zip.files[kmlFile].asText()
  const result = parseKmlString(kmlText, fileName)
  result.format = 'kmz'
  return result
}

// ─── PARSER DXF (AUTOCAD) ─────────────────────────────────────────────────────
export function parseDxfString(dxfText: string, fileName = 'archivo.dxf', anclaRef?: LatLng): ParsedGisResult {
  const lines = dxfText.split(/\r?\n/)
  const features: ParsedFeature[] = []
  let allCoords: LatLng[] = []

  let inEntities = false
  let currentEntity = ''
  let currentPoints: { x: number; y: number }[] = []
  let isClosed = false
  let entityLayer = ''

  function flushEntity() {
    if (currentPoints.length >= 2) {
      const latLngs = currentPoints.map(p => autodetectarYReproyectar(p.x, p.y, anclaRef))
      const isPoly = currentPoints.length >= 3 && isClosed
      const areaM2 = isPoly ? calcularAreaM2(latLngs) : 0
      const perimetroM = calcularPerimetroM(latLngs, isPoly)
      const { center, bounds } = calcularCentroYBounds(latLngs)

      allCoords = allCoords.concat(latLngs)

      features.push({
        name: entityLayer || `Polígono ${features.length + 1}`,
        description: `Importado de DXF (${currentEntity})`,
        type: isPoly ? 'Polygon' : 'LineString',
        coordinates: latLngs,
        center,
        areaM2,
        areaHa: Math.round((areaM2 / 10000) * 10000) / 10000,
        perimeterM: perimetroM,
        bounds,
      })
    }
    currentPoints = []
    isClosed = false
  }

  let i = 0
  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim(), 10)
    const val = lines[i + 1].trim()
    i += 2

    if (code === 0 && val === 'SECTION') {
      const nextCode = parseInt(lines[i]?.trim(), 10)
      const nextVal = lines[i + 1]?.trim()
      if (nextCode === 2 && nextVal === 'ENTITIES') {
        inEntities = true
        i += 2
      }
    } else if (code === 0 && val === 'ENDSEC') {
      if (inEntities) {
        flushEntity()
        inEntities = false
      }
    } else if (inEntities && code === 0) {
      flushEntity()
      currentEntity = val
      currentPoints = []
      isClosed = false
      entityLayer = ''
    } else if (inEntities) {
      if (code === 8) {
        entityLayer = val
      } else if (code === 70 && (currentEntity === 'LWPOLYLINE' || currentEntity === 'POLYLINE')) {
        const flag = parseInt(val, 10)
        if ((flag & 1) === 1) isClosed = true
      } else if (code === 10) {
        // X coord
        const x = parseFloat(val)
        // Look ahead for 20 (Y coord)
        if (i < lines.length - 1 && parseInt(lines[i].trim(), 10) === 20) {
          const y = parseFloat(lines[i + 1].trim())
          i += 2
          if (!isNaN(x) && !isNaN(y)) {
            currentPoints.push({ x, y })
          }
        }
      }
    }
  }

  flushEntity()

  let totalArea = 0
  for (const f of features) {
    totalArea += f.areaM2
  }

  const { bounds } = calcularCentroYBounds(allCoords)

  return {
    fileName,
    format: 'dxf',
    features,
    bounds,
    totalAreaM2: Math.round(totalArea * 100) / 100,
    totalAreaHa: Math.round((totalArea / 10000) * 10000) / 10000,
  }
}

// ─── PARSER UNIVERSAL DE ARCHIVOS GIS ─────────────────────────────────────────
export async function procesarArchivoGis(file: File, anclaRef?: LatLng): Promise<ParsedGisResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'kml') {
    const text = await file.text()
    return parseKmlString(text, file.name)
  }

  if (ext === 'kmz') {
    const buffer = await file.arrayBuffer()
    return parseKmzBuffer(buffer, file.name)
  }

  if (ext === 'dxf') {
    const text = await file.text()
    return parseDxfString(text, file.name, anclaRef)
  }

  throw new Error('Formato no soportado. Por favor sube un archivo .kml, .kmz o .dxf.')
}
