import { Component } from "react";
import PropTypes from "prop-types";

/**
 * Keeps a drag crash from blanking the whole CRM shell.
 */
class PipelineBoardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("Pipeline board crashed during drag/render:", error);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="crm-pipeline-board-error">
          <strong>El tablero se interrumpió al arrastrar.</strong>
          <p className="mb-2 small text-muted">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button type="button" className="crm-header-btn" onClick={this.handleReset}>
            Restaurar tablero
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

PipelineBoardErrorBoundary.propTypes = {
  children: PropTypes.node,
  onReset: PropTypes.func,
};

export default PipelineBoardErrorBoundary;
