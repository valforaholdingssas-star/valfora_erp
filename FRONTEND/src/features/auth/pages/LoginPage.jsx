import { useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { Navigate, useLocation } from "react-router-dom";

import valforaLogo from "../../../assets/valfora-logo-transparent.png";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const LoginPage = () => {
  const { login, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        "No se pudo iniciar sesión. Revisa tu conexión e inténtalo de nuevo.";
      setError(typeof msg === "string" ? msg : "Error de autenticación.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="valfora-login-shell">
      <div className="valfora-login-atmosphere" aria-hidden="true">
        <span className="valfora-login-orb valfora-login-orb-a" />
        <span className="valfora-login-orb valfora-login-orb-b" />
        <span className="valfora-login-grid" />
      </div>

      <main className="valfora-login-stage">
        <header className="valfora-login-hero">
          <img src={valforaLogo} alt="" className="valfora-login-mark" />
          <p className="valfora-login-brand-name">Valfora Holdings</p>
          <h1 className="valfora-login-wordmark">Seeds ERP</h1>
          <p className="valfora-login-lede">
            Operación comercial, WhatsApp y CRM en un solo workspace.
          </p>
        </header>

        <section className="valfora-login-form-panel" aria-label="Acceso">
          <div className="valfora-login-form-card">
            <h2 className="valfora-login-title">Inicia sesión</h2>
            <p className="valfora-login-subtitle">Usa tu correo corporativo para entrar.</p>

            {error && (
              <Alert variant="danger" className="py-2 mb-3 valfora-login-alert">
                {error}
              </Alert>
            )}

            <Form onSubmit={handleSubmit} className="valfora-login-form">
              <Form.Group className="mb-3" controlId="loginEmail">
                <Form.Label>Correo corporativo</Form.Label>
                <div className="valfora-input-group">
                  <i className="bi bi-envelope valfora-input-icon" aria-hidden="true" />
                  <Form.Control
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="nombre@valforaholdings.com"
                    className="valfora-input"
                  />
                </div>
              </Form.Group>

              <Form.Group className="mb-4" controlId="loginPassword">
                <Form.Label>Contraseña</Form.Label>
                <div className="valfora-input-group">
                  <i className="bi bi-lock valfora-input-icon" aria-hidden="true" />
                  <Form.Control
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Introduce tu contraseña"
                    className="valfora-input pe-5"
                  />
                  <button
                    type="button"
                    className="valfora-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
                  </button>
                </div>
              </Form.Group>

              <Button
                type="submit"
                className="w-100 valfora-login-submit"
                disabled={submitting || loading}
              >
                {submitting ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Entrando…
                  </>
                ) : (
                  "Entrar al workspace"
                )}
              </Button>
            </Form>
          </div>
        </section>

        <p className="valfora-login-foot">© {new Date().getFullYear()} Valfora Holdings</p>
      </main>
    </div>
  );
};

export default LoginPage;
