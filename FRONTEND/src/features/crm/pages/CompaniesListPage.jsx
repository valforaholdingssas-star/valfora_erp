import { useEffect, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchCompanies } from "../../../api/crm.js";

const CompaniesListPage = () => {
  const [result, setResult] = useState({ results: [], count: 0 });
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    const params = { page_size: 50 };
    if (search) params.search = search;
    if (country) params.country = country;
    fetchCompanies(params)
      .then((data) => {
        setResult(data);
        setError("");
      })
      .catch(() => setError("No se pudieron cargar las empresas."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">Empresas</h1>
        <Button as={Link} to="/crm/companies/new" size="sm">
          Nueva empresa
        </Button>
      </div>

      <Form
        className="row g-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div className="col-md-4">
          <Form.Control
            placeholder="Buscar por nombre, industria o ciudad"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <Form.Control
            placeholder="Filtrar por país"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>
        <div className="col-md-2">
          <Button type="submit" variant="outline-secondary" size="sm">
            Filtrar
          </Button>
        </div>
      </Form>

      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <>
          <Table responsive hover size="sm" className="shadow-sm">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Industria</th>
                <th>Sitio web</th>
                <th>Ciudad</th>
                <th>País</th>
                <th>Contactos</th>
              </tr>
            </thead>
            <tbody>
              {(result.results || []).map((company) => (
                <tr key={company.id}>
                  <td>
                    <Link to={`/crm/companies/${company.id}`}>{company.name}</Link>
                  </td>
                  <td>{company.industry || "—"}</td>
                  <td>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer">
                        {company.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{company.city || "—"}</td>
                  <td>{company.country || "—"}</td>
                  <td>{company.contacts_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-muted small mb-0">
            Total: {result.count ?? result.results?.length ?? 0} empresas
          </p>
        </>
      )}
    </div>
  );
};

export default CompaniesListPage;
