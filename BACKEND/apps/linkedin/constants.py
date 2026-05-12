"""Constants and choices for LinkedIn module."""

FUNNEL_STAGES = [
    ("prospect_identified", "Prospecto identificado"),
    ("invitation_sent", "Invitación enviada"),
    ("connection_accepted", "Conexión aceptada"),
    ("first_message_sent", "Primer contacto enviado"),
    ("in_conversation", "En conversación"),
    ("meeting_scheduled", "Reunión agendada"),
    ("proposal_sent", "Propuesta enviada"),
    ("client", "Cliente"),
    ("discarded", "Descartado"),
]

INVITATION_STATUSES = [
    ("not_sent", "No enviada"),
    ("pending", "Pendiente"),
    ("accepted", "Aceptada"),
    ("declined", "Rechazada"),
    ("withdrawn", "Retirada"),
]

NETWORK_DISTANCES = [
    ("first", "1er grado"),
    ("second", "2do grado"),
    ("third", "3er grado"),
    ("out_of_network", "Fuera de red"),
]

SEARCH_FREQUENCIES = [
    ("daily", "Diaria"),
    ("every_2_days", "Cada 2 días"),
    ("weekly", "Semanal"),
]

ACCOUNT_STATUSES = [
    ("active", "Activa"),
    ("reconnecting", "Reconectando"),
    ("disconnected", "Desconectada"),
    ("error", "Error"),
]

MESSAGE_DIRECTIONS = [
    ("inbound", "Inbound"),
    ("outbound", "Outbound"),
]

ERROR_LINKEDIN_NOT_CONNECTED = "LINKEDIN_NOT_CONNECTED"
ERROR_LINKEDIN_RATE_LIMITED = "LINKEDIN_RATE_LIMITED"
ERROR_LINKEDIN_INVITE_LIMIT = "LINKEDIN_INVITE_LIMIT"
ERROR_LINKEDIN_CONNECTION_REQUIRED = "LINKEDIN_CONNECTION_REQUIRED"
ERROR_UNIPILE_UNAVAILABLE = "UNIPILE_UNAVAILABLE"
ERROR_PROSPECT_ALREADY_EXISTS = "PROSPECT_ALREADY_EXISTS"
ERROR_PROSPECT_DISCARDED = "PROSPECT_DISCARDED"

