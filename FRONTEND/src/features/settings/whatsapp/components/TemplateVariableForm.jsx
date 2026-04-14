import PropTypes from "prop-types";
import { Button, Form } from "react-bootstrap";

const TemplateVariableForm = ({ values, setValues }) => (
  <div>
    {(values || []).map((value, index) => (
      <Form.Control
        key={index}
        className="mb-2"
        placeholder={`Variable {{${index + 1}}}`}
        value={value}
        onChange={(e) => {
          const next = [...values];
          next[index] = e.target.value;
          setValues(next);
        }}
      />
    ))}
    <Button
      size="sm"
      variant="outline-primary"
      onClick={() => setValues([...(values || []), ""])}
    >
      + Variable
    </Button>
  </div>
);

TemplateVariableForm.propTypes = {
  values: PropTypes.arrayOf(PropTypes.string),
  setValues: PropTypes.func.isRequired,
};

export default TemplateVariableForm;
