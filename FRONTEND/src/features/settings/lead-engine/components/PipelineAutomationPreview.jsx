import PropTypes from "prop-types";

const PipelineAutomationPreview = ({ config }) => {
  const on = (v) => (v ? "✅" : "⬜");
  return (
    <div className="small bg-light border rounded p-3">
      <div>{on(config?.auto_move_on_first_response)} Primera respuesta → Contactado</div>
      <div>{on(config?.auto_move_on_meeting)} Reunión/Llamada → Calificado</div>
      <div>{on(config?.auto_move_on_proposal)} Propuesta → Proposal</div>
      <div>{on(config?.auto_move_on_contract)} Contrato creado → Negociación</div>
      <div>{on(config?.auto_move_on_contract_signed)} Contrato activo → Ganado</div>
    </div>
  );
};

PipelineAutomationPreview.propTypes = {
  config: PropTypes.object,
};

export default PipelineAutomationPreview;
