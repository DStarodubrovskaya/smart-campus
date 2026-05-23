import { useState, useRef, useEffect } from 'react'
import { useRooms } from './hooks/useRooms'
import { useStartSimulation } from './hooks/useStartSimulation'
import { useSimulationLogs } from './hooks/useSimulationLogs' // 👈 Import your new hook
import { useStopSimulation } from './hooks/useStopSimulation'

const CAMPUS_ROOM_MAP: Record<string, { b_code: string; room: string }> = {
  "1": { b_code: "507", room: "104" },
  "2": { b_code: "302", room: "08" },
  "3": { b_code: "310", room: "5" },
  "4": { b_code: "401", room: "12" },
  "5": { b_code: "205", room: "3" },
};

// Design Token Color Helper based on your official specification sheet [cite: 21, 22]
const getStatusStyles = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'FREE': return { bg: 'bg-[#E1F5EE]', border: 'border-[#1D9E75]', text: 'text-[#1D9E75]', label: 'פנוי' };
    case 'PARTIAL': return { bg: 'bg-[#FAEEDA]', border: 'border-[#EF9F27]', text: 'text-[#EF9F27]', label: 'חלקי' };
    case 'BUSY': return { bg: 'bg-[#FCEBEB]', border: 'border-[#E24B4A]', text: 'text-[#E24B4A]', label: 'תפוס' };
    default: return { bg: 'bg-[#F1EFE8]', border: 'border-[#888780]', text: 'text-[#888780]', label: 'לא ידוע' };
  }
};

function App() {

  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<'map' | 'search' | 'profile' | 'report'>('map');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);


  const [isSimulationActive, setIsSimulationActive] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState<number>(1)

  // Anchor reference to force our terminal block to auto-scroll down
  const terminalBottomRef = useRef<HTMLDivElement>(null)

  // Consume your three architect layer hooks
  const { data: rooms, isLoading: roomsLoading, error: roomsError } = useRooms(isSimulationActive)
  const { mutate: startSimulation, isPending: isStartingEngine } = useStartSimulation()
  const { data: logs } = useSimulationLogs(isSimulationActive) // 👈 Instantiate log streams
  const { mutate: stopSimulation } = useStopSimulation()

  // Auto-scroll logic: triggered every time the logs array changes size
  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    // 1. THRESHOLD CHECK: Is the user currently looking at the bottom area?
    // We check if the user is within 60 pixels of the very bottom line.
    const isUserAtBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight <= 60;

    // 2. CONDITIONAL SNAP: Only push the scrollbar down if they were already at the bottom
    if (isUserAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  const handleToggleSimulation = () => {
    if (!isSimulationActive) {
      startSimulation({ scenario_id: selectedScenario })
      setIsSimulationActive(true)
    } else {
      stopSimulation()
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
  <div className="min-h-screen bg-gray-50 font-['Nunito',sans-serif] text-gray-800 flex flex-col pb-24 selection:bg-[#1D9E75]/20">
    
    {/* 1. WIREFRAME TOP HEADER (Screen 2 Requirement) */}
    <header className="bg-[#0B221E] text-white px-5 py-4 shadow-md sticky top-0 z-50 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <span className="bg-[#1D9E75] text-white p-1.5 rounded-xl font-bold text-sm shadow-inner">SC</span>
        <h1 className="text-xl font-black tracking-tight">Smart Campus</h1>
      </div>
      <span className="text-xs bg-[#1D9E75]/20 text-[#1D9E75] px-3 py-1 rounded-full font-bold border border-[#1D9E75]/30">
        אוניברסיטת בר-אילן [cite: 8, 18]
      </span>
    </header>

    {/* 2. DYNAMIC MAIN PORT PANEL */}
    <main className="flex-1 p-4 max-w-md mx-auto w-full h-[calc(100vh-140px)] overflow-y-auto space-y-4 pb-20">
      {/* ==========================================
          TAB VIEW 1: MAP ENGINE & SIMULATION CENTER
          ========================================== */}
      {activeTab === 'map' && (
        <div className="space-y-4 animate-fadeIn">
          
          {/* Wireframe Metric Counters (Screen 2 Requirement) */}
          <div className="grid grid-cols-4 gap-2.5 text-center">
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
              <span className="block text-lg font-black text-gray-700">43</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase">סה"כ כיתות [cite: 7]</span>
            </div>
            <div className="bg-[#E1F5EE] p-3 rounded-2xl border border-[#1D9E75]/30 shadow-sm">
              <span className="block text-lg font-black text-[#1D9E75]">14</span>
              <span className="text-[10px] text-[#1D9E75] font-bold">פנויות [cite: 7]</span>
            </div>
            <div className="bg-[#FAEEDA] p-3 rounded-2xl border border-[#EF9F27]/30 shadow-sm">
              <span className="block text-lg font-black text-[#EF9F27]">6</span>
              <span className="text-[10px] text-[#EF9F27] font-bold">חלקיות [cite: 7]</span>
            </div>
            <div className="bg-[#FCEBEB] p-3 rounded-2xl border border-[#E24B4A]/30 shadow-sm">
              <span className="block text-lg font-black text-[#E24B4A]">23</span>
              <span className="text-[10px] text-[#E24B4A] font-bold">תפוסות [cite: 7]</span>
            </div>
          </div>

          {/* Interactive Map Component Placeholder - Job 3 Map Frame Container */}
          <div className="border border-gray-200 rounded-3xl overflow-hidden shadow-sm h-64 bg-[#E1F5EE]/20 relative border-dashed border-[#1D9E75]">
            <div className="absolute inset-0 bg-opacity-40 bg-white flex flex-col items-center justify-center p-6 text-center">
              <span className="text-4xl mb-2">🗺️</span>
              <h4 className="text-[#0B221E] font-extrabold text-sm">[ מפת קמפוס דינמית – ג'וב 3 ] [cite: 2, 7]</h4>
              <p className="text-xs text-gray-500 max-w-xs mt-1">
                Map developer: mount your SVG coordinate mapping anchor context directly inside this frame structure[cite: 2, 10].
              </p>
            </div>
          </div>

          {/* Quick Filter Capsule Ribbon (Screen 2 UI Element) */}
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
            <button className="bg-[#1D9E75] text-white px-4 py-2 rounded-full shadow-sm">פנויות 🟢 [cite: 7]</button>
            <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full">שקט 🤫 [cite: 7]</button>
            <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full">קרוב אליי 📍 [cite: 7]</button>
            <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full">WiFi ⚡ [cite: 7]</button>
          </div>

          {/* Simulation Controls Panel (YOUR ORIGINAL RADIOS & LOGIC PRESERVED) */}
          <section className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-base font-black text-gray-800 mb-3">מערכת בקרת סימולציה</h3>
            
            <div className="flex flex-col gap-2.5 mb-4">
              {[
                { id: 1, label: 'Scenario 1: Basic Flow' },
                { id: 2, label: 'Scenario 2: Conflict' },
                { id: 3, label: 'Scenario 3: Spam Attack' },
                { id: 4, label: 'Scenario 4: VIP Pass' }
              ].map((scenario) => (
                <label key={scenario.id} className="flex items-center gap-3 cursor-pointer text-sm font-medium text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition-all">
                  <input 
                    type="radio" 
                    name="scenario" 
                    className="accent-[#1D9E75] h-4 w-4"
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
              className="w-full text-white py-3 px-4 rounded-xl text-base font-black tracking-wide shadow-sm transition-all"
              style={{ backgroundColor: isSimulationActive ? '#E24B4A' : '#1D9E75' }}
            >
              {isStartingEngine ? '⏳ Starting Engine...' : isSimulationActive ? '⏹ עצור סימולציה' : '▶ הפעל מנוע סימולציה'}
            </button>
          </section>

          {/* =========================================================================
            LIVE ROOMS OVERVIEW (Brings back 'rooms', 'roomsLoading', & 'roomsError')
            ========================================================================= */}
          <section className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-black text-gray-800">מצב כיתות בזמן אמת</h3>
              <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-lg">
                {rooms ? `${rooms.length} כיתות מסונכרנות` : 'טוען...'}
              </span>
            </div>

            {/* Network Loading and Error States */}
            {roomsLoading && (
              <div className="text-center py-6 text-sm text-gray-400 font-medium animate-pulse">
                ⏳ קורא נתוני תפוסה מ-Supabase...
              </div>
            )}
            
            {roomsError && (
              <div className="text-center py-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100">
                ❌ שגיאת רשת: לא ניתן להתחבר לשרת הנתונים.
              </div>
            )}

            {/* Real-Time Room Cards Grid Container */}
            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
              {rooms?.map((room: any) => {
                // 1. SAFETY SHIELD: Fallback to 'UNKNOWN' if fields are missing so getStatusStyles never crashes
                const rawStatus = room.occupancy_status || room.status || 'UNKNOWN';
                const status = getStatusStyles(rawStatus);

                // 2. SAFETY SHIELD: Safe fallbacks for room display text
                const displayRoomNumber = room.room || room.room_id || 'מזהה חסר';
                const displayBuilding = room.b_code || room.building_code;

                return (
                  <div 
                    key={room.room_id || room.id || Math.random().toString()} 
                    className={`p-3.5 rounded-2xl border ${status.border} ${status.bg} flex flex-col justify-between shadow-sm transition-all hover:scale-[1.02]`}
                  >
                    <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                      {displayBuilding ? `בניין ${displayBuilding}` : 'קמפוס בר אילן'}
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-base font-black text-gray-800">
                        כיתה {displayRoomNumber}
                      </span>
                      <span className={`text-xs font-black ${status.text} bg-white/80 px-2.5 py-0.5 rounded-lg border border-current/10 shadow-sm`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
              
          {/* Real-Time Terminal Output Log (YOUR ORIGINAL SYSTEM LOOP PRESERVED) */}
          <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-sm font-black text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> עדכוני קונצנזוס מהשטח [cite: 10, 12]
            </h3>
            
            <div 
              ref={terminalContainerRef}
              style={{
                backgroundColor: '#1e1e1e',
                borderRadius: '16px',
                padding: '16px',
                height: '260px',
                minHeight: '260px',
                maxHeight: '260px',
                overflowY: 'auto',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '12px',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
                direction: 'ltr'
              }}
            >
              {(!logs || logs.length === 0) && (
                <p style={{ color: '#888', fontStyle: 'italic', margin: 0 }}>
                  &gt; Terminal idle. Start the simulation engine to view crowdsourced agent reports...
                </p>
              )}

              {logs?.map((log: any) => {
                const roomDetails = CAMPUS_ROOM_MAP[log.room_id];
                return (
                  <div key={log.id || log.timestamp} style={{ marginBottom: '8px', lineHeight: '1.4', color: getLogColor(log.type) }}>
                    <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
                    {roomDetails ? (
                      <>
                        סוכן <strong>{log.agent_id}</strong> בבניין <strong>{roomDetails.b_code}</strong>, חדר <strong>{roomDetails.room}</strong>: {log.action} [cite: 12]
                      </>
                    ) : (
                      <>
                        סוכן <strong>{log.agent_id}</strong> במזהה כיתה <strong>#{log.room_id}</strong>: {log.action}
                      </>
                    )}
                  </div>
                );
              })}
              
            </div>
            <p className="text-[11px] text-gray-400 mt-2 text-right font-bold">
              סטטוס טרמינל: {isSimulationActive ? '🔴 Live Feed Streaming' : '⚪ Offline'}
            </p>
          </div>

        </div>
      )}

      {/* ==========================================
          TAB VIEW 2: ADVANCED SYSTEM FILTERS (Screen 3)
          ========================================== */}
      {activeTab === 'search' && (
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn">
          <h2 className="text-xl font-black text-[#0B221E]">חיפוש וסינון מתקדם [cite: 2, 9]</h2>
          <div className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">בחר בניין קמפוס [cite: 3]</label>
              <div className="grid grid-cols-4 gap-2 text-xs font-bold text-center">
                <button className="bg-[#1D9E75] text-white py-2 rounded-xl">הכל [cite: 9]</button>
                <button className="bg-gray-50 text-gray-600 py-2 rounded-xl border border-gray-100">507 [cite: 9]</button>
                <button className="bg-gray-50 text-gray-600 py-2 rounded-xl border border-gray-100">401 [cite: 9]</button>
                <button className="bg-gray-50 text-gray-600 py-2 rounded-xl border border-gray-100">302 [cite: 9]</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">זמן פנוי מינימלי (סליידר) [cite: 33]</label>
              <input type="range" min="10" max="180" className="w-full accent-[#1D9E75]" />
              <div className="flex justify-between text-[11px] text-gray-400 font-bold mt-1">
                <span>10 דקות [cite: 16]</span>
                <span>לפחות שעה [cite: 16]</span>
                <span>3 שעות</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          TAB VIEW 3: GAMIFIED PROGRESSION PROFILE (Screen 5)
          ========================================== */}
      {activeTab === 'profile' && (
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center space-y-4 animate-fadeIn">
          <div className="w-16 h-16 bg-[#1D9E75] text-white flex items-center justify-center text-2xl font-black rounded-full mx-auto shadow-md mb-2">
            ג
          </div>
          <h2 className="text-xl font-black text-gray-800">גל בן יקר [cite: 6, 18]</h2>
          <span className="text-xs bg-gray-100 text-gray-500 font-bold px-3 py-1 rounded-full border border-gray-200/50">
            סטודנט/ית מאומת [cite: 6, 18]
          </span>

          <div className="bg-[#0B221E] text-white p-4 rounded-2xl mt-5 shadow-inner">
            <span className="text-[10px] text-green-300 font-bold uppercase tracking-wider block">ציון אמינות קהילתי [cite: 6, 18]</span>
            <div className="text-4xl font-black text-[#1D9E75] my-1">87 [cite: 6, 18]</div>
            <p className="text-xs text-green-300/90 font-medium">★ דירוג: משתמש/ת מדהים ואמין! [cite: 18]</p>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center opacity-100"><span className="text-2xl block">☀️</span><span className="text-[9px] font-bold text-gray-400">דיווח ראשון [cite: 18]</span></div>
            <div className="text-center opacity-100"><span className="text-2xl block">🎯</span><span className="text-[9px] font-bold text-gray-400">דיוק גבוה [cite: 18]</span></div>
            <div className="text-center opacity-100"><span className="text-2xl block">🔥</span><span className="text-[9px] font-bold text-gray-400">7 ימים ברצף [cite: 18]</span></div>
            <div className="text-center opacity-40 grayscale"><span className="text-2xl block">💎</span><span className="text-[9px] font-bold text-gray-400">50 דיווחים [cite: 18]</span></div>
          </div>
        </div>
      )}

    </main>

    {/* 3. PERSISTENT SYSTEM BOTTOM NAVIGATION MENU BAR (Screen Flow Anchor) */}
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2.5 px-6 flex justify-around items-center shadow-2xl z-50 rounded-t-3xl">
      <button 
        onClick={() => setActiveTab('profile')} 
        className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'profile' ? 'text-[#1D9E75] scale-110 font-black' : 'text-gray-400 font-bold'}`}
      >
        <span className="text-xl">👤</span>
        <span className="text-[10px]">פרופיל שלי [cite: 2, 18]</span>
      </button>

      <button 
        onClick={() => setActiveTab('search')} 
        className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'search' ? 'text-[#1D9E75] scale-110 font-black' : 'text-gray-400 font-bold'}`}
      >
        <span className="text-xl">🔍</span>
        <span className="text-[10px]">חיפוש מתקדם [cite: 2, 9]</span>
      </button>

      <button 
        onClick={() => setActiveTab('map')} 
        className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-[#1D9E75] scale-110 font-black' : 'text-gray-400 font-bold'}`}
      >
        <span className="text-xl">🗺️</span>
        <span className="text-[10px]">מפת קמפוס [cite: 2, 7]</span>
      </button>
    </nav>
  </div>
  );
}

export default App