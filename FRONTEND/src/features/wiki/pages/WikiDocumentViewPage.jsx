import { useEffect, useState } from "react";
import { Alert, Card, Spinner } from "react-bootstrap";
import { useParams } from "react-router-dom";

import { fetchWikiDocumentBySlug } from "../../../api/wiki.js";

const WikiDocumentViewPage = () => {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [document, setDocument] = useState(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchWikiDocumentBySlug(slug);
        if (!mounted) return;
        setDocument(data);
      } catch {
        if (!mounted) return;
        setDocument(null);
        setError("No se encontró el documento wiki.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="app-page app-page-narrow py-4 d-flex align-items-center gap-2 text-muted">
        <Spinner animation="border" size="sm" />
        <span>Cargando documento...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-page app-page-narrow py-3">
        <Alert variant="warning" className="mb-0">
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div className="app-page app-page-narrow">
      <Card className="app-card">
        <Card.Body>
          <h1 className="h4 mb-3">{document?.title}</h1>
          <div className="wiki-document-content" dangerouslySetInnerHTML={{ __html: document?.html_content || "" }} />
        </Card.Body>
      </Card>
    </div>
  );
};

export default WikiDocumentViewPage;
