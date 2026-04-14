import { useCallback, useEffect, useState } from "react";
import { Button, Nav, Spinner, Tab, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import { fetchCompany, fetchContacts, fetchDeals, fetchDocuments } from "../../../api/crm.js";
import { formatDealValue } from "../utils/formatters.js";

const CompanyDetailPage = () => {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [contacts, setContacts] = useState({ results: [] });
  const [deals, setDeals] = useState({ results: [] });
  const [documents, setDocuments] = useState({ results: [] });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [companyData, contactsData, dealsData, docsData] = await Promise.all([
      fetchCompany(id),
      fetchContacts({ company: id, page_size: 100 }),
      fetchDeals({ company: id, page_size: 100 }),
      fetchDocuments({ company: id, page_size: 100 }),
    ]);
    setCompany(companyData);
    setContacts(contactsData);
    setDeals(dealsData);
    setDocuments(docsData);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reload]);

  if (loading || !company) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="mb-2">
        <Link to="/crm/companies">← Empresas</Link>
      </div>
      <div className="d-flex justify-content-between align-items-start mb-3 app-page-header">
        <div>
          <h1 className="h4 mb-1">{company.name}</h1>
          <p className="text-muted mb-0">{company.industry || "Sin industria"}</p>
        </div>
        <Button as={Link} to={`/crm/companies/${company.id}/edit`} variant="outline-primary" size="sm">
          Editar
        </Button>
      </div>

      <Tab.Container defaultActiveKey="info">
        <Nav variant="tabs" className="mb-3">
          <Nav.Item>
            <Nav.Link eventKey="info">Info general</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="contacts">Contactos asociados</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="deals">Deals asociados</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="documents">Documentos</Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey="info">
            <p><strong>Ciudad:</strong> {company.city || "—"}</p>
            <p><strong>País:</strong> {company.country || "—"}</p>
            <p><strong>Sitio web:</strong> {company.website || "—"}</p>
            <p><strong>Dirección:</strong> {company.address || "—"}</p>
            <p><strong>Empleados:</strong> {company.employee_count || "—"}</p>
            <p><strong>Ingreso anual:</strong> {company.annual_revenue || "—"}</p>
            <p className="mb-0"><strong>Notas:</strong> {company.notes || "—"}</p>
          </Tab.Pane>
          <Tab.Pane eventKey="contacts">
            <Table size="sm" responsive>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Etapa</th>
                </tr>
              </thead>
              <tbody>
                {contacts.results?.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      <Link to={`/crm/contacts/${contact.id}`}>
                        {contact.first_name} {contact.last_name}
                      </Link>
                    </td>
                    <td>{contact.email}</td>
                    <td>{contact.lifecycle_stage}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
          <Tab.Pane eventKey="deals">
            <Table size="sm" responsive>
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Etapa</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {deals.results?.map((deal) => (
                  <tr key={deal.id}>
                    <td>{deal.title}</td>
                    <td>{deal.stage}</td>
                    <td>{formatDealValue(deal.value)} {deal.currency}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
          <Tab.Pane eventKey="documents">
            <Table size="sm" responsive>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {documents.results?.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.name}</td>
                    <td>{doc.file_type || "—"}</td>
                    <td>{doc.file_size || 0} bytes</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default CompanyDetailPage;
