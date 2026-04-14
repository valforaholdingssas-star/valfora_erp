import { useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";
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
        "No se pudo iniciar sesión.";
      setError(typeof msg === "string" ? msg : "Error de autenticación.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="valfora-login-shell">
      <section className="valfora-login-form-panel">
        <div className="valfora-login-form-wrap">
          <div className="valfora-login-icon">
            <i className="bi bi-box-arrow-in-right" />
          </div>
          <h1 className="valfora-login-title">Inicia sesión</h1>
          <p className="valfora-login-subtitle">Accede con tu usuario para continuar</p>

          {error && (
            <Alert variant="danger" className="py-2 mb-3">
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit} className="valfora-login-form">
            <Form.Group className="mb-3 valfora-input-group" controlId="loginEmail">
              <i className="bi bi-at valfora-input-icon" />
              <Form.Control
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Correo corporativo"
                className="valfora-input"
              />
            </Form.Group>
            <Form.Group className="mb-2 valfora-input-group" controlId="loginPassword">
              <i className="bi bi-key valfora-input-icon" />
              <Form.Control
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Contraseña"
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
            </Form.Group>
            <div className="text-end mb-4">
              <button type="button" className="valfora-link-btn">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <Button
              variant="primary"
              type="submit"
              className="w-100 valfora-login-submit"
              disabled={submitting}
            >
              {submitting ? "Entrando..." : "Iniciar sesión"}
            </Button>
          </Form>
        </div>
      </section>

      <aside className="valfora-login-hero-panel">
        <div className="valfora-login-hero-inner">
          <img src={valforaLogo} alt="Valfora Holdings Logo" className="valfora-login-hero-logo" />
          <h2 className="valfora-login-hero-title">Valfora Holdings ERP</h2>
          <p className="valfora-login-hero-copy">Bienvenidos a nuestro portal empresarial.</p>
        </div>
      </aside>
    </div>
  );
};

export default LoginPage;
