import PropTypes from "prop-types";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";
import { formatDealDisplayNumber, formatDealValue } from "../utils/formatters.js";

const CALL_STAGE_KEY = "realizar_llamada";

const dealShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  title: PropTypes.string,
  contact_name: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  currency: PropTypes.string,
  stage: PropTypes.string,
  is_stale: PropTypes.bool,
  company_name: PropTypes.string,
  assigned_to_name: PropTypes.string,
  calls_count: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
});

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

const dealTitle = (deal) => {
  const id = String(deal?.id || "");
  return deal?.title || deal?.contact_name || `Deal ${id.slice(0, 8)}`;
};

const DealCardView = ({
  deal,
  stageAccent,
  onCreateActivity,
  onQuickEdit,
  onLogCall,
  orderIndex,
  cardRef,
  cardStyle,
  className,
  dragHandleProps,
}) => {
  const assigneeLabel = deal.assigned_to_name || "Sin asignar";
  const assigneeMeta = buildAssigneeMeta(assigneeLabel);
  const companyLabel = deal.company_name || "Sin empresa";
  const callsCount = Number(deal.calls_count || 0);
  const isCallStage = deal.stage === CALL_STAGE_KEY;

  return (
    <div
      ref={cardRef}
      className={`crm-deal-card ${className || ""}`.trim()}
      style={{
        "--deal-stage-accent": stageAccent || "#3b82f6",
        ...(cardStyle || {}),
      }}
    >
      <div className="crm-deal-card-body">
        <div className="crm-deal-card-topline">
          <span className="crm-deal-card-number">{formatDealDisplayNumber(deal.id, orderIndex)}</span>
          <div className="crm-deal-card-topline-badges">
            {callsCount > 0 ? (
              <span className="crm-deal-card-calls-badge" title={`${callsCount} llamada(s)`}>
                <i className="bi bi-telephone-fill" />
                {callsCount}
              </span>
            ) : null}
            <span className={`crm-deal-card-company-badge ${deal.company_name ? "" : "is-empty"}`}>
              {companyLabel}
            </span>
          </div>
        </div>
        <div className="crm-deal-card-title-row">
          <span className="crm-deal-card-title">{dealTitle(deal)}</span>
          {dragHandleProps ? (
            <div className="crm-deal-card-title-actions">
              <button
                type="button"
                className="pipeline-drag-handle crm-deal-drag-handle"
                title="Arrastrar"
                aria-label="Arrastrar deal"
                {...dragHandleProps}
              >
                <i className="bi bi-grip-vertical" />
              </button>
            </div>
          ) : null}
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
            <button
              type="button"
              className="crm-deal-card-icon-action"
              onClick={(e) => {
                e.stopPropagation();
                onQuickEdit?.(deal);
              }}
              title="Editar deal"
              aria-label="Editar deal"
            >
              <i className="bi bi-pencil" />
            </button>
            {isCallStage ? (
              <button
                type="button"
                className="crm-deal-card-icon-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogCall?.(deal);
                }}
                title="Registrar llamada"
                aria-label="Registrar llamada"
              >
                <i className="bi bi-telephone" />
              </button>
            ) : null}
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
      </div>
    </div>
  );
};

DealCardView.propTypes = {
  deal: dealShape.isRequired,
  stageAccent: PropTypes.string,
  onCreateActivity: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
  orderIndex: PropTypes.number,
  cardRef: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
  cardStyle: PropTypes.object,
  className: PropTypes.string,
  dragHandleProps: PropTypes.object,
};

const SortableDealCard = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(props.deal.id),
    data: {
      type: "deal",
      stageId: props.deal.stage,
    },
    animateLayoutChanges: () => false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? "grabbing" : undefined,
  };

  return (
    <DealCardView
      {...props}
      cardRef={setNodeRef}
      className={isDragging ? "is-dragging" : ""}
      cardStyle={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
};

SortableDealCard.propTypes = {
  deal: dealShape.isRequired,
};

const DealCard = ({ sortable = true, ...props }) => (
  sortable ? <SortableDealCard {...props} /> : <DealCardView {...props} />
);

DealCard.propTypes = {
  deal: dealShape.isRequired,
  stageAccent: PropTypes.string,
  onCreateActivity: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
  orderIndex: PropTypes.number,
  sortable: PropTypes.bool,
};

export default DealCard;
