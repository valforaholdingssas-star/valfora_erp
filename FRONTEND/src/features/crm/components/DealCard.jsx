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
      className={`crm-deal-card ${isDragging ? "is-dragging" : ""}`}
      style={{
        "--deal-stage-accent": stageAccent || "#3b82f6",
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: isDragging ? "grabbing" : "default",
        opacity: isDragging ? 0.55 : 1,
      }}
    >
      <Card.Body className="crm-deal-card-body">
        <div className="crm-deal-card-chips">
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
        <div className="crm-deal-card-title-row">
          <span className="crm-deal-card-title">{deal.title || deal.contact_name || `Deal ${deal.id.slice(0, 8)}`}</span>
          <div className="crm-deal-card-title-actions">
            {deal.is_stale ? <Badge bg="secondary">stale</Badge> : null}
            <button
              type="button"
              className="pipeline-drag-handle crm-deal-drag-handle"
              title="Arrastrar"
              aria-label="Arrastrar deal"
              {...attributes}
              {...listeners}
            >
              <i className="bi bi-grip-vertical" />
            </button>
          </div>
        </div>
        <div className="crm-deal-card-value">
          {formatDealValue(deal.value)} {deal.currency}
        </div>
        <div className="crm-deal-card-contact">{deal.contact_name}</div>
        <div className="crm-deal-card-footer">
          <div className="crm-deal-card-actions">
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
