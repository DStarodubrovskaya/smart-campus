import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet'
import { useEffect, useState } from 'react'
import L from 'leaflet'
import type { Room } from '../hooks/useRooms'
import 'leaflet/dist/leaflet.css'

const CAMPUS_CENTER: [number, number] = [32.0684, 34.8434]
const CAMPUS_ZOOM = 16

const BUILDING_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  '102': { lat: 32.06575, lng: 34.84075, name: 'בניין 102' },
  '105': { lat: 32.06601, lng: 34.84173, name: 'בניין 105' },
  '202': { lat: 32.06670, lng: 34.84150, name: 'בניין 202' },
  '203': { lat: 32.06670, lng: 34.84212, name: 'בניין 203' },
  '207': { lat: 32.06699, lng: 34.84213, name: 'בניין 207' },
  '211': { lat: 32.06739, lng: 34.84178, name: 'בניין 211' },
  '212': { lat: 32.06770, lng: 34.84178, name: 'בניין 212' },
  '213': { lat: 32.06805, lng: 34.84178, name: 'בניין 213' },

  '301': { lat: 32.06645, lng: 34.84360, name: 'בניין 301' },
  '304': { lat: 32.06690, lng: 34.84318, name: 'בניין 304' },
  '305': { lat: 32.06698, lng: 34.84390, name: 'בניין 305' },
  '306': { lat: 32.06710, lng: 34.84440, name: 'בניין 306' },

  '402': { lat: 32.06802, lng: 34.843200, name: 'בניין 402' },
  '403': { lat: 32.06838, lng: 34.84322, name: 'בניין 403' },
  '404': { lat: 32.06875, lng: 34.84318, name: 'בניין 404' },
  '410': { lat: 32.06913, lng: 34.84364, name: 'בניין 410' },

  '501': { lat: 32.06980, lng: 34.84260, name: 'בניין 501' },
  '502': { lat: 32.06992, lng: 34.84320, name: 'בניין 502' },
  '503': { lat: 32.06989, lng: 34.84376, name: 'בניין 503' },
  '504': { lat: 32.06967, lng: 34.84435, name: 'בניין 504' },
  '505': { lat: 32.07045, lng: 34.84447, name: 'בניין 505' },
  '507': { lat: 32.07100, lng: 34.844423, name: 'בניין 507' },
  '508': { lat: 32.07158, lng: 34.84398, name: 'בניין 508' },

  '604': { lat: 32.07030, lng: 34.84383, name: 'בניין 604' },
  '605': { lat: 32.07035, lng: 34.84350, name: 'בניין 605' },
  '901': { lat: 32.07257, lng: 34.84600, name: 'בניין 901' },
  '902': { lat: 32.07290, lng: 34.84641, name: 'בניין 902' },
  '905': { lat: 32.07312, lng: 34.84579, name: 'בניין 905' },
  '1002': { lat: 32.07380, lng: 34.84675, name: 'בניין 1002' },
  '1004': { lat: 32.07383, lng: 34.84733, name: 'בניין 1004' },
  '1005': { lat: 32.07399, lng: 34.84766, name: 'בניין 1005' },
  '1102': { lat: 32.07337, lng: 34.84890, name: 'בניין 1102' },
  '1103': { lat: 32.07322, lng: 34.84910, name: 'בניין 1103' },
  '1104': { lat: 32.07305, lng: 34.84929, name: 'בניין 1104' },
  '1105': { lat: 32.07290, lng: 34.84947, name: 'בניין 1105' },
  '1401': { lat: 32.07162, lng: 34.84673, name: 'בניין 1401' },
  'A1300': { lat: 32.07238, lng: 34.84995, name: 'A1300 בניין' },
}

const STATUS_COLORS: Record<string, string> = {
  FREE: '#006937',
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

// Circle marker with the live free-room count rendered inside it.
// `highlighted` enlarges + thicker white ring (search match); `dimmed` greys it out.
function buildingIcon(
  color: string,
  label: string,
  opts?: { highlighted?: boolean; dimmed?: boolean }
) {
  const size = opts?.highlighted ? 38 : 30
  const border = opts?.highlighted ? '3px solid #fff' : '2px solid #fff'
  const opacity = opts?.dimmed ? 0.35 : 1
  const fontSize = opts?.highlighted ? 15 : 13
  const shadow = opts?.highlighted
    ? '0 0 0 2px rgba(0,0,0,0.06), 0 3px 8px rgba(0,0,0,0.45)'
    : '0 1px 4px rgba(0,0,0,0.35)'
  return L.divIcon({
    className: 'building-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:${shadow};
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:700;font-size:${fontSize}px;line-height:1;
      font-family:'Assistant',sans-serif;opacity:${opacity};
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
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

// Smoothly pans the map to a building when search has a match.
function FlyToMatch({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap()
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], map.getZoom(), { duration: 0.5 })
    }
  }, [lat, lng, map])
  return null
}

// Popup content: status indicator on the left, compact fixed-height room list (~3 rows),
// free rooms only by default with a toggle for busy rooms and a search box by room number.
function BuildingPopup({ building }: { building: ReturnType<typeof aggregateBuildingStatus>[number] }) {
  const [showBusy, setShowBusy] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim()

  const visibleRooms = [...building.rooms]
    .filter((r) => {
      if (q) return r.room_id.includes(q)
      return showBusy ? true : r.occupancy_status === 'FREE'
    })
    .sort((a, b) => a.room_id.localeCompare(b.room_id, undefined, { numeric: true }))

  return (
    <div style={{ direction: 'rtl', textAlign: 'right', width: 180 }}>
      {/* Header: title on the right, colored status indicator on the left */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 15 }}>{building.name}</strong>
        <span style={{ padding: '3px 7px', borderRadius: 8, background: STATUS_COLORS[building.status] + '22', color: STATUS_COLORS[building.status], fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
          {STATUS_LABELS[building.status] ?? 'לא ידוע'}
        </span>
      </div>

      {building.totalCount > 0 && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
          {building.freeCount} מתוך {building.totalCount} כיתות פנויות
        </div>
      )}

      {building.totalCount > 0 && (
        <>
          <input
            type="text"
            inputMode="numeric"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי מספר חדר"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '5px 8px', fontSize: 12, border: '1px solid #ddd', borderRadius: 8, direction: 'rtl', textAlign: 'right', outline: 'none' }}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, fontSize: 11, color: '#444', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showBusy}
              onChange={(e) => setShowBusy(e.target.checked)}
              style={{ accentColor: STATUS_COLORS.FREE, width: 14, height: 14 }}
            />
            <span>הצג גם חדרים תפוסים</span>
          </label>

          {/* Compact fixed-height list: ~3 rooms visible, the rest scrolls */}
          <div style={{ marginTop: 7, fontSize: 12, height: 66, overflowY: 'auto' }}>
            {visibleRooms.length === 0 ? (
              <div style={{ color: '#999', padding: '5px 0' }}>
                {q ? 'לא נמצא חדר כזה' : 'אין חדרים פנויים כרגע'}
              </div>
            ) : (
              visibleRooms.map((r) => (
                <div key={r.room_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #eee' }}>
                  <span>חדר {r.room_id}</span>
                  <span style={{ color: STATUS_COLORS[r.occupancy_status], fontWeight: 600 }}>
                    {STATUS_LABELS[r.occupancy_status]}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
interface CampusMapProps {
  rooms: Room[] | undefined
}

export default function CampusMap({ rooms }: CampusMapProps) {
  const buildings = aggregateBuildingStatus(rooms)
  const [buildingQuery, setBuildingQuery] = useState('')
  const bq = buildingQuery.trim().toLowerCase()
  const isSearching = bq !== ''

  const isMatch = (b: (typeof buildings)[number]) =>
    !isSearching || b.code.toLowerCase().includes(bq) || b.name.toLowerCase().includes(bq)

  // First matching building → target for the smooth pan.
  const firstMatch = isSearching ? buildings.find((b) => isMatch(b)) : undefined

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Round, search-styled zoom buttons in the bottom-left corner */}
      <style>{`
        .leaflet-control-zoom {
          border: none !important;
          border-radius: 12px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
          font-size: 18px !important;
          font-weight: 700 !important;
          color: #004128 !important;
          background: #fff !important;
          border: none !important;
          font-family: 'Assistant', sans-serif !important;
        }
        .leaflet-control-zoom a:hover { background: #f3f4f6 !important; }
        .leaflet-control-zoom-in { border-bottom: 1px solid #eee !important; }
      `}</style>

      {/* Building search box overlaid on the map */}
      <div
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={buildingQuery}
            onChange={(e) => setBuildingQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="חיפוש בניין"
            style={{
              width: 130,
              boxSizing: 'border-box',
              padding: '8px 30px 8px 10px',
              fontSize: 13,
              fontWeight: 700,
              border: '1px solid #ddd',
              borderRadius: 12,
              direction: 'rtl',
              textAlign: 'right',
              outline: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              background: '#fff',
              fontFamily: "'Assistant',sans-serif",
            }}
          />
          {isSearching && (
            <button
              onClick={() => setBuildingQuery('')}
              style={{
                position: 'absolute',
                left: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 16,
                color: '#888',
                lineHeight: 1,
                padding: 2,
              }}
              aria-label="נקה חיפוש"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <MapContainer
        center={CAMPUS_CENTER}
        zoom={CAMPUS_ZOOM}
        style={{ height: '100%', width: '100%', borderRadius: '1.5rem' }}
        scrollWheelZoom={true}
        attributionControl={false}
        zoomControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <MapResizer />
        <ZoomControl position="bottomleft" />
        <FlyToMatch lat={firstMatch?.lat} lng={firstMatch?.lng} />

        {buildings.map((building) => {
          const matched = isMatch(building)
          const baseColor = STATUS_COLORS[building.status] ?? STATUS_COLORS.UNKNOWN
          const color = isSearching && !matched ? STATUS_COLORS.UNKNOWN : baseColor
          return (
            <Marker
              key={building.code}
              position={[building.lat, building.lng]}
              icon={buildingIcon(
                color,
                building.totalCount > 0 ? String(building.freeCount) : '',
                {
                  highlighted: isSearching && matched,
                  dimmed: isSearching && !matched,
                }
              )}
              zIndexOffset={isSearching && matched ? 1000 : 0}
            >
              <Popup>
                <BuildingPopup building={building} />
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}