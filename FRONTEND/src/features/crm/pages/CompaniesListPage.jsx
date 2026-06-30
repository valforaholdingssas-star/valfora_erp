import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchCompanies } from "../../../api/crm.js";

const getInitials = (value) =>
  String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";

const CompaniesListPage = () => {
  const [result, setResult] = useState({ results: [], count: 0 });
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    const params = { page_size: 50 };
    if (search) params.search = search;
    if (country) params.country = country;
    fetchCompanies(params)
      .then((data) => setResult(data))
      .catch(() => setError("No se pudieron cargar las empresas."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companies = result.results || [];
  const industries = useMemo(
    () => [...new Set(companies.map((company) => company.industry).filter(Boolean))].sort(),
    [companies],
  );

  const displayedCompanies = useMemo(() => {
    if (!industry) return companies;
    return companies.filter((company) => company.industry === industry);
  }, [companies, industry]);

  const totalContacts = displayedCompanies.reduce((acc, company) => acc + (company.contacts_count || 0), 0);
  const totalCountries = new Set(displayedCompanies.map((company) => company.country).filter(Boolean)).size;
  const totalCities = new Set(displayedCompanies.map((company) => company.city).filter(Boolean)).size;

  return (
    <div className="crm-page-shell">
      <section className="crm-page-header">
        <div>
          <div className="crm-breadcrumb">
            <span>CRM</span>
            <i className="bi bi-chevron-right" />
            <span>Empresas</span>
          </div>
          <h1>Empresas</h1>
          <p>Directorio de clientes y organizaciones vinculadas al pipeline.</p>
        </div>
        <div className="crm-page-actions">
          <Button variant="light" className="crm-secondary-button">
            <i className="bi bi-download" /> Exportar
          </Button>
          <Button as={Link} to="/crm/companies/new" variant="primary">
            + Nueva empresa
          </Button>
        </div>
      </section>

      <section className="crm-stat-strip">
        <article className="crm-stat-card">
          <span className="crm-stat-icon crm-stat-icon-navy">
            <i className="bi bi-buildings" />
          </span>
          <div>
            <strong>{displayedCompanies.length}</strong>
            <small>empresas</small>
          </div>
        </article>
        <article className="crm-stat-card">
          <span className="crm-stat-icon crm-stat-icon-navy">
            <i className="bi bi-people" />
          </span>
          <div>
            <strong>{totalContacts}</strong>
            <small>contactos vinculados</small>
          </div>
        </article>
        <article className="crm-stat-card">
          <span className="crm-stat-icon crm-stat-icon-gold">
            <i className="bi bi-diagram-3" />
          </span>
          <div>
            <strong>{industries.length}</strong>
            <small>industrias activas</small>
          </div>
        </article>
        <article className="crm-stat-card">
          <span className="crm-stat-icon crm-stat-icon-success">
            <i className="bi bi-geo-alt" />
          </span>
          <div>
            <strong>{Math.max(totalCountries, totalCities)}</strong>
            <small>{totalCountries > 0 ? "paises" : "ciudades"} cubiertos</small>
          </div>
        </article>
      </section>

      <Form
        className="crm-filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div className="crm-filter-search">
          <i className="bi bi-search" />
          <Form.Control
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, industria o ciudad..."
          />
        </div>
        <Form.Control
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Filtrar por pais"
        />
        <Form.Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
          <option value="">Todas las industrias</option>
          {industries.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Form.Select>
        <Button type="submit" variant="dark" className="crm-dark-button">
          <i className="bi bi-sliders" /> Filtrar
        </Button>
        <div className="crm-filter-total">
          <span>{displayedCompanies.length}</span> empresas
        </div>
      </Form>

      {error ? <div className="crm-empty-state text-danger">{error}</div> : null}

      {loading ? (
        <div className="crm-empty-state">
          <Spinner animation="border" />
        </div>
      ) : (
        <section className="crm-table-panel">
          <div className="crm-data-table-wrap">
            <Table responsive className="crm-data-table crm-companies-table mb-0">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Industria</th>
                  <th>Sitio web</th>
                  <th>Ciudad</th>
                  <th>Pais</th>
                  <th>Contactos</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      No hay empresas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  displayedCompanies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <div className="crm-company-cell">
                          <span className="crm-company-avatar">{getInitials(company.name)}</span>
                          <div>
                            <Link to={`/crm/companies/${company.id}`} className="crm-row-title">
                              {company.name}
                            </Link>
                            <small>
                              {company.city || "Sin ciudad"} · {company.country || "Sin pais"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="crm-industry-chip">
                          <i className="bi bi-layers" />
                          {company.industry || "Sin industria"}
                        </span>
                      </td>
                      <td>
                        {company.website ? (
                          <a href={company.website} target="_blank" rel="noreferrer" className="crm-mono-link">
                            {company.website.replace(/^https?:\/\//, "")}
                            <i className="bi bi-box-arrow-up-right" />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{company.city || "—"}</td>
                      <td>{company.country || "—"}</td>
                      <td>
                        <span className="crm-count-pill">{company.contacts_count ?? 0}</span>
                      </td>
                      <td className="text-end">
                        <div className="crm-row-actions">
                          <Button as={Link} to={`/crm/companies/${company.id}`} variant="light" className="crm-icon-button">
                            <i className="bi bi-eye" />
                          </Button>
                          <Button as={Link} to={`/crm/companies/${company.id}/edit`} variant="light" className="crm-icon-button">
                            <i className="bi bi-pencil" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          <div className="crm-table-footer">
            <span>
              Mostrando <strong>{displayedCompanies.length}</strong> de <strong>{result.count ?? displayedCompanies.length}</strong> empresas
            </span>
          </div>
        </section>
      )}
    </div>
  );
};

export default CompaniesListPage;
