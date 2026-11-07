import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './pages/Dashboard';
import { WaitingRoom } from './pages/WaitingRoom';
import { MeetingRoom } from './pages/MeetingRoom';
import { ScheduleMeetingModal } from './components/ScheduleMeetingModal';
import { LoginModal } from './components/LoginModal';

export const App: React.FC = () => {
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans">
            <Routes>
              {/* Meeting Room has full-screen layout without standard header */}
              <Route path="/room/:code" element={<MeetingRoom />} />

              {/* Standard Layout for Dashboard & Waiting Room */}
              <Route
                path="/*"
                element={
                  <>
                    <Navbar
                      onOpenSchedule={() => setIsScheduleOpen(true)}
                      onOpenLogin={() => setIsLoginOpen(true)}
                    />
                    <main className="flex-1">
                      <Routes>
                        <Route
                          path="/"
                          element={
                            <Dashboard
                              onOpenSchedule={() => setIsScheduleOpen(true)}
                              onOpenLogin={() => setIsLoginOpen(true)}
                            />
                          }
                        />
                        <Route path="/meeting/:code" element={<WaitingRoom />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </main>
                  </>
                }
              />
            </Routes>

            {/* Modals */}
            <ScheduleMeetingModal
              isOpen={isScheduleOpen}
              onClose={() => setIsScheduleOpen(false)}
            />
            <LoginModal
              isOpen={isLoginOpen}
              onClose={() => setIsLoginOpen(false)}
            />
          </div>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

