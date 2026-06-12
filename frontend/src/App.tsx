import { useState, useRef, useEffect } from 'react'
import axios from 'axios';
import { useRooms } from './hooks/useRooms'
import { useStartSimulation } from './hooks/useStartSimulation'
import { useSimulationLogs } from './hooks/useSimulationLogs'
import { useStopSimulation } from './hooks/useStopSimulation'
import { useSearchRooms } from './hooks/useSearchRooms'
import CampusMap from './components/CampusMap'

const CAMPUS_ROOM_MAP: Record<string, { b_code: string; room: string }> = {
  "1": { b_code: "507", room: "104" },
  "2": { b_code: "302", room: "08" },
  "3": { b_code: "310", room: "5" },
  "4": { b_code: "401", room: "12" },
  "5": { b_code: "205", room: "3" },
};

// Design Token Color Helper based on your official specification sheet
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

  const [usernameInput, setUsernameInput] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'Student' | 'Lecturer'>('Student');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const [activeTab, setActiveTab] = useState<'map' | 'search' | 'profile' | 'report'>('map');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [minFreeMinutes, setMinFreeMinutes] = useState<number>(60); // Default - 1 hour
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>('הכל');

  const [isSimulationActive, setIsSimulationActive] = useState(false)
  const [selectedScenario, setSelectedScenario] = useState<number>(1)

  // Anchor reference to force our terminal block to auto-scroll down
  const terminalBottomRef = useRef<HTMLDivElement>(null)

  // Consume your three architect layer hooks
  const { data: rooms, isLoading: roomsLoading, error: roomsError } = useRooms(isSimulationActive)
  const { mutate: startSimulation, isPending: isStartingEngine } = useStartSimulation()
  const { data: logs } = useSimulationLogs(isSimulationActive)
  const { mutate: stopSimulation } = useStopSimulation()
  const { mutate: searchRooms, data: searchResponse, isPending: isSearching } = useSearchRooms()

  const uniqueBuildings = rooms 
    ? Array.from(new Set(rooms.map(r => r.building_number))).filter(Boolean).sort()
    : [];

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
  
  const handleLoginSubmit = async (e: any) => {
    e.preventDefault();
    
    // Validation: Catch blank inputs before hitting the server
    if (!usernameInput.trim()) {
      setLoginError('אנא הזן מזהה משתמש');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      // Fire the request using the exact object model expected by UserLoginPayload
      const response = await axios.post('http://localhost:8000/api/users/login', {
        app_user_id: usernameInput.trim(),
        role: selectedRole // Sends exactly "Student" or "Lecturer"
      });

      if (response.data && response.data.status === 'success') {
        // Extract the verified user dictionary built on lines 167 & 182 of main.py
        setCurrentUser(response.data.user);
        
        // Auto-route to the main dashboard map layer upon success
        setActiveTab('map'); 
      } else {
        setLoginError('ההתחברות נכשלה. אנא בדוק את פרטי המשתמש.');
      }
    } catch (error: any) {
      console.error("Authentication tracking failure:", error);
      setLoginError('שגיאת שרת: לא ניתן להתחבר למערכת האימות.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-['Nunito',sans-serif] text-gray-800 flex flex-col pb-24 selection:bg-[#1D9E75]/20">
      
      {/* ==========================================
          GATEKEEPER VIEW: LOGIN SCREEN
          ========================================== */}
      {!currentUser ? (
        <div className="flex-1 flex flex-col justify-center items-center p-6 max-w-md mx-auto w-full animate-fadeIn mt-12">
          
          {/* Brand Identity / Logo Frame */}
          <div className="text-center space-y-2 mb-8">
            <div className="w-20 h-20 bg-[#0B221E] border-2 border-[#1D9E75] text-white flex items-center justify-center text-3xl font-black rounded-3xl mx-auto shadow-md transform rotate-3 hover:rotate-0 transition-transform duration-300">
              SC
            </div>
            <h1 className="text-3xl font-black text-[#0B221E] tracking-tight">Smart Campus</h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">אוניברסיטת בר-אילן</p>
          </div>

          {/* Login Credentials Card Form */}
          <form onSubmit={handleLoginSubmit} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl w-full space-y-5">
            <h2 className="text-lg font-black text-gray-800 text-center pb-2 border-b border-gray-100">
              התחברות למערכת כיתות פנויות
            </h2>

            {/* Error Message Box */}
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-bold text-red-600 text-center">
                ⚠️ {loginError}
              </div>
            )}

            {/* User ID Input Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wide">מזהה משתמש (User ID)</label>
              <input 
                type="text" 
                placeholder="e.g., student_biu_12345"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                disabled={isLoggingIn}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#1D9E75] focus:border-transparent font-mono text-sm transition-all bg-gray-50/50"
              />
            </div>

            {/* Role Choice Switch Segmented Control */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wide">תפקיד בקמפוס (Role)</label>
              <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-xl text-sm font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedRole('Student')}
                  disabled={isLoggingIn}
                  className={`py-2 rounded-lg transition-all ${selectedRole === 'Student' ? 'bg-white text-[#1D9E75] shadow-sm' : 'text-gray-500'}`}
                >
                  👨‍🎓 סטודנט/ית
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRole('Lecturer')}
                  disabled={isLoggingIn}
                  className={`py-2 rounded-lg transition-all ${selectedRole === 'Lecturer' ? 'bg-white text-[#1D9E75] shadow-sm' : 'text-gray-500'}`}
                >
                  👨‍🏫 מרצה
                </button>
              </div>
            </div>

            {/* Authorize Action Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#1D9E75] hover:bg-[#158061] text-white py-3.5 rounded-xl text-base font-black tracking-wide shadow-md transition-all flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              {isLoggingIn ? <>⏳ מאמת נתונים...</> : <>כניסה למערכת 🚀</>}
            </button>
          </form>

          <p className="text-[10px] text-gray-400 mt-6 max-w-xs text-center leading-relaxed">
            המערכת תסנכרן אוטומטית את דירוג האמינות וההטבות של המשתמש מול בסיס הנתונים המרכזי של Supabase.
          </p>
        </div>
      ) : (

        /* ==========================================
            EXISTING MAIN APPLICATION UNLOCKED
            ========================================== */
        <>

          {/* 1. WIREFRAME TOP HEADER (Screen 2 Requirement) */}
          <header className="bg-[#0B221E] text-white px-5 py-4 shadow-md sticky top-0 z-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="bg-[#1D9E75] text-white p-1.5 rounded-xl font-bold text-sm shadow-inner">SC</span>
              <h1 className="text-xl font-black tracking-tight">Smart Campus</h1>
            </div>
            <span className="text-xs bg-[#1D9E75]/20 text-[#1D9E75] px-3 py-1 rounded-full font-bold border border-[#1D9E75]/30">
              אוניברסיטת בר-אילן
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
                    <span className="text-[10px] text-gray-400 font-bold uppercase">סה"כ כיתות</span>
                  </div>
                  <div className="bg-[#E1F5EE] p-3 rounded-2xl border border-[#1D9E75]/30 shadow-sm">
                    <span className="block text-lg font-black text-[#1D9E75]">14</span>
                    <span className="text-[10px] text-[#1D9E75] font-bold">פנויות</span>
                  </div>
                  <div className="bg-[#FAEEDA] p-3 rounded-2xl border border-[#EF9F27]/30 shadow-sm">
                    <span className="block text-lg font-black text-[#EF9F27]">6</span>
                    <span className="text-[10px] text-[#EF9F27] font-bold">חלקיות</span>
                  </div>
                  <div className="bg-[#FCEBEB] p-3 rounded-2xl border border-[#E24B4A]/30 shadow-sm">
                    <span className="block text-lg font-black text-[#E24B4A]">23</span>
                    <span className="text-[10px] text-[#E24B4A] font-bold">תפוסות</span>
                  </div>
                </div>

                {/* Interactive Map Component Placeholder - Job 3 Map Frame Container */}
                <div className="border border-gray-200 rounded-3xl overflow-hidden shadow-sm h-80 relative z-0">
                <CampusMap rooms={rooms} />
                </div>
                
                

                {/* Quick Filter Capsule Ribbon (Screen 2 UI Element) */}
                        {/* Quick Filter Capsule Ribbon (Screen 2 UI Element) */}
                <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
                  <button className="bg-[#1D9E75] text-white px-4 py-2 rounded-full shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span>פנויות</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>
                  </button>
                  <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span>שקט</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M22 9l-6 6" /><path d="M16 9l6 6" /></svg>
                  </button>
                  <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span>קרוב אליי</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  </button>
                  <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-full inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span>WiFi</span>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" /></svg>
                  </button>
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
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> עדכוני קונצנזוס מהשטח
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
                              סוכן <strong>{log.agent_id}</strong> בבניין <strong>{roomDetails.b_code}</strong>, חדר <strong>{roomDetails.room}</strong>: {log.action}
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
                <h2 className="text-xl font-black text-[#0B221E]">חיפוש וסינון מתקדם</h2>
                <div className="space-y-4 mt-2">
                  
                  {/* ФИЛЬТР ПО ЗДАНИЯМ (ТЕПЕРЬ ДИНАМИЧЕСКИЙ) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">בחר בניין קמפוס</label>
                    
                    {/* Используем flex-wrap чтобы кнопки переносились на новые строки */}
                    <div className="flex flex-wrap gap-2 text-xs font-bold justify-center">
                      
                      {/* Кнопка "Всё" всегда идет первой */}
                      <button 
                        onClick={() => setSelectedBuildingFilter('הכל')}
                        className={`py-2 px-4 rounded-xl transition-all ${
                          selectedBuildingFilter === 'הכל' 
                            ? 'bg-[#1D9E75] text-white shadow-md' 
                            : 'bg-gray-50 text-gray-600 border border-gray-100'
                        }`}
                      >
                        הכל
                      </button>

                      {/* Рисуем кнопки для всех зданий, которые есть в базе */}
                      {uniqueBuildings.map((bld) => (
                        <button 
                          key={bld}
                          onClick={() => setSelectedBuildingFilter(bld)}
                          className={`py-2 px-4 rounded-xl transition-all ${
                            selectedBuildingFilter === bld 
                              ? 'bg-[#1D9E75] text-white shadow-md' 
                              : 'bg-gray-50 text-gray-600 border border-gray-100'
                          }`}
                        >
                          {bld}
                        </button>
                      ))}
                      
                    </div>
                  </div>

                  {/* СЛАЙДЕР ВРЕМЕНИ */}
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">
                      זמן פנוי מינימלי: <span className="text-[#1D9E75]">{minFreeMinutes} דקות</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" 
                      max="180" 
                      step="10"
                      value={minFreeMinutes}
                      onChange={(e) => setMinFreeMinutes(parseInt(e.target.value))}
                      className="w-full accent-[#1D9E75]" 
                    />
                    <div className="flex justify-between text-[11px] text-gray-400 font-bold mt-1">
                      <span>10 דקות</span>
                      <span>לפחות שעה</span>
                      <span>3 שעות</span>
                    </div>
                  </div>

                  {/* КНОПКА ПОИСКА */}
                  <button 
                    onClick={() => searchRooms({ min_minutes: minFreeMinutes, building: selectedBuildingFilter })}
                    disabled={isSearching}
                    className="w-full bg-[#0B221E] text-white py-3 rounded-xl font-black mt-4 shadow-md transition-all hover:bg-[#1D9E75] disabled:opacity-70"
                  >
                    {isSearching ? 'מחפש...' : 'חפש חדרים פנויים'}
                  </button>

                  {/* БЛОК РЕЗУЛЬТАТОВ ПОИСКА */}
                  {searchResponse && (
                    <div className="mt-6 border-t border-gray-100 pt-4 animate-fadeIn">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-black text-gray-800">תוצאות חיפוש:</h3>
                        <span className="text-xs bg-[#1D9E75]/10 text-[#1D9E75] font-bold px-2 py-1 rounded-lg">
                          {searchResponse.results_count} חדרים מתאימים
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                        {searchResponse.results_count === 0 ? (
                          <div className="text-center py-6 text-gray-400 text-sm font-bold">
                            לא נמצאו חדרים שעונים על הדרישות 😔
                          </div>
                        ) : (
                          searchResponse.rooms.map((room: any) => (
                            <div key={room.room_id} className="bg-gray-50 border border-gray-100 p-3 rounded-xl flex justify-between items-center shadow-sm">
                              <div>
                                <div className="text-xs text-gray-500 font-bold uppercase">בניין {room.building_number}</div>
                                <div className="text-base font-black text-gray-800">כיתה {room.room_number}</div>
                              </div>
                              <div className="text-left">
                                <div className="text-lg font-black text-[#1D9E75]">{room.free_for_minutes} דק'</div>
                                <div className="text-[10px] text-gray-400 font-bold">
                                  עד: {room.next_class_at}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* ==========================================
                TAB VIEW 3: GAMIFIED PROGRESSION PROFILE (Screen 5 - Fully Dynamic)
                ========================================== */}
            {activeTab === 'profile' && currentUser && (
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center space-y-4 animate-fadeIn">
                
                {/* User Avatar Initial */}
                <div className="w-16 h-16 bg-[#1D9E75] text-white flex items-center justify-center text-2xl font-black rounded-full mx-auto shadow-md mb-2 uppercase">
                  {currentUser.app_user_id.charAt(0)}
                </div>
                
                {/* Dynamic User ID String */}
                <h2 className="text-xl font-black text-gray-800 font-mono tracking-tight">
                  {currentUser.app_user_id}
                </h2>
                
                {/* Identity Badges */}
                <div className="flex justify-center gap-2 text-xs font-bold">
                  <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200/50">
                    {currentUser.role === 'Student' ? '👨‍🎓 סטודנט/ית' : '👨‍🏫 מרצה'}
                  </span>
                  <span className="bg-[#E1F5EE] text-[#1D9E75] px-3 py-1 rounded-full border border-[#1D9E75]/20">
                    🏆 דרגה: {currentUser.tier}
                  </span>
                </div>

                {/* Pioneer Rule Banner: Evaluates the actual boolean value from main.py */}
                {!currentUser.pioneer_rule_unlocked && (
                  <div className="bg-amber-50 text-amber-800 p-3.5 rounded-2xl border border-amber-200 text-xs font-bold text-right space-y-1 animate-slideUp">
                    <p className="text-amber-900 flex items-center gap-1.5">🛡️ תקופת הרצה למשתמש חדש</p>
                    <p className="text-gray-500 font-normal leading-relaxed">
                      מכיוון שאתה רשום כמשתמש חדש במערכת, הדיווחים הראשונים שלך יעברו בדיקת קונצנזוס על ידי חברי הקהילה בקמפוס לפני שישנו את צבע המפה.
                    </p>
                  </div>
                )}

                {/* Dynamic Trust Score Progress Indicator */}
                <div className="bg-[#0B221E] text-white p-4 rounded-2xl shadow-inner">
                  <span className="text-[10px] text-green-300 font-bold uppercase tracking-wider block">
                    ציון אמינות קהילתי (Trust Score)
                  </span>
                  <div className="text-4xl font-black text-[#1D9E75] my-1">
                    {Math.round(currentUser.trust_score * 100)}%
                  </div>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {currentUser.role === 'Lecturer' ? '★ דירוג סגל אקדמי מובנה' : '★ הדירוג משתנה על בסיס דיוק הדיווחים שלך'}
                  </p>
                </div>

                {/* Achievement Matrix Badges */}
                <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-100">
                  <div className="text-center opacity-100">
                    <svg className="w-7 h-7 mx-auto block text-[#1D9E75]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                    <span className="text-[9px] font-bold text-gray-400">דיווח ראשון</span>
                  </div>
                  <div className="text-center opacity-100">
                    <svg className="w-7 h-7 mx-auto block text-[#1D9E75]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
                    <span className="text-[9px] font-bold text-gray-400">דיוק גבוה</span>
                  </div>
                  <div className="text-center opacity-100">
                    <svg className="w-7 h-7 mx-auto block text-[#1D9E75]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-1.6.6-2.8 1.5-3.6C8.7 8.4 9 9 10 9c0-2 1-4 2-6z" /></svg>
                    <span className="text-[9px] font-bold text-gray-400">7 ימים ברצף</span>
                  </div>
                  <div className="text-center opacity-40">
                    <svg className="w-7 h-7 mx-auto block text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l3 5-9 12L3 8z" /><path d="M3 8h18" /><path d="M9 3 7.5 8 12 20" /><path d="M15 3l1.5 5L12 20" /></svg>
                    <span className="text-[9px] font-bold text-gray-400">50 דיווחים</span>
                  </div>
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
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
              <span className="text-[10px]">פרופיל שלי</span>
            </button>

            <button 
              onClick={() => setActiveTab('search')} 
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'search' ? 'text-[#1D9E75] scale-110 font-black' : 'text-gray-400 font-bold'}`}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="text-[10px]">חיפוש מתקדם</span>
            </button>

            <button 
              onClick={() => setActiveTab('map')} 
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-[#1D9E75] scale-110 font-black' : 'text-gray-400 font-bold'}`}>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
                <path d="M9 4v14" />
                <path d="M15 6v14" />
              </svg>
              <span className="text-[10px]">מפת קמפוס</span>
            </button>
          </nav>
        </>
      )}
    </div>
  ); 
}

export default App;