import { useState } from 'react'
import { useRooms } from './hooks/useRooms'
import { useStartSimulation } from './hooks/useStartSimulation' // 👈 Import your new hook

function App() {
  const [isSimulationActive, setIsSimulationActive] = useState(false)
  // Track which of the 4 backend scenarios is currently highlighted by the user
  const [selectedScenario, setSelectedScenario] = useState<number>(1)

  // Consume your two architect layer hooks
  const { data: rooms, isLoading, error } = useRooms(isSimulationActive)
  const { mutate: startSimulation, isPending: isStartingEngine } = useStartSimulation() // 👈 Instantiate mutation

  // Handle click event for starting the mock environment run
  const handleToggleSimulation = () => {
    if (!isSimulationActive) {
      // 🚀 Trigger our mutation hook to execute the selected backend path!
      startSimulation({ scenario_id: selectedScenario })
      setIsSimulationActive(true)
    } else {
      setIsSimulationActive(false)
    }
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ color: '#1D9E75' }}>Smart Campus Control Panel</h1>
        <p>Data-Sync Layer Testing Dashboard</p>
      </header>

      {/* Simulation Engine Controls Panel */}
      <section style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3>Simulation Engine Controls</h3>
        
        {/* Radio Selection Group for your 4 Backend Scenarios */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>Select Simulation Scenario Path:</label>
          {[
            { id: 1, label: 'Scenario 1: Basic Flow (Static Schedule Matching)' },
            { id: 2, label: 'Scenario 2: Conflict (Dynamic Schedule vs Crowdsource Variance)' },
            { id: 3, label: 'Scenario 3: Spam Attack (Resilience Verification Testing)' },
            { id: 4, label: 'Scenario 4: VIP Pass (Instructor Presence Override Mode)' }
          ].map((scenario) => (
            <label key={scenario.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input 
                type="radio" 
                name="scenario" 
                checked={selectedScenario === scenario.id}
                onChange={() => setSelectedScenario(scenario.id)}
                disabled={isSimulationActive} // Lock picker down while running
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
            opacity: isStartingEngine ? 0.7 : 1
          }}
        >
          {isStartingEngine ? '⏳ Contacting Server...' : isSimulationActive ? '⏹ Stop Simulation' : '▶ Start Simulation'}
        </button>
        
        <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
          Status: <strong>{isSimulationActive ? `Running Scenario ${selectedScenario} (Polling active)` : 'Idle'}</strong>
        </p>
      </section>

      {/* Live Rooms List UI Block */}
      <section>
        <h3>Live Room Status List</h3>
        {isLoading && <p>Loading classroom records from database...</p>}
        {error && <p style={{ color: '#E24B4A' }}>Error connecting to backend server.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rooms?.map((room) => (
            <div key={room.room_id} style={{ border: '1px solid #ddd', borderRadius: '6px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
              <div><strong>Building {room.building_number}</strong> — Room {room.room_id}</div>
              <span style={{ backgroundColor: room.occupancy_status === 'FREE' ? '#E1F5EE' : '#FCEBEB', color: room.occupancy_status === 'FREE' ? '#1D9E75' : '#E24B4A', padding: '4px 12px', borderRadius: '12px', fontSize: '14px', fontWeight: 'bold' }}>
                {room.occupancy_status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App