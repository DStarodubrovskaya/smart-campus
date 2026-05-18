import { useState, useRef, useEffect } from 'react'
import { useRooms } from './hooks/useRooms'
import { useStartSimulation } from './hooks/useStartSimulation'
import { useSimulationLogs } from './hooks/useSimulationLogs' // 👈 Import your new hook

function App() {
  const [isSimulationActive, setIsSimulationActive] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState<number>(1)

  // Anchor reference to force our terminal block to auto-scroll down
  const terminalBottomRef = useRef<HTMLDivElement>(null)

  // Consume your three architect layer hooks
  const { data: rooms, isLoading: roomsLoading, error: roomsError } = useRooms(isSimulationActive)
  const { mutate: startSimulation, isPending: isStartingEngine } = useStartSimulation()
  const { data: logs } = useSimulationLogs(isSimulationActive) // 👈 Instantiate log streams

  // Auto-scroll logic: triggered every time the logs array changes size
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  const handleToggleSimulation = () => {
    if (!isSimulationActive) {
      startSimulation({ scenario_id: selectedScenario })
      setIsSimulationActive(true)
    } else {
      setIsSimulationActive(false)
    }
  }

  // Define styling colors based on log payload type
  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return '#1D9E75' // Green
      case 'warning': return '#EF9F27' // Yellow
      case 'error': return '#E24B4A'   // Red
      default: return '#ffffff'        // White Info
    }
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ color: '#1D9E75' }}>Smart Campus Control Panel</h1>
        <p>Data-Sync Layer Testing Dashboard</p>
      </header>

      {/* Grid Container to place list and terminal side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: CONTROLS & ROOM LISTS */}
        <div>
          {/* Controls Panel */}
          <section style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
            <h3>Simulation Engine Controls</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {[
                { id: 1, label: 'Scenario 1: Basic Flow' },
                { id: 2, label: 'Scenario 2: Conflict' },
                { id: 3, label: 'Scenario 3: Spam Attack' },
                { id: 4, label: 'Scenario 4: VIP Pass' }
              ].map((scenario) => (
                <label key={scenario.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input 
                    type="radio" 
                    name="scenario" 
                    checked={selectedScenario === scenario.id}
                    onChange={() => setSelectedScenario(scenario.id)}
                    disabled={isSimulationActive}
                  />
                  <span>{scenario.label}</span>
                </label>
              ))}
            </div>

            <button 
              onClick={handleToggleSimulation}
              disabled={isStartingEngine}
              style={{
                backgroundColor: isSimulationActive ? '#E24B4A' : '#1D9E75',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                fontSize: '16px',
                cursor: 'pointer',
                fontWeight: 'bold',
                width: '100%'
              }}
            >
              {isStartingEngine ? '⏳ Starting...' : isSimulationActive ? '⏹ Stop Engine' : '▶ Start Simulation'}
            </button>
          </section>

          {/* Rooms Status List */}
          <section>
            <h3>Live Room Status List</h3>
            {roomsLoading && <p>Loading...</p>}
            {roomsError && <p style={{ color: '#E24B4A' }}>Network error.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {rooms?.map((room) => (
                <div key={room.room_id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', backgroundColor: 'white', fontSize: '14px' }}>
                  <div>Room <strong>{room.room_id}</strong></div>
                  <span style={{ color: room.occupancy_status === 'FREE' ? '#1D9E75' : '#E24B4A', fontWeight: 'bold' }}>{room.occupancy_status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: TERMINAL REPORT LOG FEED */}
        <div>
          <h3>Real-Time Reports Terminal</h3>
          <div 
            style={{
              backgroundColor: '#1e1e1e',
              borderRadius: '8px',
              padding: '16px',
              height: '340px',
              overflowY: 'auto',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '13px',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
            }}
          >
            {/* Fallback if logs haven't started streaming yet */}
            {(!logs || logs.length === 0) && (
              <p style={{ color: '#888', fontStyle: 'italic', margin: 0 }}>
                &gt; Terminal idle. Start the simulation engine to view crowdsourced agent reports...
              </p>
            )}

            {/* Loop through each log statement coming from FastAPI */}
            {logs?.map((log) => (
              <div key={log.id} style={{ marginBottom: '8px', lineHeight: '1.4', color: getLogColor(log.type) }}>
                <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
                <strong>{log.agent_id}</strong> in Room {log.room_id}: {log.action}
              </div>
            ))}

            {/* Hidden dummy div used exclusively as an anchor tag for our auto-scroller */}
            <div ref={terminalBottomRef} />
          </div>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '8px', textAlign: 'right' }}>
            Terminal status: {isSimulationActive ? '🔴 Live Stream Recording' : '⚪ Offline'}
          </p>
        </div>

      </div>
    </div>
  )
}

export default App