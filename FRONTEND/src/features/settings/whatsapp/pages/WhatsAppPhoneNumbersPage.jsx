import { useEffect, useState } from "react";
import { Badge, Button, Card, Form, Table } from "react-bootstrap";

import {
  fetchWhatsAppAccounts,
  fetchWhatsAppPhoneNumbers,
  syncAccountPhoneNumbers,
  updateWhatsAppPhoneNumber,
} from "../../../../api/whatsapp.js";
import QualityRatingBadge from "../components/QualityRatingBadge.jsx";

const WhatsAppPhoneNumbersPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [rows, setRows] = useState([]);
  const [lineNames, setLineNames] = useState({});

  const load = () => {
    fetchWhatsAppPhoneNumbers({ page_size: 100 }).then((d) => {
      const nextRows = d.results || [];
      setRows(nextRows);
      setLineNames(
        nextRows.reduce((acc, row) => {
          acc[row.id] = row.internal_name || "";
          return acc;
        }, {}),
      );
    });
  };

  useEffect(() => {
    fetchWhatsAppAccounts({ page_size: 100 }).then((d) => {
      const list = d.results || [];
      setAccounts(list);
      setAccountId(list[0]?.id || "");
    });
    load();
  }, []);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">WhatsApp</div>
          <h1 className="h3 mb-1">Números conectados</h1>
          <p className="text-muted mb-0">Administra sincronización, calidad y número por defecto por cuenta.</p>
        </div>
        <div className="app-inline-stat">
          <span className="app-inline-stat-label">Números cargados</span>
          <strong>{rows.length}</strong>
        </div>
      </div>
      <Card className="mb-4 app-section-card">
        <Card.Body className="d-flex gap-2 align-items-center">
          <Form.Select style={{ maxWidth: 360 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Selecciona cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Form.Select>
          <Button variant="outline-primary" onClick={async () => {
            if (!accountId) return;
            await syncAccountPhoneNumbers(accountId);
            setTimeout(load, 1000);
          }}>Sincronizar números</Button>
        </Card.Body>
      </Card>
      <Card className="app-section-card">
        <Card.Body>
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Inventario</div>
              <h2 className="h6 mb-0">Números disponibles</h2>
            </div>
            <Badge className="app-badge-soft">{rows.length}</Badge>
          </div>
          <div className="app-table-shell">
            <Table size="sm" responsive className="mb-0 app-table-clean">
            <thead><tr><th>Número</th><th>Nombre interno</th><th>Nombre verificado</th><th>Calidad</th><th>Límite</th><th>Estado</th><th>Default</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.display_phone_number}</td>
                  <td style={{ minWidth: 220 }}>
                    <Form.Control
                      size="sm"
                      value={lineNames[r.id] ?? ""}
                      placeholder="Ej. Ventas Medellín"
                      onChange={(e) => setLineNames((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={async (e) => {
                        const nextValue = e.target.value.trim();
                        if ((r.internal_name || "") === nextValue) return;
                        await updateWhatsAppPhoneNumber(r.id, { internal_name: nextValue });
                        load();
                      }}
                    />
                  </td>
                  <td>{r.verified_name || "—"}</td>
                  <td><QualityRatingBadge value={r.quality_rating} /></td>
                  <td>{r.messaging_limit}</td>
                  <td>{r.status}</td>
                  <td>
                    <Form.Check
                      type="switch"
                      checked={Boolean(r.is_default)}
                      onChange={async (e) => {
                        await updateWhatsAppPhoneNumber(r.id, { is_default: e.target.checked });
                        load();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppPhoneNumbersPage;
