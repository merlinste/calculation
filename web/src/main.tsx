import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import Login from "./pages/Login";
import Products from "./pages/Products";
import ImportWizard from "./pages/ImportWizard";
import PriceChart from "./pages/PriceChart";
import DBTable from "./pages/DBTable";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="products" />} />
          <Route path="products" element={<Products />} />
          <Route path="import" element={<ImportWizard />} />
          <Route path="prices" element={<PriceChart />} />
          <Route path="db" element={<DBTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
