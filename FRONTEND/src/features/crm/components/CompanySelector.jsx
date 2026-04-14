import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import { Button, Form, ListGroup, Modal } from "react-bootstrap";

import { createCompany, fetchCompanies, fetchCompany } from "../../../api/crm.js";

const EMPTY_FORM = {
  name: "",
  industry: "",
  website: "",
  city: "",
  country: "",
  address: "",
  notes: "",
};

const CompanySelector = ({ value, onChange, initialLabel, disabled }) => {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(initialLabel || "");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const displayValue = useMemo(() => {
    if (query) return query;
    return selectedLabel;
  }, [query, selectedLabel]);

  useEffect(() => {
    if (!value || selectedLabel) return;
    fetchCompany(value)
      .then((data) => setSelectedLabel(data.name || ""))
      .catch(() => {});
  }, [value, selectedLabel]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setOptions([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetchCompanies({ search: trimmed, page_size: 10 })
        .then((data) => setOptions(data.results || []))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const selectCompany = (company) => {
    onChange(company.id);
    setSelectedLabel(company.name || "");
    setQuery("");
    setOptions([]);
  };

  const createInlineCompany = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createCompany({
        name: form.name.trim(),
        industry: form.industry.trim(),
        website: form.website.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
      });
      selectCompany(created);
      setShowModal(false);
      setForm(EMPTY_FORM);
    } catch {
      // ignore: el formulario padre ya maneja error global al guardar contacto
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="d-flex gap-2">
        <div className="flex-grow-1 position-relative">
          <Form.Control
            value={displayValue}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) {
                onChange("");
                setSelectedLabel("");
              }
            }}
            placeholder="Buscar empresa"
            disabled={disabled}
          />
          {!!query && (
            <ListGroup
              className="position-absolute w-100 shadow-sm"
              style={{ zIndex: 20, maxHeight: "240px", overflowY: "auto" }}
            >
              {loading && <ListGroup.Item className="small text-muted">Buscando...</ListGroup.Item>}
              {!loading && options.length === 0 && (
                <ListGroup.Item className="small text-muted">Sin resultados</ListGroup.Item>
              )}
              {!loading &&
                options.map((company) => (
                  <ListGroup.Item
                    key={company.id}
                    action
                    onClick={() => selectCompany(company)}
                    className="small"
                  >
                    <div className="fw-semibold">{company.name}</div>
                    <div className="text-muted">{company.industry || company.city || "—"}</div>
                  </ListGroup.Item>
                ))}
            </ListGroup>
          )}
        </div>
        <Button
          type="button"
          variant="outline-primary"
          onClick={() => setShowModal(true)}
          disabled={disabled}
          aria-label="Crear empresa"
        >
          <i className="bi bi-plus-lg" />
        </Button>
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={createInlineCompany}>
          <Modal.Header closeButton>
            <Modal.Title>Nueva empresa</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-2">
            <Form.Control
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre"
              required
            />
            <Form.Control
              value={form.industry}
              onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))}
              placeholder="Industria"
            />
            <Form.Control
              value={form.website}
              onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              placeholder="Sitio web"
              type="url"
            />
            <div className="d-flex gap-2">
              <Form.Control
                value={form.city}
                onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="Ciudad"
              />
              <Form.Control
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="País"
              />
            </div>
            <Form.Control
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Dirección"
            />
            <Form.Control
              as="textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas"
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowModal(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Crear empresa"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

CompanySelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  initialLabel: PropTypes.string,
  disabled: PropTypes.bool,
};

export default CompanySelector;
