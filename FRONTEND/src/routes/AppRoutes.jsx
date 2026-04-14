import { Route, Routes } from "react-router-dom";

import MainLayout from "../components/layout/MainLayout.jsx";
import LoginPage from "../features/auth/pages/LoginPage.jsx";
import PrivateRoute from "./PrivateRoute.jsx";

const AppRoutes = () => (
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
);

export default AppRoutes;
