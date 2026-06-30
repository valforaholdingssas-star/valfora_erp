import PropTypes from "prop-types";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "react-bootstrap";
import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";
import { formatDealDisplayNumber, formatDealValue } from "../utils/formatters.js";

const buildAssigneeMeta = (label) => {
  const normalized = String(label || "").trim();
  if (!normalized || normalized.toLowerCase() === "sin asignar") {
    return {
      initials: "SA",
      shortName: "Sin asignar",
    };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || normalized.slice(0, 2).toUpperCase();
  const shortName = parts.length > 1
    ? `${parts[0][0]?.toUpperCase() || ""}. ${parts[parts.length - 1]}`
    : normalized;

  return { initials, shortName };
};

const DealCard = ({ deal, stageAccent, onCreateActivity, orderIndex }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: { stage: deal.stage, deal },
  });
  const assigneeLabel = deal.assigned_to_name || "Sin asignar";
  const assigneeMeta = buildAssigneeMeta(assigneeLabel);
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
        <div className="crm-deal-card-topline">
          <span className="crm-deal-card-number">{formatDealDisplayNumber(deal.id, orderIndex)}</span>
          <span className={`crm-deal-card-company-badge ${deal.company_name ? "" : "is-empty"}`}>
            {companyLabel}
          </span>
        </div>
        <div className="crm-deal-card-title-row">
          <span className="crm-deal-card-title">{deal.title || deal.contact_name || `Deal ${deal.id.slice(0, 8)}`}</span>
          <div className="crm-deal-card-title-actions">
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
          {formatDealValue(deal.value)} <span>{deal.currency}</span>
        </div>
        <div className="crm-deal-card-contact">{deal.contact_name}</div>
        <div className="crm-deal-card-footer">
          <div className="crm-deal-card-assignee">
            <span className="crm-deal-card-assignee-avatar">{assigneeMeta.initials}</span>
            <span className="crm-deal-card-assignee-name">{assigneeMeta.shortName}</span>
          </div>
          <div className="crm-deal-card-actions">
            <Link to={`/crm/deals/${deal.id}`} className="crm-deal-card-icon-action" title="Editar deal" aria-label="Editar deal">
              <i className="bi bi-pencil" />
            </Link>
            <Link to={`/chat/deal/${deal.id}`} className="crm-deal-card-icon-action" title="Abrir chat" aria-label="Abrir chat">
              <i className="bi bi-chat-square-text" />
            </Link>
            <button
              type="button"
              className="crm-deal-card-icon-action"
              onClick={(e) => {
                e.stopPropagation();
                onCreateActivity?.(deal);
              }}
              title="Crear actividad"
              aria-label="Crear actividad"
            >
              <i className="bi bi-lightning-charge" />
            </button>
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
