import PropTypes from "prop-types";
import { Button, Form, Table } from "react-bootstrap";

const InvoiceItemsTable = ({ items, onChange }) => {
  const update = (index, field, value) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  return (
    <>
      <Table size="sm" responsive>
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>Precio unitario</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`item-${index}`}>
              <td>
                <Form.Control
                  value={item.description || ""}
                  onChange={(e) => update(index, "description", e.target.value)}
                  required
                />
              </td>
              <td>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity || ""}
                  onChange={(e) => update(index, "quantity", e.target.value)}
                  required
                />
              </td>
              <td>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unit_price || ""}
                  onChange={(e) => update(index, "unit_price", e.target.value)}
                  required
                />
              </td>
              <td>
                <Button
                  size="sm"
                  variant="outline-danger"
                  onClick={() => onChange(items.filter((_, idx) => idx !== index))}
                >
                  <i className="bi bi-trash" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Button
        type="button"
        size="sm"
        variant="outline-primary"
        onClick={() => onChange([...items, { description: "", quantity: "1", unit_price: "0" }])}
      >
        Añadir ítem
      </Button>
    </>
  );
};

InvoiceItemsTable.propTypes = {
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default InvoiceItemsTable;
