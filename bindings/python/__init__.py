from importlib.resources import files

from .binding import language_sed, language_sed_ere

HIGHLIGHTS_QUERY: str = (
    files(__package__).joinpath("queries/highlights.scm").read_text("utf-8")
)
HIGHLIGHTS_QUERY_ERE: str = HIGHLIGHTS_QUERY

__all__ = [
    "HIGHLIGHTS_QUERY",
    "HIGHLIGHTS_QUERY_ERE",
    "language_sed",
    "language_sed_ere",
]
