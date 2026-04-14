import { useRef } from "react";
import PropTypes from "prop-types";
import { Button, Form } from "react-bootstrap";

const ChatComposer = ({
  value,
  onChange,
  onSubmit,
  disabled,
  canFreeMessage,
  onOpenTemplate,
  selectedFileName,
  onPickFile,
  onClearFile,
}) => {
  const fileInputRef = useRef(null);
  return (
    <Form onSubmit={onSubmit} className="app-chat-composer">
      <div className="d-flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="d-none"
          accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(e) => onPickFile?.(e.target.files?.[0] || null)}
          aria-label="Adjuntar archivo"
          disabled={disabled || !canFreeMessage}
        />
        <Button
          type="button"
          variant="outline-secondary"
          disabled={disabled || !canFreeMessage}
          aria-label="Adjuntar"
          onClick={() => fileInputRef.current?.click()}
        >
          <i className="bi bi-paperclip" />
        </Button>
        {canFreeMessage ? (
          <>
            <Form.Control
              value={value}
              onChange={onChange}
              placeholder="Escribe un mensaje…"
              aria-label="Mensaje"
              disabled={disabled}
            />
            <Button type="submit" disabled={disabled} variant="primary">
              <i className="bi bi-send-fill me-1" />
              Enviar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={disabled} variant="primary" onClick={onOpenTemplate}>
            <i className="bi bi-chat-square-text me-1" />
            Enviar plantilla
          </Button>
        )}
      </div>
      {selectedFileName && canFreeMessage && (
        <div className="small text-muted mt-1 d-flex align-items-center justify-content-between">
          <span className="text-truncate">Adjunto: {selectedFileName}</span>
          <button type="button" className="btn btn-link btn-sm p-0 ms-2 text-decoration-none" onClick={onClearFile}>
            Quitar
          </button>
        </div>
      )}
      {canFreeMessage && (
        <div className="small text-muted mt-1">
          WhatsApp: imágenes JPG/PNG hasta 5 MB. Documentos permitidos (PDF, DOCX, XLSX, PPTX, TXT, CSV, ZIP) hasta 100 MB.
        </div>
      )}
    </Form>
  );
};

ChatComposer.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  canFreeMessage: PropTypes.bool,
  onOpenTemplate: PropTypes.func,
  selectedFileName: PropTypes.string,
  onPickFile: PropTypes.func,
  onClearFile: PropTypes.func,
};

export default ChatComposer;
