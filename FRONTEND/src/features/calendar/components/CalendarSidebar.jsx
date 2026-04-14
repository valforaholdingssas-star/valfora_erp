import PropTypes from "prop-types";
import { Form } from "react-bootstrap";

const OPTIONS = [
  { key: "activity", label: "Actividades" },
  { key: "deal_close", label: "Cierres de deals" },
  { key: "follow_up", label: "Seguimientos" },
  { key: "whatsapp_follow_up", label: "Follow-up WhatsApp" },
  { key: "stale_alert", label: "Leads fríos" },
  { key: "overdue", label: "Vencidos" },
];

const CalendarSidebar = ({ selectedTypes, onChangeTypes, users, assignedTo, onChangeAssignedTo }) => (
  <aside className="app-chat-sidebar p-3">
    <h2 className="h6 mb-3">Filtros</h2>
    <div className="mb-3">
      <div className="small text-muted mb-2">Tipo de evento</div>
      <div className="d-grid gap-1">
        {OPTIONS.map((opt) => (
          <Form.Check
            key={opt.key}
            type="checkbox"
            id={`calendar-type-${opt.key}`}
            label={opt.label}
            checked={selectedTypes.includes(opt.key)}
            onChange={(e) => {
              if (e.target.checked) onChangeTypes([...selectedTypes, opt.key]);
              else onChangeTypes(selectedTypes.filter((x) => x !== opt.key));
            }}
          />
        ))}
      </div>
    </div>
    <div>
      <Form.Label className="small text-muted">Responsable</Form.Label>
      <Form.Select
        size="sm"
        value={assignedTo}
        onChange={(e) => onChangeAssignedTo(e.target.value)}
      >
        <option value="">Todos</option>
        {(users || []).map((user) => (
          <option key={user.id} value={user.id}>
            {user.first_name || user.email}
          </option>
        ))}
      </Form.Select>
    </div>
  </aside>
);

CalendarSidebar.propTypes = {
  selectedTypes: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChangeTypes: PropTypes.func.isRequired,
  users: PropTypes.arrayOf(PropTypes.object),
  assignedTo: PropTypes.string.isRequired,
  onChangeAssignedTo: PropTypes.func.isRequired,
};

export default CalendarSidebar;
