import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import { fetchInvoices } from "../../../api/finance.js";
import { createPayment } from "../../../api/finance.js";

const PaymentForm = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    invoice: "",
    amount: "",
    payment_date: "",
    payment_method: "bank_transfer",
    reference_number: "",
    notes: "",
  });

  useEffect(() => {
    fetchInvoices({ page_size: 100, status: "sent" })
      .then((data) => setInvoices(data.results || []))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createPayment({
        ...form,
        amount: Number(form.amount || 0),
      });
      navigate("/finance/payments");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="h4 mb-3">Registrar pago</h1>
      <Form onSubmit={submit} className="d-grid gap-2">
        <Form.Select value={form.invoice} onChange={(e) => setForm((p) => ({ ...p, invoice: e.target.value }))} required>
          <option value="">Factura</option>
          {invoices.map((inv) => (
            <option key={inv.id} value={inv.id}>
              {inv.invoice_number} · saldo {inv.balance_due}
            </option>
          ))}
        </Form.Select>
        <Form.Control type="number" min="0" step="0.01" placeholder="Monto" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
        <Form.Control type="date" value={form.payment_date} onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))} required />
        <Form.Select value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}>
          <option value="bank_transfer">Transferencia</option>
          <option value="cash">Efectivo</option>
          <option value="credit_card">Tarjeta</option>
          <option value="check">Cheque</option>
          <option value="other">Otro</option>
        </Form.Select>
        <Form.Control placeholder="Referencia" value={form.reference_number} onChange={(e) => setForm((p) => ({ ...p, reference_number: e.target.value }))} />
        <Form.Control as="textarea" rows={3} placeholder="Notas" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
      </Form>
    </div>
  );
};

export default PaymentForm;
