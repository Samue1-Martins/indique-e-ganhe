import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/https";

const db = getFirestore();

export async function getValidAccessToken(): Promise<string> {
  try {
    const credentialsRef = db.collection("settings").doc("rd_station_creds");
    const documentSnapshot = await credentialsRef.get();

    if (!documentSnapshot.exists) {
      throw new Error("Credentials not found in database.");
    }

    const data = documentSnapshot.data();
    const { access_token, refresh_token, expires_at } = data || {};

    const timeMargin = 15 * 60 * 1000;

    if (expires_at && Date.now() < expires_at - timeMargin) {
      return access_token;
    }

    try {
      const payload = new URLSearchParams({
        client_id: process.env.RD_ID_CLIENT?.trim() || "",
        client_secret: process.env.RD_ID_SECRET?.trim() || "",
        refresh_token: refresh_token,
        grant_type: "refresh_token"
      });

      const response = await axios.post("https://api.rd.services/oauth2/token", payload, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      const {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in
      } = response.data;

      const newExpiresAt = Date.now() + (expires_in * 1000);

      await credentialsRef.update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
        updated_at: FieldValue.serverTimestamp()
      });

      return newAccessToken;
      
    } catch (apiError: any) {
      throw new Error(apiError.response?.data?.error_description || apiError.message);
    }
  } catch (globalError: any) {
    throw new Error(globalError.message);
  }
}

export const rdAuth = onRequest(
  { 
    region: "southamerica-east1",
    secrets: ["RD_ID_CLIENT", "RD_ID_SECRET"] 
  },
  async (request, response) => {
    const code = request.query.code as string;

    if (!code) {
      response.status(400).send("Código ausente. Você acessou a URL direto sem passar pela autorização da RD?");
      return;
    }

    try {
      const tokenResponse = await axios.post("https://api.rd.services/oauth2/token", {
        client_id: process.env.RD_ID_CLIENT?.trim(),
        client_secret: process.env.RD_ID_SECRET?.trim(),
        code: code,
        grant_type: "authorization_code",
        redirect_uri: "https://southamerica-east1-indique-e-ganhe-27a51.cloudfunctions.net/rdAuth"
      });

      const data = tokenResponse.data;

      await db.collection("settings").doc("rd_station_creds").set({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in * 1000),
        updated_at: new Date().toISOString()
      });

      response.status(200).send("<h1>Autenticado com Sucesso!</h1><p>Olhe seu Firestore agora.</p>");

    } catch (error: any) {
      console.error("Erro capturado:", error);
      
      let mensagemErro = error.message;
      
      if (error.response) {
        mensagemErro = JSON.stringify(error.response.data);
      }

      response.status(500).send(`
        <h2>Ocorreu um Erro Interno</h2>
        <p><b>Motivo:</b> ${mensagemErro}</p>
        <p>Verifique o terminal rodando <code>firebase functions:log</code> para mais detalhes.</p>
      `);
    }
  }
);