from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SearchQuery:
    paragraph: str
    query: str


@dataclass(frozen=True)
class ImageResult:
    source: str
    url: str
    file_path: str | None = None
    width: int | None = None
    height: int | None = None
    resolution: int | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, str | int | None]:
        return asdict(self)

