import { useEffect, useState } from "react";
import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";

import { createCompany, fetchCompany, updateCompany } from "../../../api/crm.js";

const CompanyFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    address: "",
    city: "",
    country: "",
    employee_count: "",
    annual_revenue: "",
    notes: "",
  });

  useEffect(() => {
    if (!isEdit) return;
    fetchCompany(id)
      .then((company) => {
        setForm({
          name: company.name || "",
          industry: company.industry || "",
          website: company.website || "",
          address: company.address || "",
          city: company.city || "",
          country: company.country || "",
          employee_count: company.employee_count || "",
          annual_revenue: company.annual_revenue || "",
          notes: company.notes || "",
        });
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      employee_count: form.employee_count ? Number(form.employee_count) : null,
      annual_revenue: form.annual_revenue ? Number(form.annual_revenue) : null,
    };
    try {
      if (isEdit) {
        await updateCompany(id, payload);
        navigate(`/crm/companies/${id}`);
      } else {
        const created = await createCompany(payload);
        navigate(`/crm/companies/${created.id}`);
      }
    } catch {
      alert("No se pudo guardar la empresa.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link to="/crm/companies">← Volver a empresas</Link>
      </div>
      <h1 className="h4 mb-4">{isEdit ? "Editar empresa" : "Nueva empresa"}</h1>
      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          <Col md={8}>
            <Form.Group>
              <Form.Label>Nombre</Form.Label>
              <Form.Control name="name" value={form.name} onChange={handleChange} required />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Industria</Form.Label>
              <Form.Control name="industry" value={form.industry} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Sitio web</Form.Label>
              <Form.Control name="website" type="url" value={form.website} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Ciudad</Form.Label>
              <Form.Control name="city" value={form.city} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>País</Form.Label>
              <Form.Control name="country" value={form.country} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Dirección</Form.Label>
              <Form.Control name="address" value={form.address} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Empleados</Form.Label>
              <Form.Control
                name="employee_count"
                type="number"
                min="0"
                value={form.employee_count}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>Ingreso anual</Form.Label>
              <Form.Control
                name="annual_revenue"
                type="number"
                min="0"
                step="0.01"
                value={form.annual_revenue}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Notas</Form.Label>
              <Form.Control as="textarea" rows={3} name="notes" value={form.notes} onChange={handleChange} />
            </Form.Group>
          </Col>
        </Row>
        <div className="mt-4">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default CompanyFormPage;
