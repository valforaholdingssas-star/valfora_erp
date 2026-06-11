import PropTypes from "prop-types";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";

import DealCard from "./DealCard.jsx";

const PipelineColumn = ({ stage, deals, onCreateActivity, onCreateDeal }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "column", stageId: stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`pipeline-stage pipeline-stage--colored ${isOver ? "is-over" : ""}`}
      style={{ "--stage-accent": stage.accent, "--stage-tint": stage.tint }}
    >
      <div className="d-flex justify-content-between align-items-center mb-2 px-1">
        <div className="fw-semibold small">{stage.title}</div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-link text-decoration-none p-0"
            style={{ color: stage.accent }}
            onClick={() => onCreateDeal?.(stage.id)}
            title={`Crear deal en ${stage.title}`}
            aria-label={`Crear deal en ${stage.title}`}
          >
            <i className="bi bi-plus-circle-fill" />
          </button>
          <span className="badge" style={{ backgroundColor: stage.accent }}>{deals.length}</span>
        </div>
      </div>
      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        {deals.map((deal, index) => (
          <DealCard
            key={deal.id}
            deal={deal}
            stageAccent={stage.accent}
            onCreateActivity={onCreateActivity}
            orderIndex={index}
          />
        ))}
      </SortableContext>
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
  onCreateActivity: PropTypes.func,
  onCreateDeal: PropTypes.func,
};

export default PipelineColumn;
