import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Landing from "./pages/Landing";
import Staff from "./pages/Staff";
import Doctor from "./pages/Doctor";
import Patient from "./pages/Patient";
import { ToastHost } from "./lib/Shell";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <ToastHost>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/doctor" element={<Doctor />} />
          <Route path="/patient" element={<Patient />} />
        </Routes>
      </ToastHost>
    </HashRouter>
  </React.StrictMode>
);
