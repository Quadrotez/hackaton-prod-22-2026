"""Default measurement parameters per species. Weight is tracked separately."""

from app.services.health.common import label_key


BODY_PARAMETERS = (
    ("Рост в холке", "см"),
    ("Длина тела", "см"),
    ("Обхват груди", "см"),
    ("Обхват шеи", "см"),
    ("Температура", "°C"),
)

TEMPLATES: dict[str, tuple[tuple[str, str], ...]] = {
    "cat": BODY_PARAMETERS,
    "dog": BODY_PARAMETERS,
}

# pets.species is free text: the frontend sends "cat"/"dog", users may type their own.
SPECIES_ALIASES = {
    "cat": ("cat", "kitten", "кошка", "кот", "котёнок", "котенок"),
    "dog": ("dog", "puppy", "собака", "пёс", "пес", "щенок"),
}
_TEMPLATE_BY_SPECIES = {
    label_key(alias): template for template, aliases in SPECIES_ALIASES.items() for alias in aliases
}

SORT_STEP = 10


def template_for_species(species: str) -> str | None:
    return _TEMPLATE_BY_SPECIES.get(label_key(species))
