import PropTypes from "prop-types";
import { Button, InputGroup, Form } from "react-bootstrap";

const WebhookUrlDisplay = ({ url }) => (
  <InputGroup size="sm">
    <Form.Control value={url} readOnly />
    <Button
      variant="outline-secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(url);
      }}
    >
      Copiar
    </Button>
  </InputGroup>
);

WebhookUrlDisplay.propTypes = {
  url: PropTypes.string.isRequired,
};

export default WebhookUrlDisplay;
