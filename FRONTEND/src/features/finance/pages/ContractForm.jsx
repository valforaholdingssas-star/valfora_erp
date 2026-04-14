import { useEffect, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";

import { createContract, fetchContract, updateContract } from "../../../api/finance.js";
import { fetchContacts, fetchCompanies, fetchDeals } from "../../../api/crm.js";

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
    payment_terms: "custom",
    notes: "",
    payment_schedule: [],
  });

  useEffect(() => {
    fetchContacts({ page_size: 100 }).then((d) => setContacts(d.results || [])).catch(() => {});
    fetchCompanies({ page_size: 100 }).then((d) => setCompanies(d.results || [])).catch(() => {});
    fetchDeals({ page_size: 100 }).then((d) => setDeals(d.results || [])).catch(() => {});
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
        payment_terms: item.payment_terms || "custom",
        notes: item.notes || "",
        payment_schedule: item.payment_schedule || [],
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      total_value: Number(form.total_value || 0),
      company: form.company || null,
      deal: form.deal || null,
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
    <div>
      <h1 className="h4 mb-3">{isEdit ? "Editar contrato" : "Nuevo contrato"}</h1>
      <Form onSubmit={submit} className="d-grid gap-2">
        <Form.Control
          placeholder="Título"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          required
        />
        <Form.Select value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} required>
          <option value="">Contacto</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.first_name} {c.last_name}
            </option>
          ))}
        </Form.Select>
        <Form.Select value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}>
          <option value="">Empresa (opcional)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Form.Select>
        <Form.Select value={form.deal} onChange={(e) => setForm((p) => ({ ...p, deal: e.target.value }))}>
          <option value="">Deal (opcional)</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </Form.Select>
        <div className="d-flex gap-2">
          <Form.Control type="number" placeholder="Valor total" value={form.total_value} onChange={(e) => setForm((p) => ({ ...p, total_value: e.target.value }))} required />
          <Form.Control type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} required />
          <Form.Control type="date" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
        </div>
        <Form.Select value={form.contract_type} onChange={(e) => setForm((p) => ({ ...p, contract_type: e.target.value }))}>
          <option value="service">Servicio</option>
          <option value="product">Producto</option>
          <option value="subscription">Suscripción</option>
          <option value="consulting">Consultoría</option>
          <option value="other">Otro</option>
        </Form.Select>
        <Form.Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
          <option value="draft">Borrador</option>
          <option value="pending_signature">Pendiente firma</option>
          <option value="active">Activo</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
          <option value="expired">Expirado</option>
        </Form.Select>
        <Form.Select value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))}>
          <option value="custom">Custom</option>
          <option value="upfront">Upfront</option>
          <option value="net_15">Net 15</option>
          <option value="net_30">Net 30</option>
          <option value="net_60">Net 60</option>
          <option value="installments">Cuotas</option>
        </Form.Select>
        <Form.Control as="textarea" rows={3} placeholder="Notas" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
      </Form>
    </div>
  );
};

export default ContractForm;
