import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import { createPayment, fetchInvoices } from "../../../api/finance.js";
import { formatMoney } from "../utils/formatters.js";

const OPEN_STATUSES = ["sent", "partially_paid", "overdue"];

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
    Promise.all(
      OPEN_STATUSES.map((status) =>
        fetchInvoices({ page_size: 100, status }).then((data) => data.results || []).catch(() => [])
      ),
    ).then((chunks) => {
      const map = new Map();
      chunks.flat().forEach((inv) => map.set(inv.id, inv));
      setInvoices(Array.from(map.values()));
    });
  }, []);

  const onInvoiceChange = (invoiceId) => {
    const selected = invoices.find((inv) => String(inv.id) === String(invoiceId));
    setForm((prev) => ({
      ...prev,
      invoice: invoiceId,
      amount: selected ? String(selected.balance_due || selected.total_amount || "") : prev.amount,
    }));
  };

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
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Registrar pago</h1>
          <p className="text-muted mb-0">
            Aplica recaudos a facturas abiertas (enviadas, parciales o vencidas) y reduce el saldo de cartera.
          </p>
        </div>
      </div>
      <div className="app-surface app-surface-padded">
        <Form onSubmit={submit} className="d-grid gap-3">
          <Form.Group>
            <Form.Label>Factura abierta</Form.Label>
            <Form.Select value={form.invoice} onChange={(e) => onInvoiceChange(e.target.value)} required>
              <option value="">Seleccionar factura</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} · {inv.contact_name || "Cliente"} · saldo {formatMoney(inv.balance_due, inv.currency)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Control type="number" min="0" step="0.01" placeholder="Monto" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
          <Form.Control type="date" value={form.payment_date} onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))} required />
          <Form.Select value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}>
            <option value="bank_transfer">Transferencia</option>
            <option value="cash">Efectivo</option>
            <option value="credit_card">Tarjeta</option>
            <option value="check">Cheque</option>
            <option value="other">Otro</option>
          </Form.Select>
          <Form.Control placeholder="Referencia / comprobante" value={form.reference_number} onChange={(e) => setForm((p) => ({ ...p, reference_number: e.target.value }))} />
          <Form.Control as="textarea" rows={3} placeholder="Notas" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Registrar pago"}</Button>
        </Form>
      </div>
    </div>
  );
};

export default PaymentForm;
