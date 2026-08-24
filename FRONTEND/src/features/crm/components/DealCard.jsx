import PropTypes from "prop-types";
import { useDraggable } from "@dnd-kit/core";
import { Link } from "react-router-dom";
import { formatDealDisplayNumber, formatDealValue } from "../utils/formatters.js";

const CALL_STAGE_KEY = "realizar_llamada";

const dealShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  title: PropTypes.string,
  contact_name: PropTypes.string,
  contact_email: PropTypes.string,
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
    return { initials: "SA", shortName: "Sin asignar" };
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || normalized.slice(0, 2).toUpperCase();
  const shortName = parts.length > 1
    ? `${parts[0][0]?.toUpperCase() || ""}. ${parts[parts.length - 1]}`
    : normalized;
  return { initials, shortName };
};

export const getDealCardTitle = (deal) => {
  const id = String(deal?.id || "");
  return deal?.title || deal?.contact_name || `Deal ${id.slice(0, 8)}`;
};

export const DealCardContent = ({ deal, orderIndex = 0, showActions = true, onCreateActivity, onQuickEdit, onLogCall }) => {
  const assigneeLabel = deal.assigned_to_name || "Sin asignar";
  const assigneeMeta = buildAssigneeMeta(assigneeLabel);
  const companyLabel = deal.company_name || "Sin empresa";
  const callsCount = Number(deal.calls_count || 0);
  const isCallStage = deal.stage === CALL_STAGE_KEY;

  return (
    <>
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
        <span className="crm-deal-card-title">{getDealCardTitle(deal)}</span>
        {showActions ? (
          <div className="crm-deal-card-title-actions" aria-hidden="true">
            <span className="pipeline-drag-handle crm-deal-drag-handle">
              <i className="bi bi-grip-vertical" />
            </span>
          </div>
        ) : null}
      </div>
      <div className="crm-deal-card-value">
        {formatDealValue(deal.value)} <span>{deal.currency}</span>
      </div>
      <div className="crm-deal-card-contact">
        {deal.contact_name}
        {deal.contact_email ? <span className="crm-deal-card-contact-email">{deal.contact_email}</span> : null}
      </div>
      <div className="crm-deal-card-footer">
        <div className="crm-deal-card-assignee">
          <span className="crm-deal-card-assignee-avatar">{assigneeMeta.initials}</span>
          <span className="crm-deal-card-assignee-name">{assigneeMeta.shortName}</span>
        </div>
        {showActions ? (
          <div className="crm-deal-card-actions">
            <button
              type="button"
              className="crm-deal-card-icon-action"
              onPointerDown={(e) => e.stopPropagation()}
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
                onPointerDown={(e) => e.stopPropagation()}
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
            <Link
              to={`/chat/deal/${deal.id}`}
              className="crm-deal-card-icon-action"
              title="Abrir chat"
              aria-label="Abrir chat"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <i className="bi bi-chat-square-text" />
            </Link>
            <button
              type="button"
              className="crm-deal-card-icon-action"
              onPointerDown={(e) => e.stopPropagation()}
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
        ) : null}
      </div>
    </>
  );
};

DealCardContent.propTypes = {
  deal: dealShape.isRequired,
  orderIndex: PropTypes.number,
  showActions: PropTypes.bool,
  onCreateActivity: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
};

const DealCard = ({
  deal,
  stageAccent,
  onCreateActivity,
  onQuickEdit,
  onLogCall,
  orderIndex,
  draggable = true,
  isDragOverlay = false,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(deal.id),
    data: { type: "deal", stageId: deal.stage },
    disabled: !draggable || isDragOverlay,
  });

  const className = [
    "crm-deal-card",
    isDragging ? "is-dragging" : "",
    isDragOverlay ? "is-overlay" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      className={className}
      style={{ "--deal-stage-accent": stageAccent || "#3b82f6" }}
      {...(draggable && !isDragOverlay ? { ...listeners, ...attributes } : {})}
    >
      <div className="crm-deal-card-body">
        <DealCardContent
          deal={deal}
          orderIndex={orderIndex}
          showActions={!isDragOverlay}
          onCreateActivity={onCreateActivity}
          onQuickEdit={onQuickEdit}
          onLogCall={onLogCall}
        />
      </div>
    </div>
  );
};

DealCard.propTypes = {
  deal: dealShape.isRequired,
  stageAccent: PropTypes.string,
  onCreateActivity: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
  orderIndex: PropTypes.number,
  draggable: PropTypes.bool,
  isDragOverlay: PropTypes.bool,
};

export default DealCard;
