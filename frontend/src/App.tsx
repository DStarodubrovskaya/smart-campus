import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useRooms } from "./hooks/useRooms";
import { useStartSimulation } from "./hooks/useStartSimulation";
import { useSimulationLogs } from "./hooks/useSimulationLogs";
import { useStopSimulation } from "./hooks/useStopSimulation";
import { useSearchRooms } from "./hooks/useSearchRooms";
import CampusMap from "./components/CampusMap";
import { useSubmitReport } from "./hooks/useSubmitReport";
import logoLight from "./assets/logo-light.svg";
import logoDark from "./assets/logo-dark.svg";
import { useUserHistory } from "./hooks/useUserHistory";
import { useClearLogs } from "./hooks/useClearLogs";
import { usePredictAvailability } from "./hooks/usePredictAvailability";

// Design Token Color Helper based on your official specification sheet
const getStatusStyles = (status: string) => {
  switch (status?.toUpperCase()) {
    case "FREE":
      return {
        bg: "bg-[#E1F5EE]",
        border: "border-[#006937]",
        text: "text-[#006937]",
        label: "פנוי",
      };
    case "PARTIAL":
      return {
        bg: "bg-[#FAEEDA]",
        border: "border-[#EF9F27]",
        text: "text-[#EF9F27]",
        label: "חלקי",
      };
    case "BUSY":
      return {
        bg: "bg-[#FCEBEB]",
        border: "border-[#E24B4A]",
        text: "text-[#E24B4A]",
        label: "תפוס",
      };
    default:
      return {
        bg: "bg-[#F1EFE8]",
        border: "border-[#888780]",
        text: "text-[#888780]",
        label: "לא ידוע",
      };
  }
};
// Formats the "free until" time: strips seconds, or shows a Hebrew note when no classes remain.
const formatUntil = (t: any) => {
  const s = String(t ?? "");
  if (!s.trim() || /no more classes/i.test(s)) return "אין שיעורים נוספים היום";
  const m = s.match(/^(\d{1,2}:\d{2})/);
  return "עד " + (m ? m[1] : s);
};

function App() {
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  const [usernameInput, setUsernameInput] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"Student" | "Lecturer">(
    "Student",
  );
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [isAdminLogin, setIsAdminLogin] = useState<boolean>(false);
  const [adminPassword, setAdminPassword] = useState<string>("");

  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [showLogout, setShowLogout] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "map" | "search" | "profile" | "report"
  >("map");
  const [minFreeMinutes, setMinFreeMinutes] = useState<number>(60); // Default - 1 hour
  const [selectedBuildingFilter, setSelectedBuildingFilter] =
    useState<string>("הכל");

  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<number>(1);
  const [showBookingSoon, setShowBookingSoon] = useState(false);

  // --- ML FORECASTING STATE (Smart Cascading Dropdowns) ---
  const [mlDayOfWeek, setMlDayOfWeek] = useState<number>(0);
  const [mlHour, setMlHour] = useState<number>(14);
  const [mlBuilding, setMlBuilding] = useState<string>("הכל");
  const [mlSpecificRoom, setMlSpecificRoom] = useState<string>("");
  const {
    mutate: predictRoom,
    data: mlPrediction,
    isPending: isPredicting,
    reset: resetPrediction,
  } = usePredictAvailability();

  const {
    data: rooms,
    isLoading: roomsLoading,
    error: roomsError,
  } = useRooms(isSimulationActive);
  const { mutate: startSimulation, isPending: isStartingEngine } =
    useStartSimulation();
  const { data: logs } = useSimulationLogs(isSimulationActive);
  const { mutate: stopSimulation } = useStopSimulation();
  const {
    mutate: searchRooms,
    data: searchResponse,
    isPending: isSearching,
  } = useSearchRooms();
  const { data: userHistory, isLoading: isLoadingHistory } = useUserHistory(
    currentUser?.app_user_id,
  );
  const { mutate: clearLogs, isPending: isClearingLogs } = useClearLogs();

  // Automatically filter available rooms based on selected building
  const availableRoomsForBuilding = rooms
    ? Array.from(
        new Set(
          rooms
            .filter(
              (r) =>
                mlBuilding === "הכל" ||
                String(r.building_number) === mlBuilding,
            )
            .map((r) => String(r.room_id)),
        ),
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];

  const uniqueBuildings = rooms
    ? Array.from(new Set(rooms.map((r) => r.building_number)))
        .filter(Boolean)
        .sort()
    : [];
  const statusCounts = (() => {
    let free = 0,
      busy = 0;
    for (const r of rooms ?? []) {
      if (r.occupancy_status === "FREE") free++;
      else if (r.occupancy_status === "BUSY") busy++;
    }
    return { total: (rooms ?? []).length, free, busy };
  })();
  const [mapBuildingQuery, setMapBuildingQuery] = useState("");
  const [showMapBuildingList, setShowMapBuildingList] = useState(false);
  const [roomListQuery, setRoomListQuery] = useState("");
  const [showRoomFilter, setShowRoomFilter] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const filteredMapBuildings = uniqueBuildings
    .filter((b) => b.startsWith(mapBuildingQuery.trim()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const [showFilter, setShowFilter] = useState(false);
  const [amenityFilters, setAmenityFilters] = useState<Record<string, boolean>>(
    {},
  );

  const floorOf = (id: any) => parseInt(String(id).trim()[0], 10) || 0;
  const roomBuildingFilter = (selectedBuilding || mapBuildingQuery).trim();
  const visibleRooms = (rooms ?? [])
    .filter(
      (r) =>
        !roomBuildingFilter ||
        String(r.building_number).startsWith(roomBuildingFilter),
    )
    .filter(
      (r) =>
        !roomListQuery.trim() ||
        String(r.room_id).startsWith(roomListQuery.trim()),
    )
    .sort((a, b) => {
      // 1. by building number (ascending)
      const byBuilding = String(a.building_number).localeCompare(
        String(b.building_number),
        undefined,
        { numeric: true },
      );
      if (byBuilding !== 0) return byBuilding;
      // 2. by floor (first digit of the room number)
      const fa = floorOf(a.room_id),
        fb = floorOf(b.room_id);
      if (fa !== fb) return fa - fb;
      // 3. by room number within the floor (ascending)
      return (
        (parseInt(String(a.room_id), 10) || 0) -
        (parseInt(String(b.room_id), 10) || 0)
      );
    });
  // --- employment report ---
  const [reportBuilding, setReportBuilding] = useState<string>("");
  const [reportRoomId, setReportRoomId] = useState<number | null>(null);
  const [reportStatus, setReportStatus] = useState<"FREE" | "BUSY" | null>(
    null,
  );
  const [buildingQuery, setBuildingQuery] = useState("");
  const [showBuildingList, setShowBuildingList] = useState(false);
  const filteredBuildings = uniqueBuildings.filter((b) =>
    b.includes(buildingQuery.trim()),
  );
  const [roomQuery, setRoomQuery] = useState("");
  const [showRoomList, setShowRoomList] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<
    "FREE" | "BUSY" | null
  >(null);
  const [submittedRoom, setSubmittedRoom] = useState<string>("");
  const [submittedRoomId, setSubmittedRoomId] = useState<number | null>(null);
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [amenitiesDone, setAmenitiesDone] = useState(false);
  const {
    mutate: submitReport,
    isPending: isSubmittingReport,
    data: reportResult,
    error: reportError,
    reset: resetReport,
  } = useSubmitReport();

  const reportRooms = (rooms ?? [])
    .filter((r) => r.building_number === reportBuilding)
    .sort((a, b) =>
      a.room_id.localeCompare(b.room_id, undefined, { numeric: true }),
    );

  const filteredReportRooms = reportRooms.filter((r) =>
    r.room_id.includes(roomQuery.trim()),
  );
  const openReportTab = () => {
    resetReport();
    setReportStatus(null);
    setActiveTab("report");
  };

  const handleSubmitReport = () => {
    if (!currentUser || reportRoomId == null || !reportStatus) return;
    submitReport(
      {
        app_user_id: currentUser.app_user_id,
        room_id: reportRoomId,
        reported_status: reportStatus,
      },
      {
        onSuccess: () => {
          setSubmittedStatus(reportStatus);
          setSubmittedRoom(roomQuery);
          setSubmittedRoomId(reportRoomId);
          setAmenities({});
          setAmenitiesDone(false);
          setReportBuilding("");
          setBuildingQuery("");
          setReportRoomId(null);
          setRoomQuery("");
          setReportStatus(null);
        },
      },
    );
  };

  // Auto-scroll logic: triggered every time the logs array changes size
  useEffect(() => {
    const container = terminalContainerRef.current;
    if (!container) return;

    // 1. THRESHOLD CHECK: Is the user currently looking at the bottom area?
    // We check if the user is within 60 pixels of the very bottom line.
    const isUserAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      60;

    // 2. CONDITIONAL SNAP: Only push the scrollbar down if they were already at the bottom
    if (isUserAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs]);

  const handleToggleSimulation = () => {
    if (!isSimulationActive) {
      startSimulation({ scenario_id: selectedScenario });
      setIsSimulationActive(true);
    } else {
      stopSimulation();
      setIsSimulationActive(false);
    }
  };

  // Define styling colors based on log payload type
  const getLogColor = (type: string) => {
    switch (type) {
      case "success":
        return "#006937"; // Green
      case "warning":
        return "#EF9F27"; // Yellow
      case "error":
        return "#E24B4A"; // Red
      default:
        return "#ffffff"; // White Info
    }
  };

  const handleLoginSubmit = async (e: any) => {
    e.preventDefault();

    // Check for a regular user
    if (!isAdminLogin && !usernameInput.trim()) {
      setLoginError("אנא הזן מזהה משתמש");
      return;
    }

    // Checking the password for the admin
    if (isAdminLogin && adminPassword !== "12345") {
      setLoginError("סיסמת מנהל שגויה");
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    // If this is an admin, force the login admin and the role Lecturer (to give a VIP rating)
    const payloadUserId = isAdminLogin ? "admin" : usernameInput.trim();
    const payloadRole = isAdminLogin ? "Lecturer" : selectedRole;

    try {
      //to create option for using app on phone for presentation
      //const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/users/login`, {

      const response = await axios.post(
        "http://localhost:8000/api/users/login",
        {
          app_user_id: payloadUserId,
          role: payloadRole,
        },
      );

      if (response.data && response.data.status === "success") {
        const userData = response.data.user;

        // Embed the secret admin flag into the session
        if (isAdminLogin) {
          userData.isAdmin = true;
        }

        setCurrentUser(userData);
        setActiveTab("map");
      } else {
        setLoginError("ההתחברות נכשלה. אנא בדוק את פרטי המשתמש.");
      }
    } catch (error: any) {
      console.error("Authentication tracking failure:", error);
      setLoginError("שגיאת שרת: לא ניתן להתחבר למערכת האימות.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f5faf0] font-['Assistant',sans-serif] text-gray-800 flex flex-col pb-24 selection:bg-[#006937]/20"
    >
      {/* ==========================================
          GATEKEEPER VIEW: LOGIN SCREEN
          ========================================== */}
      {!currentUser ? (
        <div className="flex-1 flex flex-col justify-center items-center p-6 max-w-md mx-auto w-full animate-fadeIn mt-12">
          <div className="text-center space-y-2 mb-8">
            <img src={logoDark} alt="Smart Campus" className="w-56 mx-auto" />
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              אוניברסיטת בר-אילן
            </p>
          </div>

          {/* Login Credentials Card Form */}
          <form
            onSubmit={handleLoginSubmit}
            className="bg-white p-6 rounded-3xl border border-gray-100 shadow-xl w-full space-y-5 text-right"
          >
            <h2 className="text-lg font-semibold text-gray-800 text-center pb-2 border-b border-gray-100">
              התחברות למערכת כיתות פנויות
            </h2>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-semibold text-red-600 text-center">
                {loginError}
              </div>
            )}

            {/* Administrator Checkbox */}
            <div className="flex items-center justify-start gap-2 px-1">
              <input
                type="checkbox"
                id="adminCheck"
                checked={isAdminLogin}
                onChange={(e) => {
                  setIsAdminLogin(e.target.checked);
                  setLoginError(null);
                }}
                className="w-4 h-4 accent-[#006937] rounded cursor-pointer"
              />
              <label
                htmlFor="adminCheck"
                className="text-sm font-semibold text-gray-600 cursor-pointer"
              >
                כניסה כמנהל מערכת
              </label>
            </div>

            {isAdminLogin ? (
              /* Password field (for admin only) */
              <div className="space-y-1.5 animate-fadeIn">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  סיסמה
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  disabled={isLoggingIn}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#006937] bg-gray-50/50 font-mono text-sm text-left transition-all"
                  dir="ltr"
                />
              </div>
            ) : (
              /* Standard fields (for regular users only) */
              <div className="space-y-5 animate-fadeIn">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    מזהה משתמש{" "}
                  </label>
                  <input
                    type="text"
                    placeholder="לדוגמה שם שלך "
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    disabled={isLoggingIn}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#006937] font-mono text-sm transition-all bg-gray-50/50 text-right"
                    dir="rtr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    תפקיד בקמפוס{" "}
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-xl text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => setSelectedRole("Student")}
                      disabled={isLoggingIn}
                      className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${selectedRole === "Student" ? "bg-white text-[#006937] shadow-sm" : "text-gray-500"}`}
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 10 12 5 2 10l10 5 10-5z" />
                        <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
                        <path d="M22 10v4" />
                      </svg>
                      סטודנט/ית
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRole("Lecturer")}
                      disabled={isLoggingIn}
                      className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${selectedRole === "Lecturer" ? "bg-white text-[#006937] shadow-sm" : "text-gray-500"}`}
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 4h18" />
                        <path d="M4 4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4" />
                        <path d="M12 14v4M9 21l3-3 3 3" />
                      </svg>
                      מרצה
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#006937] hover:bg-[#158061] text-white py-3.5 rounded-xl text-base font-semibold tracking-wide shadow-md transition-all flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              {isLoggingIn ? <> מאמת נתונים...</> : <>כניסה למערכת </>}
            </button>
          </form>

          <p className="text-[10px] text-gray-400 mt-6 max-w-xs text-center leading-relaxed">
            המערכת תסנכרן אוטומטית את דירוג האמינות וההטבות של המשתמש מול בסיס
            הנתונים המרכזי של Supabase.
          </p>
        </div>
      ) : (
        /* ==========================================
            EXISTING MAIN APPLICATION UNLOCKED
            ========================================== */
        <>
          {/* 1. WIREFRAME TOP HEADER (Screen 2 Requirement) */}
          <header className="bg-[#004128] text-white px-5 py-3 shadow-md sticky top-0 z-50 flex justify-between items-center">
            <img src={logoLight} alt="Smart Campus" className="h-13" />
            <button
              onClick={() => setShowLogout(true)}
              className="bg-[#78cde6] text-[#063b4d] px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 hover:bg-[#9bd9ec] transition-colors"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              יציאה
            </button>
          </header>
          {showLogout && (
            <div
              className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6"
              onClick={() => setShowLogout(false)}
            >
              <div
                dir="rtl"
                className="bg-white rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-xl animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 bg-[#78cde6]/20 text-[#2f8fb3] rounded-full flex items-center justify-center mx-auto">
                  <svg
                    className="w-7 h-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#004128]">
                  עוזב/ת אותנו?
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  {" "}
                  נשמח לראותך שוב בקמפוס.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setCurrentUser(null);
                      setShowLogout(false);
                      setIsAdminLogin(false); //brings back to general login page
                      setAdminPassword(""); //erases admin password
                    }}
                    className="flex-1 bg-[#E24B4A] text-white py-2.5 rounded-xl font-bold text-sm"
                  >
                    יציאה
                  </button>
                  <button
                    onClick={() => setShowLogout(false)}
                    className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            </div>
          )}
          <div
            dir="rtl"
            className="bg-white px-5 py-3 border-b border-gray-100"
          >
            <span className="text-lg font-semibold text-[#004128]">
              שלום! {currentUser.app_user_id}
            </span>
          </div>

          {/* 2. DYNAMIC MAIN PORT PANEL */}
          <main className="flex-1 p-4 max-w-md mx-auto w-full h-[calc(100vh-140px)] overflow-y-auto space-y-4 pb-20">
            {/* ==========================================
                TAB VIEW 1: MAP ENGINE & SIMULATION CENTER
                ========================================== */}
            {activeTab === "map" && (
              <div className="space-y-4 animate-fadeIn">
                {/* Wireframe Metric Counters (Screen 2 Requirement) */}
                <div dir="rtl" className="flex gap-2">
                  <div className="flex-1 min-w-0 bg-[#78cde6]/25 text-[#2f8fb3] rounded-full px-2 py-2 flex items-center justify-center gap-1">
                    <span className="text-xs font-semibold truncate">סה״כ</span>
                    <span className="text-sm font-bold">
                      {statusCounts.total}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 bg-[#006937]/15 text-[#006937] rounded-full px-2 py-2 flex items-center justify-center gap-1">
                    <span className="text-xs font-semibold truncate">
                      פנויות
                    </span>
                    <span className="text-sm font-bold">
                      {statusCounts.free}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 bg-[#E24B4A]/15 text-[#E24B4A] rounded-full px-2 py-2 flex items-center justify-center gap-1">
                    <span className="text-xs font-semibold truncate">
                      תפוסות
                    </span>
                    <span className="text-sm font-bold">
                      {statusCounts.busy}
                    </span>
                  </div>
                </div>

                {/* Building search above the map (filter will go to the left later) */}
                {/* Search + filter row above the map */}
                <div dir="rtl" className="relative z-20">
                  <div className="flex items-center gap-2">
                    {/* Поиск (основной, широкий) */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={mapBuildingQuery}
                        onChange={(e) => {
                          setMapBuildingQuery(e.target.value);
                          setShowMapBuildingList(true);
                          setSelectedBuilding("");
                        }}
                        onFocus={() => setShowMapBuildingList(true)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            filteredMapBuildings.length > 0
                          ) {
                            const b = filteredMapBuildings[0];
                            setSelectedBuilding(b);
                            setMapBuildingQuery(b);
                            setShowMapBuildingList(false);
                          }
                        }}
                        placeholder="חיפוש בניין"
                        className="w-full pr-4 pl-9 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-[#006937] shadow-sm"
                      />
                      {mapBuildingQuery && (
                        <button
                          onClick={() => {
                            setMapBuildingQuery("");
                            setSelectedBuilding("");
                            setShowMapBuildingList(false);
                          }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          aria-label="נקה חיפוש"
                        >
                          ✕
                        </button>
                      )}
                      {showMapBuildingList && mapBuildingQuery.trim() && (
                        <div className="absolute z-30 right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                          {filteredMapBuildings.length === 0 ? (
                            <div className="px-4 py-2 text-xs text-gray-400 font-semibold">
                              לא נמצא בניין כזה
                            </div>
                          ) : (
                            filteredMapBuildings.map((b) => (
                              <button
                                key={b}
                                onClick={() => {
                                  setSelectedBuilding(b);
                                  setMapBuildingQuery(b);
                                  setShowMapBuildingList(false);
                                }}
                                className="w-full text-right px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#E1F5EE] hover:text-[#006937] transition-colors"
                              >
                                בניין {b}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Фильтр (поменьше, слева) */}
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowFilter((s) => !s)}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 shadow-sm hover:bg-gray-50"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 5h16M7 12h10M10 19h4" />
                        </svg>
                        סינון
                        {Object.values(amenityFilters).filter(Boolean).length >
                          0 && (
                          <span className="bg-[#006937] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                            {
                              Object.values(amenityFilters).filter(Boolean)
                                .length
                            }
                          </span>
                        )}
                      </button>
                      {showFilter && (
                        <div className="absolute z-30 left-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg p-2 w-52">
                          {[
                            {
                              key: "wifi",
                              label: "WiFi טוב",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M5 12.5a10 10 0 0 1 14 0" />
                                  <path d="M8.5 16a5 5 0 0 1 7 0" />
                                  <circle cx="12" cy="19" r="1" />
                                </svg>
                              ),
                            },
                            {
                              key: "quiet",
                              label: "שקט",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                                  <path d="M16 9l5 6M21 9l-5 6" />
                                </svg>
                              ),
                            },
                            {
                              key: "desk",
                              label: "שולחן",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M6 19v-2h12v2" />
                                  <path d="M6 17v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
                                  <path d="M9 21v-2M15 21v-2" />
                                </svg>
                              ),
                            },
                            {
                              key: "computers",
                              label: "כיתת מחשבים",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="3"
                                    y="4"
                                    width="18"
                                    height="13"
                                    rx="2"
                                  />
                                  <path d="M8 21h8M12 17v4" />
                                </svg>
                              ),
                            },
                          ].map((opt) => {
                            const active = !!amenityFilters[opt.key];
                            return (
                              <button
                                key={opt.key}
                                onClick={() =>
                                  setAmenityFilters((f) => ({
                                    ...f,
                                    [opt.key]: !f[opt.key],
                                  }))
                                }
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-[#E1F5EE] text-[#006937]" : "text-gray-600 hover:bg-gray-50"}`}
                              >
                                <span
                                  className={
                                    active ? "text-[#006937]" : "text-gray-400"
                                  }
                                >
                                  {opt.icon}
                                </span>
                                <span className="flex-1 text-right">
                                  {opt.label}
                                </span>
                                {active && (
                                  <svg
                                    className="w-4 h-4 text-[#006937]"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Interactive Map Component Placeholder - Job 3 Map Frame Container */}
                <div className="border border-gray-200 rounded-3xl overflow-hidden shadow-sm h-80 relative z-0">
                  <CampusMap
                    rooms={rooms}
                    selectedBuilding={selectedBuilding}
                  />
                </div>

                {/* Simulation Controls Panel (Admin only) */}
                {currentUser?.isAdmin && (
                  <section className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-800 mb-3">
                      מערכת בקרת סימולציה
                    </h3>

                    <div className="flex flex-col gap-2.5 mb-4">
                      {[
                        { id: 1, label: "Scenario 1: Basic Flow" },
                        { id: 2, label: "Scenario 2: Conflict" },
                        { id: 3, label: "Scenario 3: Spam Attack" },
                        { id: 4, label: "Scenario 4: VIP Pass" },
                      ].map((scenario) => (
                        <label
                          key={scenario.id}
                          className="flex items-center gap-3 cursor-pointer text-sm font-medium text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-100/50 transition-all"
                        >
                          <input
                            type="radio"
                            name="scenario"
                            className="accent-[#006937] h-4 w-4"
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
                      className="w-full text-white py-3 px-4 rounded-xl text-base font-semibold tracking-wide shadow-sm transition-all"
                      style={{
                        backgroundColor: isSimulationActive
                          ? "#E24B4A"
                          : "#006937",
                      }}
                    >
                      {isStartingEngine
                        ? " Starting Engine..."
                        : isSimulationActive
                          ? " עצור סימולציה"
                          : " הפעל מנוע סימולציה"}
                    </button>
                    <button
                      onClick={() => clearLogs()}
                      disabled={isSimulationActive || isClearingLogs}
                      className="w-full mt-3 bg-gray-50 hover:bg-[#FCEBEB] text-gray-500 hover:text-[#E24B4A] border border-gray-200 hover:border-[#E24B4A]/30 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isClearingLogs
                        ? " מנקה נתונים..."
                        : " נקה היסטוריית דיווחים (Clear Logs)"}
                    </button>
                  </section>
                )}

                {/* =========================================================================
                  LIVE ROOMS OVERVIEW (Brings back 'rooms', 'roomsLoading', & 'roomsError')
                  ========================================================================= */}
                <section className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-base font-semibold text-gray-800">
                      מצב כיתות בזמן אמת
                    </h3>
                  </div>
                  {roomBuildingFilter && (
                    <div className="flex items-center gap-2 mb-4 -mt-1">
                      <span className="text-xs font-semibold text-gray-400">
                        מציג:
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-[#E1F5EE] text-[#006937] text-xs font-bold px-3 py-1 rounded-full">
                        בניין {roomBuildingFilter}
                        <button
                          onClick={() => {
                            setSelectedBuilding("");
                            setMapBuildingQuery("");
                          }}
                          className="hover:text-[#004128] transition-colors"
                          aria-label="הצג את כל הבניינים"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  )}
                  {/* Network Loading and Error States */}
                  {roomsLoading && (
                    <div className="text-center py-6 text-sm text-gray-400 font-medium animate-pulse">
                      קורא נתוני תפוסה מ-Supabase...
                    </div>
                  )}

                  {roomsError && (
                    <div className="text-center py-4 bg-red-50 text-red-600 rounded-xl text-xs font-semibold border border-red-100">
                      שגיאת רשת: לא ניתן להתחבר לשרת הנתונים.
                    </div>
                  )}
                  {/* Search + filter by class */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={roomListQuery}
                        onChange={(e) => setRoomListQuery(e.target.value)}
                        placeholder="חיפוש לפי מספר כיתה"
                        className="w-full pr-4 pl-9 py-2 rounded-full border border-gray-200 bg-gray-50/50 text-sm font-semibold text-right focus:outline-none focus:ring-2 focus:ring-[#006937]"
                      />
                      {roomListQuery && (
                        <button
                          onClick={() => setRoomListQuery("")}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          aria-label="נקה חיפוש"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="relative shrink-0">
                      <button
                        onClick={() => setShowRoomFilter((s) => !s)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 5h16M7 12h10M10 19h4" />
                        </svg>
                        סינון
                        {Object.values(amenityFilters).filter(Boolean).length >
                          0 && (
                          <span className="bg-[#006937] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                            {
                              Object.values(amenityFilters).filter(Boolean)
                                .length
                            }
                          </span>
                        )}
                      </button>
                      {showRoomFilter && (
                        <div className="absolute z-30 left-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-lg p-2 w-52">
                          {[
                            {
                              key: "wifi",
                              label: "WiFi טוב",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M5 12.5a10 10 0 0 1 14 0" />
                                  <path d="M8.5 16a5 5 0 0 1 7 0" />
                                  <circle cx="12" cy="19" r="1" />
                                </svg>
                              ),
                            },
                            {
                              key: "quiet",
                              label: "שקט",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                                  <path d="M16 9l5 6M21 9l-5 6" />
                                </svg>
                              ),
                            },
                            {
                              key: "desk",
                              label: "שולחן",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M6 19v-2h12v2" />
                                  <path d="M6 17v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
                                  <path d="M9 21v-2M15 21v-2" />
                                </svg>
                              ),
                            },
                            {
                              key: "computers",
                              label: "כיתת מחשבים",
                              icon: (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="3"
                                    y="4"
                                    width="18"
                                    height="13"
                                    rx="2"
                                  />
                                  <path d="M8 21h8M12 17v4" />
                                </svg>
                              ),
                            },
                          ].map((opt) => {
                            const active = !!amenityFilters[opt.key];
                            return (
                              <button
                                key={opt.key}
                                onClick={() =>
                                  setAmenityFilters((f) => ({
                                    ...f,
                                    [opt.key]: !f[opt.key],
                                  }))
                                }
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${active ? "bg-[#E1F5EE] text-[#006937]" : "text-gray-600 hover:bg-gray-50"}`}
                              >
                                <span
                                  className={
                                    active ? "text-[#006937]" : "text-gray-400"
                                  }
                                >
                                  {opt.icon}
                                </span>
                                <span className="flex-1 text-right">
                                  {opt.label}
                                </span>
                                {active && (
                                  <svg
                                    className="w-4 h-4 text-[#006937]"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Real-Time Room Cards Grid Container */}
                  <div className="grid grid-cols-2 gap-2.5 max-h-72 overflow-y-auto overflow-x-hidden no-scrollbar pr-1">
                    {visibleRooms.map((room: any) => {
                      // 1. SAFETY SHIELD: Fallback to 'UNKNOWN' if fields are missing so getStatusStyles never crashes
                      const rawStatus =
                        room.occupancy_status || room.status || "UNKNOWN";
                      const status = getStatusStyles(rawStatus);

                      // 2. SAFETY SHIELD: Safe fallbacks for room display text
                      const displayRoomNumber =
                        room.room_id || room.room || "מזהה חסר";
                      const displayBuilding =
                        room.building_number ||
                        room.b_code ||
                        room.building_code;
                      const isFree = String(rawStatus).toUpperCase() === "FREE";

                      return (
                        <div
                          key={room.id}
                          className={`min-w-0 p-3 rounded-2xl border ${status.border} ${status.bg} flex flex-col justify-between shadow-sm`}
                        >
                          <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide truncate">
                            {displayBuilding
                              ? `בניין ${displayBuilding}`
                              : "קמפוס בר אילן"}
                          </div>
                          <div className="flex justify-between items-end gap-1 mt-1.5">
                            <span className="text-sm font-semibold text-gray-800 truncate">
                              כיתה {displayRoomNumber}
                            </span>
                            {isFree ? (
                              <button
                                onClick={() => setShowBookingSoon(true)}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#006937] bg-white px-2 py-1 rounded-lg border border-[#006937]/30 hover:bg-[#E1F5EE] transition-colors"
                              >
                                <svg
                                  className="w-3 h-3"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="3"
                                    y="4"
                                    width="18"
                                    height="18"
                                    rx="2"
                                  />
                                  <path d="M16 2v4M8 2v4M3 10h18" />
                                  <path d="M9 16l2 2 4-4" />
                                </svg>
                                הזמנה
                              </button>
                            ) : (
                              <span
                                className={`shrink-0 text-[11px] font-semibold ${status.text} bg-white/80 px-2 py-0.5 rounded-lg border border-current/10`}
                              >
                                {status.label}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Real-Time Terminal Output Log (Admin only) */}
                {currentUser?.isAdmin && (
                  <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>{" "}
                      עדכוני קונצנזוס מהשטח
                    </h3>

                    <div
                      ref={terminalContainerRef}
                      style={{
                        backgroundColor: "#1e1e1e",
                        borderRadius: "16px",
                        padding: "16px",
                        height: "260px",
                        minHeight: "260px",
                        maxHeight: "260px",
                        overflowY: "auto",
                        fontFamily: '"Courier New", Courier, monospace',
                        fontSize: "12px",
                        boxShadow: "inset 0 0 10px rgba(0,0,0,0.5)",
                        direction: "ltr",
                      }}
                    >
                      {(!logs || logs.length === 0) && (
                        <p
                          style={{
                            color: "#888",
                            fontStyle: "italic",
                            margin: 0,
                          }}
                        >
                          &gt; Terminal idle. Start the simulation engine to
                          view crowdsourced agent reports...
                        </p>
                      )}

                      {logs?.map((log: any) => (
                        <div
                          key={log.id || log.timestamp}
                          style={{
                            marginBottom: "12px",
                            lineHeight: "1.5",
                            color: getLogColor(log.type),
                            fontFamily: '"Courier New", Courier, monospace',
                            direction: "ltr",
                            textAlign: "left",
                          }}
                        >
                          <div>
                            📡{" "}
                            <span style={{ color: "#888" }}>
                              [{log.timestamp}]
                            </span>{" "}
                            User <strong>{log.agent_id}</strong> (Tr:{" "}
                            {log.trust?.toFixed(2) || "0.50"}) | Room{" "}
                            {log.building}-{log.room} | Report: [
                            {log.status || "UNKNOWN"}]
                          </div>
                          <div
                            style={{
                              color: "#78cde6",
                              marginLeft: "24px",
                              fontSize: "11px",
                            }}
                          >
                            ↳ 🧠 {log.message}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2 text-right font-semibold">
                      סטטוס טרמינל:{" "}
                      {isSimulationActive
                        ? "🔴 Live Feed Streaming"
                        : "⚪ Offline"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
                TAB VIEW 2: ADVANCED SYSTEM FILTERS (Screen 3)
                ========================================== */}
            {activeTab === "search" && (
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn">
                <h2 className="text-xl font-semibold text-[#004128]">
                  חיפוש וסינון מתקדם
                </h2>
                <div className="space-y-4 mt-2">
                  {/* ФИЛЬТР ПО ЗДАНИЯМ (ТЕПЕРЬ ДИНАМИЧЕСКИЙ) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">
                      בחר בניין קמפוס
                    </label>

                    {/* Используем flex-wrap чтобы кнопки переносились на новые строки */}
                    <div className="flex flex-wrap gap-2 text-xs font-semibold justify-center">
                      {/* Кнопка "Всё" всегда идет первой */}
                      <button
                        onClick={() => setSelectedBuildingFilter("הכל")}
                        className={`py-2 px-4 rounded-xl transition-all ${
                          selectedBuildingFilter === "הכל"
                            ? "bg-[#006937] text-white shadow-md"
                            : "bg-gray-50 text-gray-600 border border-gray-100"
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
                              ? "bg-[#006937] text-white shadow-md"
                              : "bg-gray-50 text-gray-600 border border-gray-100"
                          }`}
                        >
                          {bld}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* СЛАЙДЕР ВРЕМЕНИ */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1.5">
                      זמן פנוי מינימלי:{" "}
                      <span className="text-[#006937]">
                        {minFreeMinutes} דקות
                      </span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="180"
                      step="10"
                      value={minFreeMinutes}
                      onChange={(e) =>
                        setMinFreeMinutes(parseInt(e.target.value))
                      }
                      className="w-full accent-[#006937]"
                    />
                    <div className="flex justify-between text-[11px] text-gray-400 font-semibold mt-1">
                      <span>10 דקות</span>
                      <span>לפחות שעה</span>
                      <span>3 שעות</span>
                    </div>
                  </div>

                  {/* КНОПКА ПОИСКА */}
                  <button
                    onClick={() =>
                      searchRooms({
                        min_minutes: minFreeMinutes,
                        building: selectedBuildingFilter,
                      })
                    }
                    disabled={isSearching}
                    className="w-full bg-[#004128] text-white py-3 rounded-xl font-semibold mt-4 shadow-md transition-all hover:bg-[#006937] disabled:opacity-70"
                  >
                    {isSearching ? "מחפש..." : "חפש חדרים פנויים"}
                  </button>

                  {/* БЛОК РЕЗУЛЬТАТОВ ПОИСКА */}
                  {searchResponse && (
                    <div className="mt-6 border-t border-gray-100 pt-4 animate-fadeIn">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-800">
                          תוצאות חיפוש:
                        </h3>
                        <span className="text-xs bg-[#006937]/10 text-[#006937] font-semibold px-2 py-1 rounded-lg">
                          {searchResponse.results_count} חדרים מתאימים
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                        {searchResponse.results_count === 0 ? (
                          <div className="text-center py-6 text-gray-400 text-sm font-semibold">
                            לא נמצאו חדרים שעונים על הדרישות
                          </div>
                        ) : (
                          searchResponse.rooms.map((room: any) => (
                            <div
                              key={room.room_id}
                              className="bg-gray-50 border border-gray-100 p-3 rounded-xl flex justify-between items-center shadow-sm"
                            >
                              <div>
                                <div className="text-xs text-gray-500 font-semibold uppercase">
                                  בניין {room.building_number}
                                </div>
                                <div className="text-base font-semibold text-gray-800">
                                  כיתה {room.room_number}
                                </div>
                              </div>
                              <div className="text-left">
                                <div className="text-lg font-semibold text-[#006937]">
                                  {room.free_for_minutes} דק'
                                </div>
                                <div className="text-[10px] text-gray-400 font-semibold">
                                  {formatUntil(room.next_class_at)}
                                </div>
                                <button
                                  onClick={() => setShowBookingSoon(true)}
                                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#006937] bg-white px-2 py-1 rounded-lg border border-[#006937]/30 hover:bg-[#E1F5EE] transition-colors"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="3"
                                      y="4"
                                      width="18"
                                      height="18"
                                      rx="2"
                                    />
                                    <path d="M16 2v4M8 2v4M3 10h18" />
                                    <path d="M9 16l2 2 4-4" />
                                  </svg>
                                  הזמנה
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* ==========================================
    ML DATA SCIENCE FORECASTING CARD (Smart Dropdowns & Feedback)
    ========================================== */}
                  <div className="mt-8 border-t border-gray-100 pt-6 animate-fadeIn">
                    <div className="bg-[#E1F5EE]/40 border border-[#006937]/20 p-5 rounded-3xl space-y-4">
                      {/* Product UX Header without jargon */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#006937] animate-pulse"></span>
                          <h3 className="text-base font-bold text-[#004128]">
                            תחזית עומס עתידית (איפה יהיה פנוי?)
                          </h3>
                        </div>
                        <span className="text-[10px] font-bold bg-white text-[#006937] px-2.5 py-1 rounded-full border border-[#006937]/20">
                          AI Forecast
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed">
                        בחר בניין וכיתה כדי לבדוק זמינות עתידית, או השאר על "כל
                        הכיתות" כדי לראות את 5 הכיתות הפנויות ביותר.
                      </p>

                      {/* ROW 1: DAY OF WEEK & HOUR SELECTORS */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            יום בשבוע
                          </label>
                          <select
                            value={mlDayOfWeek}
                            onChange={(e) => {
                              setMlDayOfWeek(Number(e.target.value));
                              resetPrediction();
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-right focus:ring-2 focus:ring-[#006937]"
                          >
                            <option value={0}>יום ראשון</option>
                            <option value={1}>יום שני</option>
                            <option value={2}>יום שלישי</option>
                            <option value={3}>יום רביעי</option>
                            <option value={4}>יום חמישי</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            שעה
                          </label>
                          <select
                            value={mlHour}
                            onChange={(e) => {
                              setMlHour(Number(e.target.value));
                              resetPrediction();
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-right focus:ring-2 focus:ring-[#006937]"
                          >
                            {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(
                              (hr) => (
                                <option key={hr} value={hr}>
                                  {hr}:00
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>

                      {/* ROW 2: SMART CASCADING BUILDINGS & ROOMS SELECTORS */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            בניין קמפוס
                          </label>
                          <select
                            value={mlBuilding}
                            onChange={(e) => {
                              setMlBuilding(e.target.value);
                              setMlSpecificRoom(""); // Automatically reset room selection when building changes
                              resetPrediction();
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-right focus:ring-2 focus:ring-[#006937]"
                          >
                            <option value="הכל">כל הבניינים</option>
                            {uniqueBuildings.map((b) => (
                              <option key={b} value={b}>
                                בניין {b}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">
                            כיתה ספציפית
                          </label>
                          <select
                            value={mlSpecificRoom}
                            onChange={(e) => {
                              setMlSpecificRoom(e.target.value);
                              resetPrediction();
                            }}
                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-right focus:ring-2 focus:ring-[#006937]"
                          >
                            <option value="">-- כל הכיתות (טופ 5) --</option>
                            {availableRoomsForBuilding.map((roomNum) => (
                              <option key={roomNum} value={roomNum}>
                                כיתה {roomNum}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* ACTION BUTTON */}
                      <button
                        type="button"
                        onClick={() => {
                          predictRoom({
                            day_of_week: mlDayOfWeek,
                            hour: mlHour,
                            building_number: mlBuilding,
                            room_number: mlSpecificRoom.trim(),
                          });
                        }}
                        disabled={isPredicting}
                        className="w-full bg-[#006937] text-white py-3.5 rounded-xl text-sm font-bold shadow-sm hover:bg-[#158061] transition-all disabled:opacity-50 flex justify-center items-center gap-2"
                      >
                        {isPredicting
                          ? "מחשב תחזית חכמה..."
                          : "הצג תחזית (Random Forest)"}
                      </button>

                      {/* ==========================================
        FORECAST RESULTS & ERROR FEEDBACK CONTAINER
        ========================================== */}
                      {mlPrediction && (
                        <div className="space-y-4 pt-2 animate-fadeIn">
                          {/* FEEDBACK: IF SPECIFIC ROOM WAS NOT FOUND */}
                          {mlSpecificRoom.trim() &&
                            mlPrediction.room_exists === false && (
                              <div className="bg-red-50 border border-red-200 p-3.5 rounded-2xl text-red-700 text-xs font-bold text-center">
                                ⚠️ כיתה {mlSpecificRoom} אינה קיימת בבניין שנבחר
                                או שאין לגביה נתונים במערכת.
                              </div>
                            )}

                          {/* FEEDBACK: SPECIFIC ROOM RESULT CARD */}
                          {mlSpecificRoom.trim() &&
                            mlPrediction.specific_room && (
                              <div className="bg-white p-4 rounded-2xl border-2 border-[#006937] shadow-sm">
                                <span className="text-[10px] font-bold text-[#006937] uppercase block mb-1">
                                  תוצאה עבור כיתה ספציפית
                                </span>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-bold text-gray-800">
                                      כיתה{" "}
                                      {mlPrediction.specific_room.room_number} ·
                                      בניין{" "}
                                      {
                                        mlPrediction.specific_room
                                          .building_number
                                      }
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">
                                      {mlPrediction.specific_room
                                        .has_schedule_class
                                        ? "יש שיעור במערכת השעות"
                                        : "אין שיעור רשמי במערכת"}
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <div className="text-2xl font-black text-[#006937]">
                                      {
                                        mlPrediction.specific_room
                                          .probability_free_percent
                                      }
                                    </div>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${mlPrediction.specific_room.prediction === "FREE" ? "bg-[#E1F5EE] text-[#006937]" : "bg-[#FCEBEB] text-[#E24B4A]"}`}
                                    >
                                      {mlPrediction.specific_room.prediction ===
                                      "FREE"
                                        ? "צפוי להיות פנוי"
                                        : "סיכוי נמוך"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                          {/* TOP-5 AVAILABLE ROOMS LIST */}
                          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-2.5">
                            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                              <span className="text-xs font-bold text-gray-700">
                                🏆 5 הכיתות הפנויות ביותר:
                              </span>
                              <span className="text-[10px] font-semibold text-gray-400">
                                {mlPrediction.building_filter === "הכל"
                                  ? "כל הקמפוס"
                                  : `בניין ${mlPrediction.building_filter}`}
                              </span>
                            </div>

                            {mlPrediction.top_rooms.length === 0 ? (
                              <div className="text-center py-4 text-xs text-gray-400 font-semibold">
                                לא נמצאו כיתות זמינות לשעה זו
                              </div>
                            ) : (
                              mlPrediction.top_rooms.map((room, idx) => (
                                <div
                                  key={`${room.building_number}-${room.room_number}`}
                                  className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center">
                                      {idx + 1}
                                    </span>
                                    <div>
                                      <span className="text-sm font-bold text-gray-800">
                                        כיתה {room.room_number}
                                      </span>
                                      <span className="text-xs text-gray-400 mr-1.5">
                                        (בניין {room.building_number})
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="text-base font-black text-[#006937]">
                                      {room.probability_free_percent}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#E1F5EE] text-[#006937]">
                                      {room.prediction === "FREE"
                                        ? "פנוי"
                                        : "תפוס"}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Academic Citation Badge for Presentation Report */}
                          <div className="text-center">
                            <span className="text-[10px] text-gray-400 font-mono">
                              Powered by AI · Random Forest Model (scikit-learn)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                TAB VIEW 3: GAMIFIED PROGRESSION PROFILE (Screen 5 - Fully Dynamic)
                ========================================== */}
            {activeTab === "profile" && currentUser && (
              <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center space-y-4 animate-fadeIn">
                {/* User Avatar Initial */}
                <div className="w-16 h-16 bg-[#006937] text-white flex items-center justify-center text-2xl font-semibold rounded-full mx-auto shadow-md mb-2 uppercase">
                  {currentUser.app_user_id.charAt(0)}
                </div>

                {/* Dynamic User ID String */}
                <h2 className="text-xl font-semibold text-gray-800 font-mono tracking-tight">
                  {currentUser.app_user_id}
                </h2>

                {/* Identity Badges */}
                <div className="flex justify-center gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200/50">
                    {currentUser.role === "Student" ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M22 10 12 5 2 10l10 5 10-5z" />
                          <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
                          <path d="M22 10v4" />
                        </svg>
                        סטודנט/ית
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 4h18" />
                          <path d="M4 4v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V4" />
                          <path d="M12 14v4M9 21l3-3 3 3" />
                        </svg>
                        מרצה
                      </>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-[#E1F5EE] text-[#006937] px-3 py-1 rounded-full border border-[#006937]/20">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
                      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
                    </svg>
                    דרגה: {currentUser.tier}
                  </span>
                </div>

                {/* Pioneer Rule Banner: Evaluates the actual boolean value from main.py */}
                {!currentUser.pioneer_rule_unlocked && (
                  <div className="bg-amber-50 text-amber-800 p-3.5 rounded-2xl border border-amber-200 text-xs font-semibold text-right space-y-1 animate-slideUp">
                    <p className="text-amber-900 flex items-center gap-1.5">
                      {" "}
                      תקופת הרצה למשתמש חדש
                    </p>
                    <p className="text-gray-500 font-normal leading-relaxed">
                      מכיוון שאתה רשום כמשתמש חדש במערכת, הדיווחים הראשונים שלך
                      יעברו בדיקת קונצנזוס על ידי חברי הקהילה בקמפוס לפני שישנו
                      את צבע המפה.
                    </p>
                  </div>
                )}

                {/* Dynamic Trust Score Progress Indicator */}
                <div className="bg-[#004128] text-white p-4 rounded-2xl shadow-inner">
                  <span className="text-[10px] text-green-300 font-semibold uppercase tracking-wider block">
                    ציון אמינות קהילתי שלך
                  </span>
                  <div className="text-4xl font-semibold text-[#f5faf0] my-1">
                    {Math.round(currentUser.trust_score * 100)}%
                  </div>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {currentUser.role === "Lecturer"
                      ? "★ דירוג סגל אקדמי מובנה"
                      : "★ הדירוג משתנה על בסיס דיוק הדיווחים שלך"}
                  </p>
                </div>

                {/* Achievement Matrix Badges */}
                <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-100">
                  <div className="text-center opacity-100">
                    <svg
                      className="w-7 h-7 mx-auto block text-[#006937]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                    </svg>
                    <span className="text-[9px] font-semibold text-gray-400">
                      דיווח ראשון
                    </span>
                  </div>
                  <div className="text-center opacity-100">
                    <svg
                      className="w-7 h-7 mx-auto block text-[#006937]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="12" cy="12" r="1.5" />
                    </svg>
                    <span className="text-[9px] font-semibold text-gray-400">
                      דיוק גבוה
                    </span>
                  </div>
                  <div className="text-center opacity-100">
                    <svg
                      className="w-7 h-7 mx-auto block text-[#006937]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-1.6.6-2.8 1.5-3.6C8.7 8.4 9 9 10 9c0-2 1-4 2-6z" />
                    </svg>
                    <span className="text-[9px] font-semibold text-gray-400">
                      7 ימים ברצף
                    </span>
                  </div>
                  <div className="text-center opacity-40">
                    <svg
                      className="w-7 h-7 mx-auto block text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 3h12l3 5-9 12L3 8z" />
                      <path d="M3 8h18" />
                      <path d="M9 3 7.5 8 12 20" />
                      <path d="M15 3l1.5 5L12 20" />
                    </svg>
                    <span className="text-[9px] font-semibold text-gray-400">
                      50 דיווחים
                    </span>
                  </div>
                </div>
                <div className="mt-6 border-t border-gray-100 pt-5 text-right animate-fadeIn">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-[#006937]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    היסטוריית דיווחים
                  </h3>

                  {isLoadingHistory ? (
                    <div className="text-center py-4 text-xs text-gray-400 font-semibold animate-pulse">
                      טוען היסטוריה...
                    </div>
                  ) : !userHistory || userHistory.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-2xl border border-gray-100 text-gray-400 text-xs font-semibold">
                      טרם בוצעו דיווחים במערכת
                    </div>
                  ) : (
                    <div
                      dir="rtl"
                      className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1"
                    >
                      {userHistory.map((report: any, index: number) => {
                        const isFree = report.status === "FREE";
                        return (
                          <div
                            key={index}
                            className={`flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3 transition-all hover:bg-gray-50 border-r-4 ${isFree ? "border-r-[#006937]" : "border-r-[#E24B4A]"}`}
                          >
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isFree ? "bg-[#E1F5EE] text-[#006937]" : "bg-[#FCEBEB] text-[#E24B4A]"}`}
                            >
                              {isFree ? (
                                <svg
                                  className="w-5 h-5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg
                                  className="w-5 h-5"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <div className="text-sm font-semibold text-gray-800 truncate">
                                בניין {report.building_number} · כיתה{" "}
                                {report.room_number}
                              </div>
                              <div
                                className="text-[10px] text-gray-400 font-semibold mt-0.5"
                                dir="ltr"
                              >
                                {report.timestamp}
                              </div>
                            </div>
                            <span
                              className={`text-xs font-bold shrink-0 ${isFree ? "text-[#006937]" : "text-[#E24B4A]"}`}
                            >
                              {isFree ? "פנוי" : "תפוס"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* ==========================================
                TAB VIEW 4: QUICK REPORT (Screen 6)
                ========================================== */}
            {activeTab === "report" && currentUser && (
              <div dir="rtl" className="space-y-4 animate-fadeIn text-right">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab("map")}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="חזרה"
                  >
                    <svg
                      className="w-6 h-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                  <h2 className="text-xl font-semibold text-[#004128]">
                    דיווח מהיר
                  </h2>
                </div>

                {reportResult ? (
                  submittedStatus === "FREE" && !amenitiesDone ? (
                    /* --- Optional mini-survey about Wifi, tabels, airconditional --- */
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn">
                      <div className="text-center">
                        <div className="w-14 h-14 bg-[#E1F5EE] text-[#006937] flex items-center justify-center rounded-full mx-auto mb-2">
                          <svg
                            className="w-7 h-7"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">
                          תודה על הדיווח!
                        </h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                          רוצה להוסיף? איך היה בכיתה {submittedRoom}?
                        </p>
                      </div>

                      {[
                        {
                          key: "wifi",
                          label: "WiFi",
                          icon: (
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 12.5a10 10 0 0 1 14 0" />
                              <path d="M8.5 16a5 5 0 0 1 7 0" />
                              <circle cx="12" cy="19" r="1" />
                            </svg>
                          ),
                        },
                        {
                          key: "quiet",
                          label: "שקט",
                          icon: (
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 5 6 9H3v6h3l5 4V5z" />
                              <path d="M16 9l5 6M21 9l-5 6" />
                            </svg>
                          ),
                        },
                        {
                          key: "seating",
                          label: "כיסאות נוחים",
                          icon: (
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M6 19v-2h12v2" />
                              <path d="M6 17v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
                              <path d="M9 21v-2M15 21v-2" />
                            </svg>
                          ),
                        },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5"
                        >
                          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            {item.icon}
                            {item.label}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                setAmenities((a) => ({
                                  ...a,
                                  [item.key]: true,
                                }))
                              }
                              aria-label="טוב"
                              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${amenities[item.key] === true ? "border-[#006937] bg-[#E1F5EE] text-[#006937]" : "border-gray-200 text-gray-400 hover:border-[#006937]/40"}`}
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
                                <path d="M7 11l4-7a2 2 0 0 1 3 1.5V9h4.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 18 19H7" />
                              </svg>
                            </button>
                            <button
                              onClick={() =>
                                setAmenities((a) => ({
                                  ...a,
                                  [item.key]: false,
                                }))
                              }
                              aria-label="לא טוב"
                              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all ${amenities[item.key] === false ? "border-[#E24B4A] bg-[#FCEBEB] text-[#E24B4A]" : "border-gray-200 text-gray-400 hover:border-[#E24B4A]/40"}`}
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
                                <path d="M17 13l-4 7a2 2 0 0 1-3-1.5V15H5.5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6 5h11" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            console.log("amenities report", {
                              room_id: submittedRoomId,
                              room: submittedRoom,
                              ...amenities,
                            });
                            setAmenitiesDone(true);
                          }}
                          disabled={Object.keys(amenities).length === 0}
                          className="flex-1 bg-[#006937] text-white py-2.5 rounded-xl font-bold text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          שלח
                        </button>
                        <button
                          onClick={() => setAmenitiesDone(true)}
                          className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm"
                        >
                          דלג
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* --- Финальный экран благодарности --- */
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-center space-y-3 animate-fadeIn">
                      <div className="w-16 h-16 bg-[#E1F5EE] text-[#006937] flex items-center justify-center rounded-full mx-auto">
                        <svg
                          className="w-8 h-8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          תודה על זמנכם!
                        </h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                          הדיווח שלך נשלח
                        </p>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            resetReport();
                            setReportStatus(null);
                            setAmenitiesDone(false);
                            setSubmittedStatus(null);
                            setAmenities({});
                          }}
                          className="flex-1 bg-[#006937] text-white py-2.5 rounded-xl font-bold text-sm"
                        >
                          דיווח נוסף
                        </button>
                        <button
                          onClick={() => setActiveTab("map")}
                          className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm"
                        >
                          חזרה למפה
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                    {/* Здание: ввод + список */}
                    <div className="space-y-1.5 relative">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        בניין
                      </label>
                      <input
                        type="text"
                        value={buildingQuery}
                        onChange={(e) => {
                          setBuildingQuery(e.target.value);
                          setShowBuildingList(true);
                          setReportBuilding("");
                          setReportRoomId(null);
                          setRoomQuery("");
                        }}
                        onFocus={() => setShowBuildingList(true)}
                        placeholder="הקלד מספר בניין..."
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#006937] bg-gray-50/50 font-semibold text-sm text-right"
                      />
                      {showBuildingList && buildingQuery.trim() && (
                        <div className="absolute z-20 right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                          {filteredBuildings.length === 0 ? (
                            <div className="px-4 py-2 text-xs text-gray-400 font-semibold">
                              לא נמצא בניין כזה
                            </div>
                          ) : (
                            filteredBuildings.map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => {
                                  setReportBuilding(b);
                                  setBuildingQuery(b);
                                  setShowBuildingList(false);
                                  setReportRoomId(null);
                                  setRoomQuery("");
                                }}
                                className="w-full text-right px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#E1F5EE] hover:text-[#006937] transition-colors"
                              >
                                בניין {b}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Аудитория: ввод + список */}
                    <div className="space-y-1.5 relative">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        כיתה
                      </label>
                      <input
                        type="text"
                        value={roomQuery}
                        disabled={!reportBuilding}
                        onChange={(e) => {
                          setRoomQuery(e.target.value);
                          setShowRoomList(true);
                          setReportRoomId(null);
                        }}
                        onFocus={() => setShowRoomList(true)}
                        placeholder={
                          reportBuilding
                            ? "הקלד מספר כיתה..."
                            : "בחר בניין קודם"
                        }
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#006937] bg-gray-50/50 font-semibold text-sm text-right disabled:opacity-50"
                      />
                      {showRoomList && reportBuilding && roomQuery.trim() && (
                        <div className="absolute z-10 right-0 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-44 overflow-y-auto">
                          {filteredReportRooms.length === 0 ? (
                            <div className="px-4 py-2 text-xs text-gray-400 font-semibold">
                              לא נמצאה כיתה כזו
                            </div>
                          ) : (
                            filteredReportRooms.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setReportRoomId(r.id);
                                  setRoomQuery(r.room_id);
                                  setShowRoomList(false);
                                }}
                                className="w-full text-right px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-[#E1F5EE] hover:text-[#006937] transition-colors"
                              >
                                כיתה {r.room_id}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Статус */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        מה המצב עכשיו?
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setReportStatus("FREE")}
                          className={`py-5 rounded-2xl border-2 font-semibold text-base flex flex-col items-center gap-2 transition-all ${reportStatus === "FREE" ? "bg-[#E1F5EE] border-[#006937] text-[#006937]" : "bg-gray-50 border-gray-100 text-gray-400"}`}
                        >
                          <svg
                            className="w-8 h-8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M8.5 12.5l2.5 2.5 4.5-5" />
                          </svg>
                          פנוי
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportStatus("BUSY")}
                          className={`py-5 rounded-2xl border-2 font-semibold text-base flex flex-col items-center gap-2 transition-all ${reportStatus === "BUSY" ? "bg-[#FCEBEB] border-[#E24B4A] text-[#E24B4A]" : "bg-gray-50 border-gray-100 text-gray-400"}`}
                        >
                          <svg
                            className="w-8 h-8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M15 9l-6 6M9 9l6 6" />
                          </svg>
                          תפוס
                        </button>
                      </div>
                    </div>

                    {reportError && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs font-semibold text-red-600 text-center">
                        שגיאה בשליחת הדיווח. נסה שוב.
                      </div>
                    )}

                    <button
                      onClick={handleSubmitReport}
                      disabled={
                        reportRoomId == null ||
                        !reportStatus ||
                        isSubmittingReport
                      }
                      className="w-full bg-[#004128] hover:bg-[#006937] text-white py-3.5 rounded-xl text-base font-semibold tracking-wide shadow-md transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {isSubmittingReport ? "שולח..." : "שלח דיווח"}
                    </button>

                    <p className="text-[11px] text-center text-[#006937] font-semibold">
                      הדיווח שלך משפיע על דירוג האמינות שלך
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
          {/* Floating Report Button (FAB) */}
          {activeTab === "map" && (
            <button
              onClick={openReportTab}
              className="fixed bottom-24 left-5 z-50 bg-[#006937] hover:bg-[#158061] text-white pr-5 pl-4 py-3 rounded-full shadow-lg flex items-center gap-2 font-semibold text-sm transition-all hover:scale-105"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              דיווח
            </button>
          )}
          {/* "Feature in development" notice for room booking */}
          {showBookingSoon && (
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center p-6"
              onClick={() => setShowBookingSoon(false)}
            >
              <div
                dir="rtl"
                className="bg-gray-700/90 backdrop-blur-sm text-white rounded-2xl px-5 py-4 text-center shadow-xl max-w-[260px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-sm font-bold">התכונה בפיתוח</div>
                <div className="text-xs text-gray-300 mt-1">
                  בקרוב סטודנטים יוכלו לתאם כיתה ללמידה
                </div>
              </div>
            </div>
          )}

          {/* 3. PERSISTENT SYSTEM BOTTOM NAVIGATION MENU BAR (Screen Flow Anchor) */}
          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2.5 px-6 flex justify-around items-center shadow-2xl z-50 rounded-t-3xl">
            <button
              onClick={() => setActiveTab("map")}
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === "map" ? "text-[#006937] scale-110 font-semibold" : "text-gray-400 font-semibold"}`}
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
                <path d="M9 4v14" />
                <path d="M15 6v14" />
              </svg>
              <span className="text-[10px]">מפת קמפוס</span>
            </button>

            <button
              onClick={() => setActiveTab("search")}
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === "search" ? "text-[#006937] scale-110 font-semibold" : "text-gray-400 font-semibold"}`}
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <span className="text-[10px]">חיפוש מתקדם</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex flex-col items-center gap-1 transition-all ${activeTab === "profile" ? "text-[#006937] scale-110 font-semibold" : "text-gray-400 font-semibold"}`}
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
              <span className="text-[10px]">פרופיל שלי</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}

export default App;
