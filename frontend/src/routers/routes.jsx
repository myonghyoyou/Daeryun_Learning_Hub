import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute from "@/routers/PrivateRoute.jsx";
import PublicRoute from "@/routers/PublicRoute.jsx";
import AdminRoute from "@/routers/AdminRoute.jsx";
import Landing from "@/routers/Landing.jsx";
import LoginPage from "@/pages/auth/LoginPage.jsx";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage.jsx";
import AdminLayout from "@/pages/admin/AdminLayout.jsx";
import DepartmentListPage from "@/pages/admin/departments/DepartmentListPage.jsx";
import UserListPage from "@/pages/admin/users/UserListPage.jsx";
import UserExcelUploadPage from "@/pages/admin/users/UserExcelUploadPage.jsx";
import ProblemListPage from "@/pages/admin/problems/ProblemListPage.jsx";
import ProblemFormPage from "@/pages/admin/problems/ProblemFormPage.jsx";
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
        children: [
          {
            element: <AdminLayout />,
            children: [
              // 임시 값: Plan 5 Task 5가 관리자 대시보드 화면을 추가하면서
              // /admin/departments 대신 /admin/dashboard로 교체한다. 그 전까지는
              // 총괄 관리자 전용 API인 /admin/departments로 곧장 리다이렉트하므로
              // 부서 관리자가 PC로 로그인하면 403을 만난다(Plan 5까지 마쳐야 해소).
              { index: true, element: <Navigate to="/admin/departments" replace /> },
              { path: "departments", element: <DepartmentListPage /> },
              { path: "users", element: <UserListPage /> },
              { path: "users/excel-upload", element: <UserExcelUploadPage /> },
              { path: "problems", element: <ProblemListPage /> },
              { path: "problems/new", element: <ProblemFormPage /> },
              { path: "problems/:id/edit", element: <ProblemFormPage /> },
            ],
          },
        ],
      },
      { path: "/solve", element: <SolveHomePage /> },
    ],
  },
]);
