import PropTypes from "prop-types";
import { useDroppable } from "@dnd-kit/core";

import DealCard from "./DealCard.jsx";

const PipelineColumn = ({
  stage,
  deals,
  stageTotal,
  isOver: isOverProp = false,
  activeDealId = null,
  justMovedDealId = null,
  droppable = true,
  onCreateActivity,
  onCreateDeal,
  onQuickEdit,
  onLogCall,
}) => {
  const { setNodeRef, isOver: isDroppableOver } = useDroppable({
    id: stage.id,
    data: { type: "column", stageId: stage.id },
    disabled: !droppable,
  });
  const isOver = Boolean(isOverProp || isDroppableOver);

  return (
    <div
      className={`crm-stage-column ${isOver ? "is-over" : ""}`}
      style={{ "--stage-accent": stage.accent, "--stage-tint": stage.tint }}
      data-stage-id={stage.id}
    >
      <div className="crm-stage-column-accent" />
      <div className="crm-stage-column-header">
        <div className="crm-stage-column-heading">
          <div className="crm-stage-column-title-row">
            <div className="crm-stage-column-title">{stage.title}</div>
            <span className="crm-stage-column-count" style={{ backgroundColor: stage.tint, color: stage.accent }}>
              {deals.length}
            </span>
          </div>
          <div className="crm-stage-column-total">{stageTotal} pipeline</div>
          {isOver ? <div className="crm-stage-drop-hint">Soltar aquí</div> : null}
        </div>
        <div className="crm-stage-column-actions">
          <button
            type="button"
            className="crm-stage-add"
            onClick={() => onCreateDeal?.(stage.id)}
            title={`Crear deal en ${stage.title}`}
            aria-label={`Crear deal en ${stage.title}`}
          >
            <i className="bi bi-plus-lg" />
          </button>
        </div>
      </div>
      <div ref={setNodeRef} className="crm-stage-column-body">
        {deals.map((deal, index) => {
          const dealId = String(deal.id);
          const isActive = activeDealId && dealId === String(activeDealId);
          const isJustMoved = justMovedDealId && dealId === String(justMovedDealId);
          return (
            <div
              key={deal.id}
              className={[
                "crm-deal-card-slot",
                isActive ? "is-active-source" : "",
                isJustMoved ? "is-just-moved" : "",
              ].filter(Boolean).join(" ")}
            >
              {isActive ? <div className="crm-deal-card-ghost">Moviendo…</div> : null}
              <DealCard
                deal={deal}
                stageAccent={stage.accent}
                onCreateActivity={onCreateActivity}
                onQuickEdit={onQuickEdit}
                onLogCall={onLogCall}
                orderIndex={index}
                draggable={droppable}
              />
            </div>
          );
        })}
        {!deals.length ? (
          <div className="crm-stage-empty">
            <i className="bi bi-inbox" />
            <span>{droppable ? "Suelta un deal aquí" : "Sin deals para este filtro"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

PipelineColumn.propTypes = {
  stage: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    accent: PropTypes.string.isRequired,
    tint: PropTypes.string.isRequired,
  }).isRequired,
  deals: PropTypes.arrayOf(PropTypes.object).isRequired,
  stageTotal: PropTypes.string.isRequired,
  isOver: PropTypes.bool,
  activeDealId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  justMovedDealId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  droppable: PropTypes.bool,
  onCreateActivity: PropTypes.func,
  onCreateDeal: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
};

export default PipelineColumn;
