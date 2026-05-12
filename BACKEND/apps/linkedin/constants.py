"""Constants and choices for LinkedIn module."""

FUNNEL_STAGES = [
    ("contacted", "Contactado"),
    ("low_interest", "Interés bajo"),
    ("high_interest", "Interés alto"),
    ("meeting_scheduling", "En agendamiento de reunión"),
    ("proposal_sent", "Propuesta enviada"),
    ("no_response", "No contesta"),
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
