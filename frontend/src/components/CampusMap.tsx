import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import type { Room } from '../hooks/useRooms'
import 'leaflet/dist/leaflet.css'

const CAMPUS_CENTER: [number, number] = [32.0684, 34.8434]
const CAMPUS_ZOOM = 16

const BUILDING_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  '102': { lat: 32.06575, lng: 34.84075, name: 'בניין 102 — ביראד' },
  '105': { lat: 32.06601, lng: 34.84173, name: 'בניין 105 — כיתות' },
  '202': { lat: 32.06670, lng: 34.84150, name: 'בניין 202 — פיזיקה' },
  '203': { lat: 32.06670, lng: 34.84212, name: 'בניין 203 — פיזיקה' },
  '207': { lat: 32.06699, lng: 34.84213, name: 'בניין 207 — כימיה' },
  '211': { lat: 32.06739, lng: 34.84178, name: 'בניין 211 — מדעים מדויקים' },
  '212': { lat: 32.06770, lng: 34.84178, name: 'בניין 212 — מדעי החיים' },
  '213': { lat: 32.06805, lng: 34.84178, name: 'בניין 213 — מדעי החברה' },

  '301': { lat: 32.06645, lng: 34.84360, name: 'בניין 301 — מרכז הקונגרסים' },
  '304': { lat: 32.06690, lng: 34.84318, name: 'בניין 304 — אולמות הרצאה' },
  '305': { lat: 32.06698, lng: 34.84390, name: 'בניין 305 — משפטים' },
  '306': { lat: 32.06710, lng: 34.84440, name: 'בניין 306 — משפטים' },

  '402': { lat: 32.06802, lng: 34.843200, name: 'בניין 402 — הנהלה' },
  '403': { lat: 32.06838, lng: 34.84322, name: 'בניין 403 — שירות לסטודנט' },
  '404': { lat: 32.06875, lng: 34.84318, name: 'בניין 404 — שירות לסטודנט' },
  '410': { lat: 32.06913, lng: 34.84364, name: 'בניין 410 — מדעי היהדות' },

  '501': { lat: 32.06980, lng: 34.84260, name: 'בניין 501 — אולם הספורט' },
  '502': { lat: 32.06992, lng: 34.84320, name: 'בניין 502 — כיתות' },
  '503': { lat: 32.06989, lng: 34.84376, name: 'בניין 503 — מדעי המחשב' },
  '504': { lat: 32.06967, lng: 34.84435, name: 'בניין 504 — כלכלה, מנהע״ס' },
  '505': { lat: 32.07045, lng: 34.84447, name: 'בניין 505 — כיתות' },
  '507': { lat: 32.07100, lng: 34.844423, name: 'בניין 507 — כיתות' },
  // what's 508? where is this class?
  '508': { lat: 32.07158, lng: 34.84398, name: 'בניין 508 — כיתות' },

  '604': { lat: 32.07030, lng: 34.84383, name: 'בניין 604 — בין-תחומיים' },
  '605': { lat: 32.07035, lng: 34.84350, name: 'בניין 605 — מעבדות מחשב' },
  '901': { lat: 32.07257, lng: 34.84600, name: 'בניין 901 — חקר המוח' },
  '902': { lat: 32.07290, lng: 34.84641, name: 'בניין 902 — פסיכולוגיה' },
  '905': { lat: 32.07312, lng: 34.84579, name: 'בניין 905 — חינוך' },
  '1002': { lat: 32.07380, lng: 34.84675, name: 'בניין 1002 — מדעי הרוח' },
  '1004': { lat: 32.07383, lng: 34.84733, name: 'בניין 1004 — שפות' },
  '1005': { lat: 32.07399, lng: 34.84766, name: 'בניין 1005 — מוזיקה' },
  '1102': { lat: 32.07337, lng: 34.84890, name: 'בניין 1102 — הנדסה' },
  '1103': { lat: 32.07322, lng: 34.84910, name: 'בניין 1103 — הנדסה' },
  '1104': { lat: 32.07305, lng: 34.84929, name: 'בניין 1104 — הנדסה' },
  '1105': { lat: 32.07290, lng: 34.84947, name: 'בניין 1105 — הנדסה' },
  '1401': { lat: 32.07162, lng: 34.84673, name: 'בניין 1401 — מרכז וואהל' },
  'A1300': { lat: 32.07238, lng: 34.84995, name: 'בניין A1300 — מעונות פארק 100' },
}

const STATUS_COLORS: Record<string, string> = {
  FREE: '#1D9E75',
  BUSY: '#E24B4A',
  PARTIAL: '#EF9F27',
  UNKNOWN: '#888780',
}

const STATUS_LABELS: Record<string, string> = {
  FREE: 'פנוי',
  BUSY: 'תפוס',
  PARTIAL: 'חלקי',
  UNKNOWN: 'לא ידוע',
}

function aggregateBuildingStatus(rooms: Room[] | undefined) {
  const buildingMap: Record<string, { total: number; free: number; busy: number; rooms: Room[] }> = {}

  if (!rooms || rooms.length === 0) {
    return Object.entries(BUILDING_COORDS).map(([code, coords]) => ({
      code,
      ...coords,
      status: 'UNKNOWN' as const,
      freeCount: 0,
      totalCount: 0,
      rooms: [] as Room[],
    }))
  }

  for (const room of rooms) {
    const bCode = room.building_number
    if (!buildingMap[bCode]) {
      buildingMap[bCode] = { total: 0, free: 0, busy: 0, rooms: [] }
    }
    buildingMap[bCode].total++
    buildingMap[bCode].rooms.push(room)
    if (room.occupancy_status === 'FREE') buildingMap[bCode].free++
    if (room.occupancy_status === 'BUSY') buildingMap[bCode].busy++
  }

  return Object.entries(BUILDING_COORDS).map(([code, coords]) => {
    const data = buildingMap[code]
    let status: string = 'UNKNOWN'
    if (data) {
      if (data.free === data.total) status = 'FREE'
      else if (data.busy === data.total) status = 'BUSY'
      else if (data.free > 0) status = 'PARTIAL'
      else status = 'BUSY'
    }
    return {
      code,
      ...coords,
      status,
      freeCount: data?.free ?? 0,
      totalCount: data?.total ?? 0,
      rooms: data?.rooms ?? [],
    }
  })
}

function MapResizer() {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
  }, [map])
  return null
}

interface CampusMapProps {
  rooms: Room[] | undefined
}

export default function CampusMap({ rooms }: CampusMapProps) {
  const buildings = aggregateBuildingStatus(rooms)

  return (
    <MapContainer
      center={CAMPUS_CENTER}
      zoom={CAMPUS_ZOOM}
      style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
      scrollWheelZoom={true}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <MapResizer />

      {buildings.map((building) => (
        <CircleMarker
          key={building.code}
          center={[building.lat, building.lng]}
          radius={14}
          pathOptions={{
            fillColor: STATUS_COLORS[building.status] ?? STATUS_COLORS.UNKNOWN,
            fillOpacity: 0.85,
            color: '#fff',
            weight: 2,
          }}
        >
          <Popup>
            <div style={{ direction: 'rtl', textAlign: 'right', minWidth: 160 }}>
              <strong style={{ fontSize: 16 }}>{building.name}</strong>
              <div style={{ margin: '8px 0', padding: '4px 8px', borderRadius: 8, background: STATUS_COLORS[building.status] + '22', color: STATUS_COLORS[building.status], fontWeight: 700, display: 'inline-block' }}>
                {STATUS_LABELS[building.status] ?? 'לא ידוע'}
              </div>
              {building.totalCount > 0 && (
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                  {building.freeCount} מתוך {building.totalCount} כיתות פנויות
                </div>
              )}
              {building.rooms.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, maxHeight: 120, overflowY: 'auto' }}>
                  {[...building.rooms].sort((a, b) => a.room_id.localeCompare(b.room_id, undefined, { numeric: true })).map((r) => (
                    <div key={r.room_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #eee' }}>
                      <span>חדר {r.room_id}</span>
                      <span style={{ color: STATUS_COLORS[r.occupancy_status], fontWeight: 600 }}>
                        {STATUS_LABELS[r.occupancy_status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}