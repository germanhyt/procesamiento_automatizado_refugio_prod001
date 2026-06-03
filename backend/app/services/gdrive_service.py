import io
import os
import logging
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload

logger = logging.getLogger(__name__)

class GDriveService:
    def __init__(self, credentials_path: str):
        self.scopes = ['https://www.googleapis.com/auth/drive']
        self.creds = service_account.Credentials.from_service_account_file(
            credentials_path, scopes=self.scopes
        )
        self.service = build('drive', 'v3', credentials=self.creds)

    def download_file(self, file_id: str, local_path: str) -> bool:
        """
        Descarga un archivo desde Google Drive a una ruta local.
        Si el ID es una Google Sheet nativa, exporta a .xlsx (get_media devuelve contenido inválido).
        """
        if not (file_id or "").strip():
            logger.error("download_file: file_id vacío")
            return False
        try:
            meta = (
                self.service.files()
                .get(fileId=file_id, fields="mimeType,name,size")
                .execute()
            )
            mime = (meta.get("mimeType") or "").strip()
            name = meta.get("name") or file_id
            logger.info("Drive download: name=%s mime=%s -> %s", name, mime, local_path)

            if mime == "application/vnd.google-apps.spreadsheet":
                request = self.service.files().export_media(
                    fileId=file_id,
                    mimeType=(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    ),
                )
            else:
                request = self.service.files().get_media(fileId=file_id)

            os.makedirs(os.path.dirname(os.path.abspath(local_path)) or ".", exist_ok=True)
            with open(local_path, "wb") as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()

            size = os.path.getsize(local_path)
            if size < 128:
                logger.error(
                    "Descarga inválida (archivo demasiado pequeño: %s bytes) id=%s mime=%s",
                    size,
                    file_id,
                    mime,
                )
                return False
            logger.info("Archivo %s descargado en %s (%s bytes)", file_id, local_path, size)
            return True
        except Exception as e:
            logger.error(f"Error descargando {file_id}: {str(e)}")
            return False

    def update_file(self, file_id: str, local_path: str) -> bool:
        """Sobrescribe un archivo existente en Google Drive con un archivo local."""
        try:
            media = MediaFileUpload(local_path, resumable=True)
            self.service.files().update(
                fileId=file_id,
                media_body=media
            ).execute()
            logger.info(f"Archivo {file_id} actualizado desde {local_path}")
            return True
        except Exception as e:
            logger.error(f"Error actualizando {file_id}: {str(e)}")
            return False

    def list_files_in_folder(self, folder_id: str, mime_type: str = None) -> list:
        """Lista los archivos dentro de una carpeta de Drive."""
        results = []
        try:
            query = f"'{folder_id}' in parents and trashed = false"
            if mime_type:
                query += f" and mimeType='{mime_type}'"
            
            page_token = None
            while True:
                response = self.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, modifiedTime, size)',
                    pageToken=page_token
                ).execute()
                
                results.extend(response.get('files', []))
                page_token = response.get('nextPageToken', None)
                if page_token is None:
                    break
            return results
        except Exception as e:
            logger.error(f"Error listando archivos en {folder_id}: {str(e)}")
            return []

    def trash_file(self, file_id: str) -> bool:
        """Mueve un archivo a la papelera en Google Drive."""
        try:
            body = {'trashed': True}
            self.service.files().update(fileId=file_id, body=body).execute()
            logger.info(f"Archivo {file_id} movido a la papelera")
            return True
        except Exception as e:
            logger.error(f"Error moviendo a papelera {file_id}: {str(e)}")
            return False

    def get_or_create_folder(self, folder_name: str, parent_folder_id: str) -> str:
        """Obtiene el ID de una subcarpeta, si no existe la crea."""
        try:
            query = f"name='{folder_name}' and '{parent_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
            response = self.service.files().list(
                q=query, spaces='drive', fields='files(id, name)'
            ).execute()
            files = response.get('files', [])
            
            if files:
                return files[0]['id']
            
            # Crear si no existe
            file_metadata = {
                'name': folder_name,
                'mimeType': 'application/vnd.google-apps.folder',
                'parents': [parent_folder_id]
            }
            folder = self.service.files().create(body=file_metadata, fields='id').execute()
            return folder.get('id')
        except Exception as e:
            logger.error(f"Error gestionando carpeta {folder_name}: {str(e)}")
            return None

    def move_file(self, file_id: str, old_parent_id: str, new_parent_id: str) -> bool:
        """Mueve un archivo de una carpeta a otra en Drive."""
        try:
            # Primero obtenemos los padres actuales si no los sabemos
            if not old_parent_id:
                file_obj = self.service.files().get(fileId=file_id, fields='parents').execute()
                old_parent_id = ",".join(file_obj.get('parents', []))
                
            self.service.files().update(
                fileId=file_id,
                addParents=new_parent_id,
                removeParents=old_parent_id,
                fields='id, parents'
            ).execute()
            logger.info(f"Archivo {file_id} movido a {new_parent_id}")
            return True
        except Exception as e:
            logger.error(f"Error moviendo archivo {file_id}: {str(e)}")
            return False

    def upload_new_file(self, local_path: str, file_name: str, parent_folder_id: str, mime_type: str = None) -> str:
        """Sube un archivo nuevo a drive"""
        try:
            file_metadata = {
                'name': file_name,
                'parents': [parent_folder_id]
            }
            media = MediaFileUpload(local_path, mimetype=mime_type, resumable=True)
            file = self.service.files().create(
                body=file_metadata, media_body=media, fields='id'
            ).execute()
            return file.get('id')
        except Exception as e:
            logger.error(f"Error subiendo nuevo archivo {file_name}: {str(e)}")
            return None
