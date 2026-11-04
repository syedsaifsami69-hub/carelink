import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Staff from "./pages/Staff";
import Doctor from "./pages/Doctor";
import Patient from "./pages/Patient";
import { ToastHost } from "./lib/Shell";
import { SessionProvider, useSessionState, useSession, homeFor } from "./lib/store";

/** Client-side redirect only; the server enforces every permission. */
function StaffOnly({ roles, children }) {
  const { me } = useSession();
  if (me === undefined) return null;
  if (me?.kind !== "staff") return <Navigate to="/login" replace />;
  if (!roles.includes(me.user.role)) return <Navigate to={homeFor(me)} replace />;
  return children;
}

function App() {
  const session = useSessionState();
  return (
    <SessionProvider value={session}>
      <ToastHost>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/staff" element={<StaffOnly roles={["ADMIN", "RECEPTIONIST"]}><Staff /></StaffOnly>} />
          <Route path="/doctor" element={<StaffOnly roles={["DOCTOR"]}><Doctor /></StaffOnly>} />
          <Route path="/patient" element={<Patient />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastHost>
    </SessionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter><App /></HashRouter>
  </React.StrictMode>
);
