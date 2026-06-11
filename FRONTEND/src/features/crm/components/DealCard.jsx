import PropTypes from "prop-types";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Card } from "react-bootstrap";
import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";
import { formatDealDisplayNumber, formatDealValue, getAssigneeChipStyle } from "../utils/formatters.js";

const DealCard = ({ deal, stageAccent, onCreateActivity, orderIndex }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { stage: deal.stage, deal },
  });
  const assigneeLabel = deal.assigned_to_name || "Sin asignar";
  const assigneeChip = getAssigneeChipStyle(assigneeLabel);
  const companyLabel = deal.company_name || "Sin empresa";

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
        <div className="d-flex flex-wrap align-items-center gap-1 mb-1">
          <span className="pipeline-chip pipeline-chip-neutral">{formatDealDisplayNumber(deal.id, orderIndex)}</span>
          <span className={`pipeline-chip ${deal.company_name ? "pipeline-chip-company" : "pipeline-chip-company-empty"}`}>
            {companyLabel}
          </span>
          <span
            className="pipeline-chip pipeline-chip-assignee"
            style={{
              backgroundColor: assigneeChip.bg,
              color: assigneeChip.text,
              borderColor: assigneeChip.border,
            }}
          >
            {assigneeLabel}
          </span>
        </div>
        <div className="small fw-medium d-flex align-items-start justify-content-between gap-2 mb-1">
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
            Editar
          </Button>
          <Button as={Link} to={`/chat/deal/${deal.id}`} size="sm" variant="outline-success">
            Chat
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
    company_name: PropTypes.string,
    assigned_to_name: PropTypes.string,
  }).isRequired,
  stageAccent: PropTypes.string,
  onCreateActivity: PropTypes.func,
  orderIndex: PropTypes.number,
};

export default DealCard;
