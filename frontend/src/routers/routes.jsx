import { createBrowserRouter } from "react-router-dom";
import PrivateRoute from "@/routers/PrivateRoute.jsx";
import PublicRoute from "@/routers/PublicRoute.jsx";
import AdminRoute from "@/routers/AdminRoute.jsx";
import Landing from "@/routers/Landing.jsx";
import LoginPage from "@/pages/auth/LoginPage.jsx";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage.jsx";
import AdminHomePage from "@/pages/admin/AdminHomePage.jsx";
import SolveHomePage from "@/pages/solve/SolveHomePage.jsx";

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: "/login", element: <LoginPage /> }],
  },
  {
    element: <PrivateRoute />,
    children: [
      { index: true, element: <Landing /> },
      { path: "/change-password", element: <ChangePasswordPage /> },
      {
        path: "/admin",
        element: <AdminRoute />,
        children: [{ index: true, element: <AdminHomePage /> }],
      },
      { path: "/solve", element: <SolveHomePage /> },
    ],
  },
]);
