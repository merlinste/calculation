import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import Login from "./pages/Login";
import Products from "./pages/Products";
import Suppliers from "./pages/Suppliers";
import ImportWizard from "./pages/ImportWizard";
import PriceChart from "./pages/PriceChart";
import ScenarioAnalysis from "./pages/ScenarioAnalysis";
import DBTable from "./pages/DBTable";
import ManualInvoice from "./pages/ManualInvoice";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="products" />} />
          <Route path="products" element={<Products />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="import" element={<ImportWizard />} />
          <Route path="invoice" element={<ManualInvoice />} />
          <Route path="prices" element={<PriceChart />} />
          <Route path="scenarios" element={<ScenarioAnalysis />} />
          <Route path="db" element={<DBTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
