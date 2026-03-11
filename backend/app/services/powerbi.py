import msal
import requests
import os
from dotenv import load_dotenv

load_dotenv("config/.env")

class PowerBIService:
    def __init__(self):
        self.client_id = os.getenv("PBI_CLIENT_ID")
        self.client_secret = os.getenv("PBI_CLIENT_SECRET")
        self.tenant_id = os.getenv("PBI_TENANT_ID")
        self.workspace_id = os.getenv("PBI_WORKSPACE_ID")
        self.report_id = os.getenv("PBI_REPORT_ID")
        self.authority_url = f"https://login.microsoftonline.com/{self.tenant_id}"
        self.scope = ["https://analysis.windows.net/powerbi/api/.default"]

    def get_access_token(self):
        client = msal.ConfidentialClientApplication(
            self.client_id, 
            authority=self.authority_url, 
            client_credential=self.client_secret
        )
        result = client.acquire_token_for_client(scopes=self.scope)
        if "access_token" in result:
            return result["access_token"]
        else:
            raise Exception(f"Could not acquire token: {result.get('error_description')}")

    def get_embed_params(self):
        access_token = self.get_access_token()
        header = {"Authorization": f"Bearer {access_token}"}
        
        # Get report info
        report_url = f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace_id}/reports/{self.report_id}"
        report_response = requests.get(report_url, headers=header)
        report_data = report_response.json()
        
        if report_response.status_code != 200:
            raise Exception(f"Error getting report info: {report_data}")

        embed_url = report_data.get("embedUrl")
        dataset_id = report_data.get("datasetId")

        # Generate Embed Token
        embed_token_url = f"https://api.powerbi.com/v1.0/myorg/groups/{self.workspace_id}/reports/{self.report_id}/GenerateToken"
        body = {"accessLevel": "View"}
        token_response = requests.post(embed_token_url, headers=header, json=body)
        token_data = token_response.json()

        if token_response.status_code != 200:
            raise Exception(f"Error generating embed token: {token_data}")

        return {
            "reportId": self.report_id,
            "embedUrl": embed_url,
            "accessToken": token_data.get("token"),
            "expiry": token_data.get("expiration")
        }
