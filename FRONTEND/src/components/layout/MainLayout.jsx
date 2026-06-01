import { Suspense, lazy, useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext.jsx";
import { useI18n } from "../../contexts/I18nContext.jsx";
import Footer from "./Footer.jsx";
import Header from "./Header.jsx";
import Sidebar from "./Sidebar.jsx";

const DashboardPage = lazy(() => import("../../features/dashboard/pages/DashboardPage.jsx"));
const CrmDashboardPage = lazy(() => import("../../features/crm/pages/CrmDashboardPage.jsx"));
const ContactsListPage = lazy(() => import("../../features/crm/pages/ContactsListPage.jsx"));
const ContactFormPage = lazy(() => import("../../features/crm/pages/ContactFormPage.jsx"));
const ContactDetailPage = lazy(() => import("../../features/crm/pages/ContactDetailPage.jsx"));
const CompaniesListPage = lazy(() => import("../../features/crm/pages/CompaniesListPage.jsx"));
const CompanyFormPage = lazy(() => import("../../features/crm/pages/CompanyFormPage.jsx"));
const CompanyDetailPage = lazy(() => import("../../features/crm/pages/CompanyDetailPage.jsx"));
const DealsPipelinePage = lazy(() => import("../../features/crm/pages/DealsPipelinePage.jsx"));
const DealDetailPage = lazy(() => import("../../features/crm/pages/DealDetailPage.jsx"));
const ChatView = lazy(() => import("../../features/chat/pages/ChatView.jsx"));
const CalendarView = lazy(() => import("../../features/calendar/pages/CalendarView.jsx"));
const ContractsList = lazy(() => import("../../features/finance/pages/ContractsList.jsx"));
const ContractForm = lazy(() => import("../../features/finance/pages/ContractForm.jsx"));
const ContractDetail = lazy(() => import("../../features/finance/pages/ContractDetail.jsx"));
const InvoicesList = lazy(() => import("../../features/finance/pages/InvoicesList.jsx"));
const InvoiceForm = lazy(() => import("../../features/finance/pages/InvoiceForm.jsx"));
const InvoiceDetail = lazy(() => import("../../features/finance/pages/InvoiceDetail.jsx"));
const PaymentsList = lazy(() => import("../../features/finance/pages/PaymentsList.jsx"));
const PaymentForm = lazy(() => import("../../features/finance/pages/PaymentForm.jsx"));
const ReceivablesView = lazy(() => import("../../features/finance/pages/ReceivablesView.jsx"));
const FinanceDashboard = lazy(() => import("../../features/finance/pages/FinanceDashboard.jsx"));
const WikiDocumentsPage = lazy(() => import("../../features/wiki/pages/WikiDocumentsPage.jsx"));
const WikiDocumentViewPage = lazy(() => import("../../features/wiki/pages/WikiDocumentViewPage.jsx"));
const AIConfigPage = lazy(() => import("../../features/ai-config/pages/AIConfigPage.jsx"));
const LinkedInHubPage = lazy(() => import("../../features/linkedin/pages/LinkedInHubPage.jsx"));
const LinkedInDashboard = lazy(() => import("../../features/linkedin/pages/LinkedInDashboard.jsx"));
const ProspectsList = lazy(() => import("../../features/linkedin/pages/ProspectsList.jsx"));
const ProspectDetail = lazy(() => import("../../features/linkedin/pages/ProspectDetail.jsx"));
const SavedSearches = lazy(() => import("../../features/linkedin/pages/SavedSearches.jsx"));
const LinkedInInbox = lazy(() => import("../../features/linkedin/pages/LinkedInInbox.jsx"));
const InvitationsList = lazy(() => import("../../features/linkedin/pages/InvitationsList.jsx"));
const TemplatesManager = lazy(() => import("../../features/linkedin/pages/TemplatesManager.jsx"));
const LinkedInPipelinePage = lazy(() => import("../../features/linkedin/pages/LinkedInPipelinePage.jsx"));
const UsersManagementPage = lazy(() => import("../../features/users/pages/UsersManagementPage.jsx"));
const ActivityLogPage = lazy(() => import("../../features/settings/audit/pages/ActivityLogPage.jsx"));
const WhatsAppAccountsPage = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppAccountsPage.jsx"));
const WhatsAppPhoneNumbersPage = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppPhoneNumbersPage.jsx"));
const WhatsAppTemplatesPage = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppTemplatesPage.jsx"));
const WhatsAppTemplateForm = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppTemplateForm.jsx"));
const WhatsAppProfilePage = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppProfilePage.jsx"));
const WhatsAppAnalyticsPage = lazy(() => import("../../features/settings/whatsapp/pages/WhatsAppAnalyticsPage.jsx"));
const LeadEngineConfigPage = lazy(() => import("../../features/settings/lead-engine/pages/LeadEngineConfigPage.jsx"));
const PipelineAutomationPage = lazy(() => import("../../features/settings/lead-engine/pages/PipelineAutomationPage.jsx"));
const LeadEngineDashboardPage = lazy(() => import("../../features/settings/lead-engine/pages/LeadEngineDashboardPage.jsx"));

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
  const canViewLinkedIn = hasModuleAccess("linkedin", "view");
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
      <div className="app-body">
        <Sidebar collapsed={sidebarCollapsed} />
        <main id="main-content" className="app-main" tabIndex={-1}>
          <Container fluid className="app-main-container">
            <Suspense fallback={<div className="app-route-loader">Cargando módulo…</div>}>
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
                <Route path="/settings/companies" element={canViewCRM ? <CompaniesListPage /> : <Navigate to="/" replace />} />
                <Route path="/settings/linkedin" element={canViewLinkedIn ? <LinkedInHubPage /> : <Navigate to="/" replace />} />
                <Route path="/linkedin" element={canViewLinkedIn ? <LinkedInDashboard /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/prospects" element={canViewLinkedIn ? <ProspectsList /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/prospects/:id" element={canViewLinkedIn ? <ProspectDetail /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/inbox" element={canViewLinkedIn ? <LinkedInInbox /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/pipeline" element={canViewLinkedIn ? <LinkedInPipelinePage /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/searches" element={canViewLinkedIn ? <SavedSearches /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/invitations" element={canViewLinkedIn ? <InvitationsList /> : <Navigate to="/" replace />} />
                <Route path="/linkedin/templates" element={canViewLinkedIn ? <TemplatesManager /> : <Navigate to="/" replace />} />
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
            </Suspense>
          </Container>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default MainLayout;
