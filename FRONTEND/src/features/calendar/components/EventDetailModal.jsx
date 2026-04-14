import PropTypes from "prop-types";
import { Badge, Button, Modal } from "react-bootstrap";
import { Link } from "react-router-dom";

const TYPE_LABELS = {
  activity: "Actividad",
  follow_up: "Seguimiento",
  deal_close: "Cierre de deal",
  whatsapp_follow_up: "Seguimiento WhatsApp",
  stale_alert: "Lead frío",
};

const EventDetailModal = ({ show, eventData, onHide }) => {
  if (!eventData) return null;
  const { title, start, type, url, metadata } = eventData;
  const dealId = metadata?.deal_id;
  const activityType = metadata?.activity_type;
  const isCompleted = metadata?.is_completed;

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Detalle del evento</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-3">
          <div className="small text-muted mb-1">Título</div>
          <div className="fw-semibold">{title}</div>
        </div>
        <div className="mb-3">
          <div className="small text-muted mb-1">Tipo de evento</div>
          <Badge bg="primary">{TYPE_LABELS[type] || type}</Badge>
        </div>
        <div className="mb-3">
          <div className="small text-muted mb-1">Fecha</div>
          <div>{new Date(start).toLocaleString("es-CO")}</div>
        </div>
        {activityType ? (
          <div className="mb-3">
            <div className="small text-muted mb-1">Tipo de actividad</div>
            <div className="text-capitalize">{String(activityType).replace("_", " ")}</div>
          </div>
        ) : null}
        {typeof isCompleted === "boolean" ? (
          <div className="mb-1">
            <div className="small text-muted mb-1">Estado</div>
            <Badge bg={isCompleted ? "success" : "warning"} text={isCompleted ? undefined : "dark"}>
              {isCompleted ? "Completada" : "Pendiente"}
            </Badge>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        {dealId && (type === "whatsapp_follow_up" || type === "stale_alert") ? (
          <Button as={Link} to={`/chat/deal/${dealId}`} onClick={onHide}>
            Abrir chat
          </Button>
        ) : null}
        {dealId ? (
          <Button as={Link} to={`/crm/deals/${dealId}`} variant="outline-primary" onClick={onHide}>
            Ver deal
          </Button>
        ) : null}
        {url ? (
          <Button as={Link} to={url} onClick={onHide}>
            Abrir registro
          </Button>
        ) : null}
        <Button variant="outline-secondary" onClick={onHide}>
          Cerrar
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

EventDetailModal.propTypes = {
  show: PropTypes.bool.isRequired,
  eventData: PropTypes.shape({
    title: PropTypes.string,
    start: PropTypes.string,
    type: PropTypes.string,
    url: PropTypes.string,
    metadata: PropTypes.object,
  }),
  onHide: PropTypes.func.isRequired,
};

export default EventDetailModal;
