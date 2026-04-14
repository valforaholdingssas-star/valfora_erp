import PropTypes from "prop-types";

const TemplatePreview = ({ header, body, footer }) => (
  <div className="border rounded p-3 bg-light">
    {header ? <p className="fw-semibold mb-2">{header}</p> : null}
    <p className="mb-2">{body || "Cuerpo del template"}</p>
    {footer ? <p className="small text-muted mb-0">{footer}</p> : null}
  </div>
);

TemplatePreview.propTypes = {
  header: PropTypes.string,
  body: PropTypes.string,
  footer: PropTypes.string,
};

export default TemplatePreview;
