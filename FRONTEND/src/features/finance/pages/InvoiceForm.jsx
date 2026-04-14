import { useEffect, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";

import { createInvoice, fetchInvoice, updateInvoice } from "../../../api/finance.js";
import { fetchContacts, fetchCompanies } from "../../../api/crm.js";
import InvoiceItemsTable from "../components/InvoiceItemsTable.jsx";

const InvoiceForm = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({
    contact: "",
    company: "",
    status: "draft",
    issue_date: "",
    due_date: "",
    tax_rate: "0",
    currency: "COP",
    notes: "",
    items: [{ description: "", quantity: "1", unit_price: "0" }],
  });

  useEffect(() => {
    fetchContacts({ page_size: 100 }).then((d) => setContacts(d.results || [])).catch(() => {});
    fetchCompanies({ page_size: 100 }).then((d) => setCompanies(d.results || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    fetchInvoice(id).then((item) => {
      setForm({
        contact: item.contact || "",
        company: item.company || "",
        status: item.status || "draft",
        issue_date: item.issue_date || "",
        due_date: item.due_date || "",
        tax_rate: item.tax_rate || "0",
        currency: item.currency || "COP",
        notes: item.notes || "",
        items: (item.items || []).map((row) => ({
          description: row.description,
          quantity: row.quantity,
          unit_price: row.unit_price,
        })),
      });
      setLoading(false);
    });
  }, [id, isEdit]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      company: form.company || null,
      tax_rate: Number(form.tax_rate || 0),
      items: form.items.map((row) => ({
        description: row.description,
        quantity: Number(row.quantity || 0),
        unit_price: Number(row.unit_price || 0),
      })),
    };
    try {
      if (isEdit) {
        await updateInvoice(id, payload);
        navigate(`/finance/invoices/${id}`);
      } else {
        const created = await createInvoice(payload);
        navigate(`/finance/invoices/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner animation="border" />;

  return (
    <div>
      <h1 className="h4 mb-3">{isEdit ? "Editar factura" : "Nueva factura"}</h1>
      <Form onSubmit={submit} className="d-grid gap-2">
        <Form.Select value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} required>
          <option value="">Contacto</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </Form.Select>
        <Form.Select value={form.company} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}>
          <option value="">Empresa (opcional)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Form.Select>
        <div className="d-flex gap-2">
          <Form.Control type="date" value={form.issue_date} onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))} required />
          <Form.Control type="date" value={form.due_date} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} required />
          <Form.Control type="number" step="0.01" placeholder="Impuesto %" value={form.tax_rate} onChange={(e) => setForm((p) => ({ ...p, tax_rate: e.target.value }))} />
        </div>
        <Form.Select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
          <option value="draft">Borrador</option>
          <option value="sent">Enviada</option>
          <option value="paid">Pagada</option>
          <option value="partially_paid">Parcial</option>
          <option value="overdue">Vencida</option>
          <option value="cancelled">Cancelada</option>
          <option value="void">Anulada</option>
        </Form.Select>
        <InvoiceItemsTable items={form.items} onChange={(items) => setForm((p) => ({ ...p, items }))} />
        <Form.Control as="textarea" rows={3} value={form.notes} placeholder="Notas" onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
      </Form>
    </div>
  );
};

export default InvoiceForm;
