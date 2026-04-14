import PropTypes from "prop-types";
import { Form } from "react-bootstrap";

const AssignmentStrategyForm = ({ value, onChange }) => (
  <Form.Select value={value || "round_robin"} onChange={(e) => onChange(e.target.value)}>
    <option value="round_robin">Round Robin</option>
    <option value="least_busy">Menos ocupado</option>
    <option value="specific_user">Usuario específico</option>
    <option value="by_phone_number">Por número de WhatsApp</option>
  </Form.Select>
);

AssignmentStrategyForm.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

export default AssignmentStrategyForm;
