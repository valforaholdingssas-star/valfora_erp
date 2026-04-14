import PropTypes from "prop-types";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Card } from "react-bootstrap";
import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";
import { formatDealValue } from "../utils/formatters.js";

const DealCard = ({ deal, stageAccent, onCreateActivity }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { stage: deal.stage, deal },
  });

  return (
    <Card
      ref={setNodeRef}
      className={`mb-2 shadow-sm pipeline-card ${isDragging ? "is-dragging" : ""}`}
      style={{
        "--deal-stage-accent": stageAccent || "#3b82f6",
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: isDragging ? "grabbing" : "default",
        opacity: isDragging ? 0.55 : 1,
      }}
    >
      <Card.Body className="py-2 px-2">
        <div className="small fw-medium d-flex align-items-center justify-content-between gap-2 mb-1">
          <span>{deal.title || deal.contact_name || `Deal ${deal.id.slice(0, 8)}`}</span>
          <div className="d-flex align-items-center gap-1">
            {deal.is_stale ? <Badge bg="secondary">stale</Badge> : null}
            <button
              type="button"
              className="btn btn-sm btn-link text-muted p-0 pipeline-drag-handle"
              title="Arrastrar"
              aria-label="Arrastrar deal"
              {...attributes}
              {...listeners}
            >
              <i className="bi bi-grip-vertical" />
            </button>
          </div>
        </div>
        <div className="text-muted small">
          {formatDealValue(deal.value)} {deal.currency}
        </div>
        <div className="text-muted small mb-2">{deal.contact_name}</div>
        <div className="d-flex gap-2">
          <Button as={Link} to={`/crm/deals/${deal.id}`} size="sm" variant="outline-primary">
            Abrir deal
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onCreateActivity?.(deal);
            }}
          >
            Actividad
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
};

DealCard.propTypes = {
  deal: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string,
    contact_name: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    currency: PropTypes.string,
    stage: PropTypes.string,
    is_stale: PropTypes.bool,
  }).isRequired,
  stageAccent: PropTypes.string,
  onCreateActivity: PropTypes.func,
};

export default DealCard;
