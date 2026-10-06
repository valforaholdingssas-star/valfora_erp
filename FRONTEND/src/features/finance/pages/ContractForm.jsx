import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";

import { createContract, fetchContract, updateContract } from "../../../api/finance.js";
import { fetchContacts, fetchCompanies, fetchDeals } from "../../../api/crm.js";

const emptyInstallment = () => ({ due_date: "", amount: "", description: "" });

const ContractForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [form, setForm] = useState({
    title: "",
    contact: "",
    company: "",
    deal: "",
    contract_type: "service",
    status: "draft",
    total_value: "",
    currency: "COP",
    start_date: "",
    end_date: "",
    payment_terms: "installments",
    notes: "",
    payment_schedule: [emptyInstallment()],
  });

  useEffect(() => {
    fetchContacts({ page_size: 200 }).then((d) => setContacts(d.results || [])).catch(() => {});
    fetchCompanies({ page_size: 200 }).then((d) => setCompanies(d.results || [])).catch(() => {});
    fetchDeals({ page_size: 200 }).then((d) => setDeals(d.results || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    fetchContract(id).then((item) => {
      setForm({
        title: item.title || "",
        contact: item.contact || "",
        company: item.company || "",
        deal: item.deal || "",
        contract_type: item.contract_type || "service",
        status: item.status || "draft",
        total_value: item.total_value || "",
        currency: item.currency || "COP",
        start_date: item.start_date || "",
        end_date: item.end_date || "",
        payment_terms: item.payment_terms || "installments",
        notes: item.notes || "",
        payment_schedule: (item.payment_schedule || []).length
          ? item.payment_schedule
          : [emptyInstallment()],
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  const dealsForContact = useMemo(() => {
    if (!form.contact) return deals;
    return deals.filter((deal) => String(deal.contact) === String(form.contact) || !deal.contact);
  }, [deals, form.contact]);

  const updateScheduleRow = (index, field, value) => {
    setForm((prev) => {
      const next = [...(prev.payment_schedule || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, payment_schedule: next };
    });
  };

  const addScheduleRow = () => {
    setForm((prev) => ({
      ...prev,
      payment_schedule: [...(prev.payment_schedule || []), emptyInstallment()],
    }));
  };

  const removeScheduleRow = (index) => {
    setForm((prev) => ({
      ...prev,
      payment_schedule: (prev.payment_schedule || []).filter((_, i) => i !== index),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const schedule = (form.payment_schedule || [])
      .filter((row) => row.due_date || row.amount || row.description)
      .map((row) => ({
        due_date: row.due_date || null,
        amount: Number(row.amount || 0),
        description: row.description || "",
      }));
    const payload = {
      ...form,
      total_value: Number(form.total_value || 0),
      company: form.company || null,
      deal: form.deal || null,
      payment_schedule: schedule,
    };
    try {
      if (isEdit) {
        await updateContract(id, payload);
        navigate(`/finance/contracts/${id}`);
      } else {
        const created = await createContract(payload);
        navigate(`/finance/contracts/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">{isEdit ? "Editar contrato" : "Nuevo contrato"}</h1>
          <p className="text-muted mb-0">
            Asocia un cliente, define el valor del acuerdo y programa los pagos esperados de cartera.
          </p>
        </div>
      </div>
      <div className="app-surface app-surface-padded">
        <Form onSubmit={submit} className="d-grid gap-3">
          <Form.Group>
            <Form.Label>Título del contrato</Form.Label>
            <Form.Control
              placeholder="Ej. Mentoría comercial Q1"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              required
            />
          </Form.Group>
          <div className="row g-3">
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Cliente (contacto)</Form.Label>
                <Form.Select value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value, deal: "" }))} required>
                  <option value="">Seleccionar cliente</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Empresa</Form.Label>
                <Form.Select value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}>
                  <option value="">Sin empresa</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <Form.Group>
            <Form.Label>Deal CRM (opcional)</Form.Label>
            <Form.Select value={form.deal} onChange={(e) => setForm((p) => ({ ...p, deal: e.target.value }))}>
              <option value="">Sin deal</option>
              {dealsForContact.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </Form.Select>
          </Form.Group>
          <div className="row g-3">
            <div className="col-md-4">
              <Form.Group>
                <Form.Label>Valor del contrato</Form.Label>
                <Form.Control type="number" min="0" step="0.01" value={form.total_value} onChange={(e) => setForm((p) => ({ ...p, total_value: e.target.value }))} required />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group>
                <Form.Label>Inicio</Form.Label>
                <Form.Control type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} required />
              </Form.Group>
            </div>
            <div className="col-md-4">
              <Form.Group>
                <Form.Label>Fin</Form.Label>
                <Form.Control type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
              </Form.Group>
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-4">
              <Form.Select value={form.contract_type} onChange={(e) => setForm((p) => ({ ...p, contract_type: e.target.value }))}>
                <option value="service">Servicio</option>
                <option value="product">Producto</option>
                <option value="subscription">Suscripción</option>
                <option value="consulting">Consultoría</option>
                <option value="other">Otro</option>
              </Form.Select>
            </div>
            <div className="col-md-4">
              <Form.Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="draft">Borrador</option>
                <option value="pending_signature">Pendiente firma</option>
                <option value="active">Activo</option>
                <option value="completed">Completado</option>
                <option value="cancelled">Cancelado</option>
                <option value="expired">Expirado</option>
              </Form.Select>
            </div>
            <div className="col-md-4">
              <Form.Select value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}>
                <option value="installments">Cuotas</option>
                <option value="upfront">Pago anticipado</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="net_60">Net 60</option>
                <option value="custom">Personalizado</option>
              </Form.Select>
            </div>
          </div>

          <div className="border rounded p-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <div className="app-eyebrow">Cartera</div>
                <strong>Cronograma de pagos</strong>
              </div>
              <Button type="button" size="sm" variant="outline-primary" onClick={addScheduleRow}>
                Agregar cuota
              </Button>
            </div>
            <div className="d-grid gap-2">
              {(form.payment_schedule || []).map((row, index) => (
                <div className="row g-2 align-items-end" key={`schedule-${index}`}>
                  <div className="col-md-3">
                    <Form.Label className="small mb-1">Fecha</Form.Label>
                    <Form.Control type="date" value={row.due_date || ""} onChange={(e) => updateScheduleRow(index, "due_date", e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <Form.Label className="small mb-1">Monto</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={row.amount || ""} onChange={(e) => updateScheduleRow(index, "amount", e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <Form.Label className="small mb-1">Descripción</Form.Label>
                    <Form.Control value={row.description || ""} onChange={(e) => updateScheduleRow(index, "description", e.target.value)} placeholder="Cuota 1" />
                  </div>
                  <div className="col-md-2">
                    <Button type="button" variant="outline-danger" size="sm" className="w-100" onClick={() => removeScheduleRow(index)}>
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Form.Control as="textarea" rows={3} placeholder="Notas" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar contrato"}</Button>
        </Form>
      </div>
    </div>
  );
};

export default ContractForm;
