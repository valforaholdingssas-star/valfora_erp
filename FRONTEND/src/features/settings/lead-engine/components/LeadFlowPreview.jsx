import PropTypes from "prop-types";

const LeadFlowPreview = ({ config }) => (
  <div className="small bg-light border rounded p-3">
    <div>WhatsApp → Contacto {config?.auto_create_contact ? "✅" : "⬜"}</div>
    <div>Contacto → Deal {config?.auto_create_deal ? "✅" : "⬜"}</div>
    <div>Deal → Actividad {config?.auto_create_follow_up ? "✅" : "⬜"}</div>
    <div>Actividad → Notificación {config?.notify_on_new_lead ? "✅" : "⬜"}</div>
  </div>
);

LeadFlowPreview.propTypes = {
  config: PropTypes.object,
};

export default LeadFlowPreview;
