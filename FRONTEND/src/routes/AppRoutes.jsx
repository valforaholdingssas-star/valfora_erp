import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import PrivateRoute from "./PrivateRoute.jsx";

const MainLayout = lazy(() => import("../components/layout/MainLayout.jsx"));
const LoginPage = lazy(() => import("../features/auth/pages/LoginPage.jsx"));

const AppRoutes = () => (
  <Suspense fallback={<div className="app-route-loader app-route-loader-root">Cargando…</div>}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      />
    </Routes>
  </Suspense>
);

export default AppRoutes;
