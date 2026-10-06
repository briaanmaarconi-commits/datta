import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";

import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Layouts
import SuperAdminLayout from "./layouts/SuperAdminLayout";
import AdminLayout from "./layouts/AdminLayout";
import CashierLayout from "./layouts/CashierLayout";
import WaiterLayout from "./layouts/WaiterLayout";
import KitchenLayout from "./layouts/KitchenLayout";

// Pages
import SuperAdminDashboard from "./pages/superadmin/Dashboard";
import SuperAdminClients from "./pages/superadmin/Clients";
import SuperAdminUsers from "./pages/superadmin/Users";
import SuperAdminAnalytics from "./pages/superadmin/Analytics";
import SuperAdminMonitor from "./pages/superadmin/Monitor";
import SuperAdminCash from "./pages/superadmin/Cash";
import SuperAdminPlans from "./pages/superadmin/Plans";
import SuperAdminBilling from "./pages/superadmin/Billing";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminMenu from "./pages/admin/Menu";
import AdminTables from "./pages/admin/Tables";
import AdminStaff from "./pages/admin/Staff";
import AdminMonitor from "./pages/admin/Monitor";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminCashControl from "./pages/admin/CashControl";
import AdminCosts from "./pages/admin/Costs";
import AdminStock from "./pages/admin/Stock";
import AdminAuditLog from "./pages/admin/AuditLog";
import WaiterTables from "./pages/waiter/Tables";
import WaiterOrders from "./pages/waiter/Orders";
import WaiterReservations from "./pages/waiter/Reservations";
import KitchenOrders from "./pages/kitchen/Orders";
import CashierTables from "./pages/cashier/Tables";
import Reservations from "./pages/cashier/Reservations";
import CashierInvoices from "./pages/cashier/Invoices";
import AdminBilling from "./pages/admin/Billing";
import AdminDeliverySettings from "./pages/admin/DeliverySettings";
import CashierExpenses from "./pages/cashier/Expenses";
import ShiftSummary from "./pages/cashier/ShiftSummary";
import CashierMenu from "./pages/cashier/Menu";
import CashierDelivery from "./pages/cashier/Delivery";
import ClientMenu from "./pages/client/Menu";
import MenuView from "./pages/client/MenuView";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Super Admin / Datta */}
          <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminDashboard /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/clients" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminClients /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/billing" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminBilling /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/users" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminUsers /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/monitor" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminMonitor /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/analytics" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminAnalytics /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/cash" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminCash /></SuperAdminLayout></ProtectedRoute>} />
          <Route path="/superadmin/plans" element={<ProtectedRoute allowedRoles={['superadmin']}><SuperAdminLayout><SuperAdminPlans /></SuperAdminLayout></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminDashboard /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/menu" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminMenu /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/tables" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminTables /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/reservations" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><Reservations /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/staff" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminStaff /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/monitor" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminMonitor /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminAnalytics /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/cash" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminCashControl /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/billing" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminBilling /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/costs" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminCosts /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/stock" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminStock /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/delivery" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminDeliverySettings /></AdminLayout></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout><AdminAuditLog /></AdminLayout></ProtectedRoute>} />

          {/* Waiter */}
          <Route path="/waiter" element={<ProtectedRoute allowedRoles={['waiter']}><WaiterLayout><WaiterTables /></WaiterLayout></ProtectedRoute>} />
          <Route path="/waiter/orders" element={<ProtectedRoute allowedRoles={['waiter']}><WaiterLayout><WaiterOrders /></WaiterLayout></ProtectedRoute>} />
          <Route path="/waiter/reservations" element={<ProtectedRoute allowedRoles={['waiter']}><WaiterLayout><WaiterReservations /></WaiterLayout></ProtectedRoute>} />

          {/* Kitchen */}
          <Route path="/kitchen" element={<ProtectedRoute allowedRoles={['kitchen']}><KitchenLayout><KitchenOrders /></KitchenLayout></ProtectedRoute>} />

          {/* Cashier */}
          <Route path="/cashier" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><CashierTables /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/reservations" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><Reservations /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/invoices" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><CashierInvoices /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/expenses" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><CashierExpenses /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/shift" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><ShiftSummary /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/delivery" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><CashierDelivery /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/menu" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><CashierMenu /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/tables-config" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminTables /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/staff" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminStaff /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/monitor" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminMonitor /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/cash" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminCashControl /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/costs" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminCosts /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/stock" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminStock /></CashierLayout></ProtectedRoute>} />
          <Route path="/cashier/audit" element={<ProtectedRoute allowedRoles={['cashier']}><CashierLayout><AdminAuditLog /></CashierLayout></ProtectedRoute>} />

          {/* Client QR Menu - No auth required */}
          <Route path="/menu/:tableId" element={<ClientMenu />} />
          <Route path="/carta/:establishmentId" element={<MenuView />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
