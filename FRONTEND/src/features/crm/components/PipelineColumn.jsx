import PropTypes from "prop-types";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";

import DealCard from "./DealCard.jsx";

const PipelineColumn = ({
  stage,
  deals,
  stageTotal,
  isOver: isOverProp = false,
  onCreateActivity,
  onCreateDeal,
  onQuickEdit,
  onLogCall,
  sortable = true,
}) => {
  const { setNodeRef, isOver: isDroppableOver } = useDroppable({
    id: stage.id,
    data: { type: "column", stageId: stage.id },
    disabled: !sortable,
  });
  const isOver = Boolean(isOverProp || isDroppableOver);
  const dealIds = deals.map((d) => d.id).filter(Boolean);

  return (
    <div
      className={`crm-stage-column ${isOver ? "is-over" : ""}`}
      style={{ "--stage-accent": stage.accent, "--stage-tint": stage.tint }}
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
        {sortable ? (
          <SortableContext items={dealIds} strategy={verticalListSortingStrategy} id={`sortable-${stage.id}`}>
            {deals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                stageAccent={stage.accent}
                onCreateActivity={onCreateActivity}
                onQuickEdit={onQuickEdit}
                onLogCall={onLogCall}
                orderIndex={index}
                sortable
              />
            ))}
          </SortableContext>
        ) : (
          deals.map((deal, index) => (
            <DealCard
              key={deal.id}
              deal={deal}
              stageAccent={stage.accent}
              onCreateActivity={onCreateActivity}
              onQuickEdit={onQuickEdit}
              onLogCall={onLogCall}
              orderIndex={index}
              sortable={false}
            />
          ))
        )}
        {!deals.length ? (
          <div className="crm-stage-empty">
            <i className="bi bi-inbox" />
            <span>{sortable ? "Suelta un deal aquí" : "Sin deals para este filtro"}</span>
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
  onCreateActivity: PropTypes.func,
  onCreateDeal: PropTypes.func,
  onQuickEdit: PropTypes.func,
  onLogCall: PropTypes.func,
  sortable: PropTypes.bool,
};

export default PipelineColumn;
