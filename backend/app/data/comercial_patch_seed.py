"""
Filas iniciales para patch_db_comercial (TSV). Idempotente vía clave lógica deduplicada.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.comercial import ComercialEvento, ComercialReserva

RESERVAS_TSV = r"""28/12/2025	German	901139973	60	28/12/2025	22:00:00	Pendiente
6/01/2026	Carlos Uehara	996785638	10	7/01/2026	16:30:00	Pendiente
6/01/2026	Leilah Ocampo	949358033	10	18/03/2026	19:00:00	Pendiente
6/02/2026	Kelly Rebaza Pino	981085933	14	7/02/2026	20:00:00	Pendiente
6/02/2026	Kelly Rebaza Pino	981085933	14	7/02/2026	20:00:00	Pendiente
8/02/2026	test	987654321	4	10/02/2026	20:00:00	Pendiente
8/02/2026	Mariafe Celeste Quito Ormeño	936279917	2	14/02/2026	14:00:00	Pendiente
10/02/2026	RYOKO KUDA	979380894	2	14/02/2026	20:00:00	Pendiente
10/02/2026	Javier Arturo Torres Ssosa	955129248	5	14/02/2026	20:00:00	Pendiente
12/02/2026	Carlos Antonio Merma Silva	978718725	12	13/02/2026	17:30:00	Pendiente
12/02/2026	Lydia Chunga Ludeña	993481117	10	13/02/2026	8:00:00	Pendiente
12/02/2026	Luiggi Dulanto Tecco	998894595	2	14/02/2026	19:30:00	Pendiente
12/02/2026	Jaime Bravo Chavez y Melanie Hernández Gonzales	924419567	2	14/02/2026	19:30:00	Pendiente
13/02/2026	Jaime Bravo Chavez y Melanie Hernández Gonzales	924419567	2	14/02/2026	19:30:00	Pendiente
13/02/2026	Luiggi Dulanto Tecco	998894595	2	14/02/2026	17:30:00	Pendiente
13/02/2026	Luiggi Dulanto Tecco	998894595	2	14/02/2026	19:30:00	Pendiente
14/02/2026	Claudia María Alcedo Velasquez	959538650	5	15/02/2026	14:00:00	Pendiente
16/02/2026	Karla Paredes Trujillo	907999923	19	21/02/2026	20:00:00	Pendiente
21/02/2026	Valentina Suarez Hidalgo	902088064	10	26/02/2026	20:00:00	Pendiente
24/02/2026	Michele Villanueva Hurtado	956159590	12	27/02/2026	21:00:00	Pendiente
25/02/2026	Gabriel Morales Sánchez	992105593	15	27/02/2026	13:00:00	Pendiente
25/02/2026	Andrea Noriega	965714720	15	28/02/2026	18:00:00	Pendiente
27/02/2026	Lesly Sarita Toro Rojas	922372388	15	27/02/2026	18:30:00	Pendiente
27/02/2026	Diana Suárez Maldonado	962671905	20	27/08/2026	19:00:00	Pendiente
27/02/2026	Diana Suárez Maldonado	962671905	20	27/02/2026	19:00:00	Pendiente
27/02/2026	Diana Suárez Maldonado	962671905	20	27/02/2026	19:00:00	Pendiente
27/02/2026	Diana Suárez Maldonado	962671905	20	27/02/2026	19:00:00	Pendiente
27/02/2026	Jackie Felix	903568605	20	27/02/2026	18:00:00	Pendiente
28/02/2026	Alejandro Sime	959351411	10	1/03/2026	13:00:00	Pendiente
28/02/2026	Julio Aranda	987262762	7	28/02/2026	15:00:00	Pendiente
28/02/2026	Almendra Pierina Celiz Rossi	993041994	15	6/03/2026	20:00:00	Pendiente
1/03/2026	Ana María Hidalgo	946398630	15	6/03/2026	20:00:00	Pendiente
6/03/2026	Claudia Fernanda Martínez Ascue	985548715	20	7/03/2026	20:00:00	Pendiente
6/03/2026	Claudia Fernanda Martínez Ascue	985548715	20	7/03/2026	20:00:00	Pendiente
10/03/2026	Marcela Vargas	984246481	10	14/03/2026	21:00:00	Pendiente
10/03/2026	Aaron Jefferson Cuenca Monterrey	971620157	20	12/03/2026	19:00:00	Pendiente
10/03/2026	Aaron Cuenca Monterrey	971620157	20	12/03/2026	19:00:00	Pendiente
11/03/2026	Astrid Yadira Enriquez Alfaro	957632987	15	13/03/2026	14:30:00	Pendiente
13/03/2026	Daniel Sanz Caballero	980730170	12	13/03/2026	20:00:00	Pendiente
13/03/2026	Mar Goycochea	986993564	20	22/03/2026	16:00:00	Pendiente
13/03/2026	Mar Goycochea	986993564	15	22/03/2026	16:00:00	Pendiente
14/03/2026	Aaron Cuenca Monterrey	971620157	20	19/03/2026	19:00:00	Pendiente
15/03/2026	Ursula Lujan Milla	915018918	4	15/03/2026	15:00:00	Pendiente
16/03/2026	Nicole Rebeca Arquinigo Bazan	993793659	20	20/03/2026	20:00:00	Pendiente
26/03/2026	Mauricio Maradiegue	958733820	15	27/03/2026	20:00:00	Pendiente
26/03/2026	Pamela Sariah Bazán Prugue	936116624	20	27/03/2026	21:30:00	Pendiente
28/03/2026	José Mauricio Valdivia Medina	915207940	10	28/03/2026	15:00:00	Pendiente
31/03/2026	Fátima Yataco la Fauci	981263933	15	30/04/2026	21:00:00	Pendiente
1/04/2026	Vida Del Carmen Cisneros López	999499859	20	10/04/2026	19:00:00	Pendiente
1/04/2026	Milagros Rodríguez	944120619	15	1/04/2026	12:30PM	Pendiente
1/04/2026	Jorge Cuellar Ramos	964312730	18	1/04/2026	19:00:00	Pendiente
1/04/2026	Vida Del Carmen Cisneros López	999499859	20	24/04/2026	19:00:00	Pendiente
4/04/2026	Brenda	969787881	5	4/03/2026	19:00:00	Pendiente"""

EVENTOS_TSV = r"""15/01/2026	Leilah Ocampo	GRUPO CORDILLERA BLANCA	949358033	Corporativo	90	18/03/2026	Pendiente
11/02/2026	Bruno Martin Sánchez Avendaño	N/A	939836530	Fiestas Infantiles	35	14/05/2025	Pendiente
20/02/2026	Maria Fernanda Linares	N/A	990003508	Social	40	24/04/2026	Pendiente
22/02/2026	Nery Quiroz Conteña	N/A	998106194	Social	100	18/04/2026	Pendiente
24/02/2026	Amira Calvo	N/A	910074536	Social	20	27/03/2026	Pendiente
25/02/2026	JHANSY PELAEZ	Arca Continental Lindley	993850870	Corporativo	40	5/03/2026	Pendiente
25/02/2026	Gissela Consuelo Almonacid Micha		992805373	Fiestas Infantiles	50	21/03/2026	Pendiente
25/02/2026	JHANSY PELAEZ	Arca Continental Lindley	993850870	Corporativo	40	5/03/2026	Pendiente
25/02/2026	JHANSY PELAEZ	Arca Continental Lindley	993850870	Corporativo	40	5/03/2026	Pendiente
26/02/2026	Mariam Nazareth Araque Diaz	N/A	963584047	Social	13	1/03/2026	Pendiente
26/02/2026	Carolina Peralta Zegarra	N/A	962358887	Fiestas Infantiles	30	2/03/2026	Pendiente
27/02/2026	Nashely	N/A	990347248	Fiestas Infantiles	50	14/03/2026	Pendiente
28/02/2026	Claudia Infante	N/A	987955765	Fiestas Infantiles	20	14/03/2026	Pendiente
28/02/2026	Milenka Varillas	N/A	957926998	Fiestas Infantiles	20-30	18/04/2026	Pendiente
28/02/2026	Milenka Varillas	N/A	957926998	Fiestas Infantiles	20-30	18/04/2026	Pendiente
2/03/2026	Candy Tomasto Galdo	N/A	966178625	Social	15 a 20 personas	7/03/2026	Pendiente
4/03/2026	ANA MARIA HIDALGO BECERRA	N/A	946398630	Social	15	6/03/2026	Pendiente
12/03/2026	Silvana Fernandez Tafur	N/A	914279302	Social	20	28/03/2026	Pendiente
16/03/2026	Silvana Fernandez Tafur		914279302	Social	20	28/03/2026	Pendiente
16/03/2026	Nicole Rebeca Arquinigo Bazan	N/A	993793659	Social	20	20/03/2026	Pendiente
16/03/2026	Nicole Rebeca Arquinigo Bazan		993793659	Social	20	20/03/2026	Pendiente
26/03/2026	Mauricio Maradiegue	American Express Concierge	958733820	Social	15	27/03/2026	Pendiente
30/03/2026	Dejhanira Muhlig	N/A	987412436	Fiestas Infantiles	80-90	16/05/2026	Pendiente"""


def _parse_ddmmyyyy(s: str) -> datetime:
    s = s.strip()
    parts = s.split("/")
    if len(parts) != 3:
        raise ValueError(f"Fecha inválida: {s!r}")
    d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
    return datetime(y, m, d, 12, 0, 0, tzinfo=timezone.utc)


def _normalize_celular(raw: str) -> str:
    c = re.sub(r"\D", "", (raw or "").strip())[:20]
    return c or "0"


def _normalize_hora(raw: str) -> str:
    h = (raw or "").strip()
    return h[:10] if len(h) > 10 else h


def _normalize_estado(raw: str) -> str:
    e = (raw or "").strip().lower()
    return e if e in ("pendiente", "atendido") else "pendiente"


def _normalize_razon(raw: str) -> str | None:
    t = (raw or "").strip()
    if not t or t.upper() == "N/A":
        return None
    return t[:200]


def parse_personas_count(raw: str) -> int:
    """Convierte texto tipo '20-30', '15 a 20 personas', '80-90' o número a entero >= 1."""
    s = (raw or "").strip().lower()
    nums = [int(x) for x in re.findall(r"\d+", s)]
    if not nums:
        return 1
    if "-" in s or " a " in s or "–" in s:
        return max(1, sum(nums) // len(nums))
    return max(1, nums[0])


def _reserva_key(d: dict[str, Any]) -> tuple:
    return (
        d["nombres"].strip(),
        d["celular"].strip(),
        d["fecha_reserva"].strip(),
        d["hora_reserva"].strip(),
        d["cantidad_personas"],
    )


def _evento_key(d: dict[str, Any]) -> tuple:
    return (
        d["nombres"].strip(),
        d["celular"].strip(),
        d["tipo_evento"].strip(),
        d["fecha_tentativa"].strip(),
        d["cantidad_personas"],
        d["razon_social"] or "",
    )


def _parse_reserva_rows(tsv: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in tsv.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 7:
            continue
        fc_s, nombres, cel, cp_raw, fr, hr, est = parts[:7]
        out.append(
            {
                "fecha_creacion": _parse_ddmmyyyy(fc_s),
                "nombres": nombres.strip()[:200],
                "celular": _normalize_celular(cel),
                "cantidad_personas": parse_personas_count(cp_raw),
                "fecha_reserva": fr.strip()[:20],
                "hora_reserva": _normalize_hora(hr),
                "estado": _normalize_estado(est),
            }
        )
    return out


def _parse_evento_rows(tsv: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in tsv.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 8:
            continue
        fc_s, nombres, razon, cel, tipo, cp_raw, ft, est = parts[:8]
        razon_n = _normalize_razon(razon)
        tipo_t = (tipo or "").strip()
        if tipo_t not in ("Social", "Corporativo", "Fiestas Infantiles"):
            tipo_t = "Social"
        out.append(
            {
                "fecha_creacion": _parse_ddmmyyyy(fc_s),
                "nombres": nombres.strip()[:200],
                "razon_social": razon_n,
                "celular": _normalize_celular(cel),
                "tipo_evento": tipo_t[:50],
                "cantidad_personas": parse_personas_count(str(cp_raw)),
                "fecha_tentativa": ft.strip()[:20],
                "estado": _normalize_estado(est),
            }
        )
    return out


def seed_comercial_batch_if_missing(db: Session) -> tuple[int, int]:
    """
    Inserta reservas y eventos del TSV que no existan (misma clave lógica).
    Retorna (insertadas_reservas, insertadas_eventos).
    """
    reserva_rows = _parse_reserva_rows(RESERVAS_TSV)
    evento_rows = _parse_evento_rows(EVENTOS_TSV)

    res_existing = {
        (
            str(r.nombres or "").strip(),
            str(r.celular or "").strip(),
            str(r.fecha_reserva or "").strip(),
            str(r.hora_reserva or "").strip(),
            int(r.cantidad_personas or 0),
        )
        for r in db.query(ComercialReserva).with_entities(
            ComercialReserva.nombres,
            ComercialReserva.celular,
            ComercialReserva.fecha_reserva,
            ComercialReserva.hora_reserva,
            ComercialReserva.cantidad_personas,
        ).all()
    }

    ev_existing = {
        (
            str(r.nombres or "").strip(),
            str(r.celular or "").strip(),
            str(r.tipo_evento or "").strip(),
            str(r.fecha_tentativa or "").strip(),
            int(r.cantidad_personas or 0),
            str(r.razon_social or "")[:200],
        )
        for r in db.query(ComercialEvento).with_entities(
            ComercialEvento.nombres,
            ComercialEvento.celular,
            ComercialEvento.tipo_evento,
            ComercialEvento.fecha_tentativa,
            ComercialEvento.cantidad_personas,
            ComercialEvento.razon_social,
        ).all()
    }

    to_res: list[ComercialReserva] = []
    seen_r: set[tuple] = set(res_existing)
    for d in reserva_rows:
        k = _reserva_key(d)
        if k in seen_r:
            continue
        seen_r.add(k)
        to_res.append(
            ComercialReserva(
                fecha_creacion=d["fecha_creacion"],
                nombres=d["nombres"],
                celular=d["celular"],
                cantidad_personas=d["cantidad_personas"],
                fecha_reserva=d["fecha_reserva"],
                hora_reserva=d["hora_reserva"],
                estado=d["estado"],
            )
        )

    to_ev: list[ComercialEvento] = []
    seen_e: set[tuple] = set(ev_existing)
    for d in evento_rows:
        k = _evento_key(d)
        if k in seen_e:
            continue
        seen_e.add(k)
        to_ev.append(
            ComercialEvento(
                fecha_creacion=d["fecha_creacion"],
                nombres=d["nombres"],
                razon_social=d["razon_social"],
                celular=d["celular"],
                tipo_evento=d["tipo_evento"],
                cantidad_personas=d["cantidad_personas"],
                fecha_tentativa=d["fecha_tentativa"],
                estado=d["estado"],
            )
        )

    n_r, n_e = len(to_res), len(to_ev)
    if to_res:
        db.add_all(to_res)
    if to_ev:
        db.add_all(to_ev)
    if to_res or to_ev:
        db.commit()

    return (n_r, n_e)
