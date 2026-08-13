import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute from "@/routers/PrivateRoute.jsx";
import PublicRoute from "@/routers/PublicRoute.jsx";
import AdminRoute from "@/routers/AdminRoute.jsx";
import Landing from "@/routers/Landing.jsx";
import LoginPage from "@/pages/auth/LoginPage.jsx";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage.jsx";
import AdminLayout from "@/pages/admin/AdminLayout.jsx";
import DashboardPage from "@/pages/admin/DashboardPage.jsx";
import DepartmentListPage from "@/pages/admin/departments/DepartmentListPage.jsx";
import UserListPage from "@/pages/admin/users/UserListPage.jsx";
import UserExcelUploadPage from "@/pages/admin/users/UserExcelUploadPage.jsx";
import ProblemListPage from "@/pages/admin/problems/ProblemListPage.jsx";
import ProblemFormPage from "@/pages/admin/problems/ProblemFormPage.jsx";
import ProblemExcelUploadPage from "@/pages/admin/problems/ProblemExcelUploadPage.jsx";
import StatsListPage from "@/pages/admin/stats/StatsListPage.jsx";
import StatsDetailPage from "@/pages/admin/stats/StatsDetailPage.jsx";
import SolveHomePage from "@/pages/solve/SolveHomePage.jsx";
import RandomSetupPage from "@/pages/solve/RandomSetupPage.jsx";
import RandomPlayPage from "@/pages/solve/RandomPlayPage.jsx";
import RandomResultPage from "@/pages/solve/RandomResultPage.jsx";
import SolveProblemListPage from "@/pages/solve/SolveProblemListPage.jsx";
import ProblemSolvePage from "@/pages/solve/ProblemSolvePage.jsx";
import AttemptHistoryPage from "@/pages/solve/AttemptHistoryPage.jsx";

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
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <Navigate to="/admin/dashboard" replace /> },
              { path: "dashboard", element: <DashboardPage /> },
              { path: "departments", element: <DepartmentListPage /> },
              { path: "users", element: <UserListPage /> },
              { path: "users/excel-upload", element: <UserExcelUploadPage /> },
              { path: "problems", element: <ProblemListPage /> },
              { path: "problems/new", element: <ProblemFormPage /> },
              { path: "problems/:id/edit", element: <ProblemFormPage /> },
              { path: "problems/excel-upload", element: <ProblemExcelUploadPage /> },
              { path: "stats", element: <StatsListPage /> },
              { path: "stats/:id", element: <StatsDetailPage /> },
            ],
          },
        ],
      },
      {
        path: "/solve",
        children: [
          { index: true, element: <SolveHomePage /> },
          { path: "random", element: <RandomSetupPage /> },
          { path: "random/play", element: <RandomPlayPage /> },
          { path: "random/result", element: <RandomResultPage /> },
          { path: "problems", element: <SolveProblemListPage /> },
          { path: "history", element: <AttemptHistoryPage /> },
          { path: ":id", element: <ProblemSolvePage /> },
        ],
      },
    ],
  },
]);
