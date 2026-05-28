# -*- coding: utf-8 -*-
"""Constantes del módulo Agenda Deportiva (cartelera)."""

AGENDA_MODO_DAY = "DAY"
AGENDA_MODO_WEEK = "WEEK"
AGENDA_MODOS = frozenset({AGENDA_MODO_DAY, AGENDA_MODO_WEEK})

PERMISSION_AGENDA_VIEW = "agenda_deportiva:view"
PERMISSION_AGENDA_MANAGE = "agenda_deportiva:manage"

FILE_STORE_AGENDA = "agenda_deportiva"
FILE_STORE_AGENDA_SLIDES = "slides"
FILE_STORE_AGENDA_MUSIC = "music"

AGENDA_SLIDE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
AGENDA_SLIDE_MAX_SIZE_MB = 10

AGENDA_MUSIC_EXTENSIONS = frozenset({".mp3", ".mpeg", ".wav", ".ogg", ".m4a"})
AGENDA_MUSIC_MAX_SIZE_MB = 25

# Valor sugerido para `client_max_body_size` en Nginx del API (≥ max(slide, music)).
AGENDA_NGINX_CLIENT_MAX_BODY_MB = 30

AGENDA_ARCHIVO_TIPO_SLIDE = "slide"
AGENDA_ARCHIVO_TIPO_MUSIC = "music"
AGENDA_ARCHIVO_TIPOS = frozenset({AGENDA_ARCHIVO_TIPO_SLIDE, AGENDA_ARCHIVO_TIPO_MUSIC})
