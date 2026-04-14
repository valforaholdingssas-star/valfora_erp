import { useEffect, useState } from "react";
import { Button, Card, Form, Table } from "react-bootstrap";

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

  const load = () => {
    fetchWhatsAppPhoneNumbers({ page_size: 100 }).then((d) => setRows(d.results || []));
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
      <h1 className="h4 mb-3">WhatsApp · Números conectados</h1>
      <Card className="mb-3">
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
      <Card>
        <Card.Body>
          <Table size="sm" responsive>
            <thead><tr><th>Número</th><th>Nombre</th><th>Calidad</th><th>Límite</th><th>Estado</th><th>Default</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.display_phone_number}</td>
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
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppPhoneNumbersPage;
