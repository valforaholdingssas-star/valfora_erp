import { useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import { Navigate, Route, Routes } from "react-router-dom";

import AIConfigPage from "../../features/ai-config/pages/AIConfigPage.jsx";
import CalendarView from "../../features/calendar/pages/CalendarView.jsx";
import ChatView from "../../features/chat/pages/ChatView.jsx";
import CrmDashboardPage from "../../features/crm/pages/CrmDashboardPage.jsx";
import ContactDetailPage from "../../features/crm/pages/ContactDetailPage.jsx";
import ContactFormPage from "../../features/crm/pages/ContactFormPage.jsx";
import ContactsListPage from "../../features/crm/pages/ContactsListPage.jsx";
import CompanyDetailPage from "../../features/crm/pages/CompanyDetailPage.jsx";
import CompanyFormPage from "../../features/crm/pages/CompanyFormPage.jsx";
import CompaniesListPage from "../../features/crm/pages/CompaniesListPage.jsx";
import DealDetailPage from "../../features/crm/pages/DealDetailPage.jsx";
import DealsPipelinePage from "../../features/crm/pages/DealsPipelinePage.jsx";
import DashboardPage from "../../features/dashboard/pages/DashboardPage.jsx";
import ContractDetail from "../../features/finance/pages/ContractDetail.jsx";
import ContractForm from "../../features/finance/pages/ContractForm.jsx";
import ContractsList from "../../features/finance/pages/ContractsList.jsx";
import FinanceDashboard from "../../features/finance/pages/FinanceDashboard.jsx";
import InvoiceDetail from "../../features/finance/pages/InvoiceDetail.jsx";
import InvoiceForm from "../../features/finance/pages/InvoiceForm.jsx";
import InvoicesList from "../../features/finance/pages/InvoicesList.jsx";
import PaymentForm from "../../features/finance/pages/PaymentForm.jsx";
import PaymentsList from "../../features/finance/pages/PaymentsList.jsx";
import ReceivablesView from "../../features/finance/pages/ReceivablesView.jsx";
import UsersManagementPage from "../../features/users/pages/UsersManagementPage.jsx";
import WikiDocumentViewPage from "../../features/wiki/pages/WikiDocumentViewPage.jsx";
import WikiDocumentsPage from "../../features/wiki/pages/WikiDocumentsPage.jsx";
import WhatsAppAccountsPage from "../../features/settings/whatsapp/pages/WhatsAppAccountsPage.jsx";
import WhatsAppPhoneNumbersPage from "../../features/settings/whatsapp/pages/WhatsAppPhoneNumbersPage.jsx";
import WhatsAppTemplatesPage from "../../features/settings/whatsapp/pages/WhatsAppTemplatesPage.jsx";
import WhatsAppTemplateForm from "../../features/settings/whatsapp/pages/WhatsAppTemplateForm.jsx";
import WhatsAppProfilePage from "../../features/settings/whatsapp/pages/WhatsAppProfilePage.jsx";
import WhatsAppAnalyticsPage from "../../features/settings/whatsapp/pages/WhatsAppAnalyticsPage.jsx";
import LeadEngineConfigPage from "../../features/settings/lead-engine/pages/LeadEngineConfigPage.jsx";
import PipelineAutomationPage from "../../features/settings/lead-engine/pages/PipelineAutomationPage.jsx";
import LeadEngineDashboardPage from "../../features/settings/lead-engine/pages/LeadEngineDashboardPage.jsx";
import ActivityLogPage from "../../features/settings/audit/pages/ActivityLogPage.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useI18n } from "../../contexts/I18nContext.jsx";
import Footer from "./Footer.jsx";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";

const MainLayout = () => {
  const { t } = useI18n();
  const { hasModuleAccess } = useAuth();
  const canViewCRM = hasModuleAccess("crm", "view");
  const canViewChat = hasModuleAccess("chat", "view");
  const canViewCalendar = hasModuleAccess("calendar", "view");
  const canViewFinance = hasModuleAccess("finance", "view");
  const canViewUsers = hasModuleAccess("users", "view");
  const canViewWiki = hasModuleAccess("wiki", "view");
  const canViewWhatsapp = hasModuleAccess("whatsapp", "view");
  const canViewAIConfig = hasModuleAccess("ai_config", "view");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 992;
  });

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 992) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="visually-hidden-focusable position-fixed top-0 start-0 z-3 m-2 btn btn-sm btn-outline-secondary shadow"
      >
        {t("a11y.skipToContent")}
      </a>
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="d-flex flex-grow-1">
        <Sidebar collapsed={sidebarCollapsed} />
        <main id="main-content" className="app-main flex-grow-1" tabIndex={-1}>
          <Container fluid>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/crm" element={canViewCRM ? <CrmDashboardPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/contacts" element={canViewCRM ? <ContactsListPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/contacts/new" element={canViewCRM ? <ContactFormPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/contacts/:id/edit" element={canViewCRM ? <ContactFormPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/contacts/:id" element={canViewCRM ? <ContactDetailPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/companies" element={canViewCRM ? <CompaniesListPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/companies/new" element={canViewCRM ? <CompanyFormPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/companies/:id/edit" element={canViewCRM ? <CompanyFormPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/companies/:id" element={canViewCRM ? <CompanyDetailPage /> : <Navigate to="/" replace />} />
              <Route path="/crm/pipeline" element={canViewCRM ? <DealsPipelinePage /> : <Navigate to="/" replace />} />
              <Route path="/crm/deals/:id" element={canViewCRM ? <DealDetailPage /> : <Navigate to="/" replace />} />
              <Route path="/chat" element={canViewChat ? <ChatView /> : <Navigate to="/" replace />} />
              <Route path="/chat/deal/:dealId" element={canViewChat ? <ChatView /> : <Navigate to="/" replace />} />
              <Route path="/chat/contact/:contactId" element={<Navigate to="/chat" replace />} />
              <Route path="/calendar" element={canViewCalendar ? <CalendarView /> : <Navigate to="/" replace />} />
              <Route path="/finance/contracts" element={canViewFinance ? <ContractsList /> : <Navigate to="/" replace />} />
              <Route path="/finance/contracts/new" element={canViewFinance ? <ContractForm /> : <Navigate to="/" replace />} />
              <Route path="/finance/contracts/:id/edit" element={canViewFinance ? <ContractForm /> : <Navigate to="/" replace />} />
              <Route path="/finance/contracts/:id" element={canViewFinance ? <ContractDetail /> : <Navigate to="/" replace />} />
              <Route path="/finance/invoices" element={canViewFinance ? <InvoicesList /> : <Navigate to="/" replace />} />
              <Route path="/finance/invoices/new" element={canViewFinance ? <InvoiceForm /> : <Navigate to="/" replace />} />
              <Route path="/finance/invoices/:id/edit" element={canViewFinance ? <InvoiceForm /> : <Navigate to="/" replace />} />
              <Route path="/finance/invoices/:id" element={canViewFinance ? <InvoiceDetail /> : <Navigate to="/" replace />} />
              <Route path="/finance/payments" element={canViewFinance ? <PaymentsList /> : <Navigate to="/" replace />} />
              <Route path="/finance/payments/new" element={canViewFinance ? <PaymentForm /> : <Navigate to="/" replace />} />
              <Route path="/finance/receivables" element={canViewFinance ? <ReceivablesView /> : <Navigate to="/" replace />} />
              <Route path="/finance/dashboard" element={canViewFinance ? <FinanceDashboard /> : <Navigate to="/" replace />} />
              <Route path="/wiki" element={canViewWiki ? <WikiDocumentsPage /> : <Navigate to="/" replace />} />
              <Route path="/wiki/:slug" element={canViewWiki ? <WikiDocumentViewPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/ai" element={canViewAIConfig ? <AIConfigPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/users" element={canViewUsers ? <UsersManagementPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/activity-log" element={canViewUsers ? <ActivityLogPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/accounts" element={canViewWhatsapp ? <WhatsAppAccountsPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/phone-numbers" element={canViewWhatsapp ? <WhatsAppPhoneNumbersPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/templates" element={canViewWhatsapp ? <WhatsAppTemplatesPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/templates/new" element={canViewWhatsapp ? <WhatsAppTemplateForm /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/templates/:id/edit" element={canViewWhatsapp ? <WhatsAppTemplateForm /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/profile" element={canViewWhatsapp ? <WhatsAppProfilePage /> : <Navigate to="/" replace />} />
              <Route path="/settings/whatsapp/analytics" element={canViewWhatsapp ? <WhatsAppAnalyticsPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/lead-engine" element={canViewCRM ? <LeadEngineConfigPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/lead-engine/pipeline" element={canViewCRM ? <PipelineAutomationPage /> : <Navigate to="/" replace />} />
              <Route path="/settings/lead-engine/dashboard" element={canViewCRM ? <LeadEngineDashboardPage /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Container>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default MainLayout;
