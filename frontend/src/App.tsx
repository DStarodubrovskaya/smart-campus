import { useState } from 'react'
import { useRooms } from './hooks/useRooms'


function App() {
  // 1. Local state to toggle our simulation on and off (like a component property in Angular)
  const [isSimulationActive, setIsSimulationActive] = useState(false)

  // 2. Consume your custom data hook! React Query handles the loading and polling states for us.
  const { data: rooms, isLoading, error } = useRooms(isSimulationActive)

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h1 style={{ color: '#1D9E75' }}>Smart Campus Control Panel</h1>
        <p>Data-Sync Layer Testing Dashboard</p>
      </header>

      {/* Simulation Controls */}
      <section style={{ backgroundColor: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3>Simulation Engine Controls</h3>
        <button 
          onClick={() => setIsSimulationActive(!isSimulationActive)}
          style={{
            backgroundColor: isSimulationActive ? '#E24B4A' : '#1D9E75',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isSimulationActive ? '⏹ Stop Simulation' : '▶ Start Simulation'}
        </button>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Status: <strong>{isSimulationActive ? 'Polling API every 1s (Live mode)' : 'Idle'}</strong>
        </p>
      </section>

      {/* Live Rooms List */}
      <section>
        <h3>Live Room Status List</h3>
        
        {/* Angular equivalent: *ngIf="isLoading" */}
        {isLoading && <p>Loading classroom records from FastAPI...</p>}

        {/* Angular equivalent: *ngIf="error" */}
        {error && <p style={{ color: '#E24B4A' }}>Error connecting to backend server.</p>}

        {/* Angular equivalent: *ngFor="let room of rooms" */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rooms?.map((room) => (
            <div 
              key={room.room_id} 
              style={{
                border: '1px solid #ddd',
                borderRadius: '6px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'white'
              }}
            >
              <div>
                <strong>Building {room.building_number}</strong> — Room {room.room_id}
              </div>
              <span 
                style={{
                  backgroundColor: room.occupancy_status === 'FREE' ? '#E1F5EE' : '#FCEBEB',
                  color: room.occupancy_status === 'FREE' ? '#1D9E75' : '#E24B4A',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {room.occupancy_status}
              </span>
            </div>
          ))}

          {/* Quick fallback if data array is empty */}
          {rooms?.length === 0 && <p>No rooms returned from the server database.</p>}
        </div>
      </section>
    </div>
  )
}

export default App