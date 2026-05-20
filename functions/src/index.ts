import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import  axios from "axios";

initializeApp();
const db = getFirestore();

export async function getValidAccessToken() {
  const credsRef = db.collection("settings").doc("rd_station_creds");
  const doc = await credsRef.get();

  if (!doc.exists) throw new Error("Integração com RD não configurada no Firestore.");

  const data = doc.data()!;
  const now = Date.now();

  if (now < data.expires_at - 300000) {
    return data.access_token;
  }

  const response = await axios.post("https://api.rd.services/oauth2/token", {
    client_id: process.env.RD_ID_CLIENT?.trim(),
    client_secret: process.env.RD_ID_SECRET?.trim(),
    refresh_token: data.refresh_token,
    grant_type: "refresh_token",
  });

  const newData = response.data;

  if (response.status !== 200) {
    throw new Error(`Erro ao renovar token: ${JSON.stringify(newData)}`);
  }

  await credsRef.update({
    access_token: newData.access_token,
    refresh_token: newData.refresh_token,
    expires_at: Date.now() + (newData.expires_in * 1000),
    updated_at: new Date().toISOString()
  });

  return newData.access_token;
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

export const testarChaves = onRequest(
  { 
    region: "southamerica-east1",
    secrets: ["RD_ID_CLIENT", "RD_ID_SECRET"] 
  },
  (request, response) => {
    const id = process.env.RD_ID_CLIENT;
    const secret = process.env.RD_ID_SECRET;

    if (id && secret) {
      // Mostra só os 5 primeiros caracteres para a gente saber que leu, sem expor tudo
      response.status(200).send(`
        <h1>Sucesso Absoluto!</h1>
        <p>O Firebase conseguiu ler as secrets!</p>
        <p>Client ID começa com: ${id.substring(0, 5)}...</p>
      `);
    } else {
      response.status(500).send(`
        <h1>Falha nas Permissões</h1>
        <p>O Firebase NÃO conseguiu ler as secrets.</p>
        <p>Client ID lido: ${id}</p>
        <p>Client Secret lido: ${secret}</p>
      `);
    }
  }
);

export const getRDDeals = onRequest(
  { region: "southamerica-east1" },
  async (request, response) => {
  try {
    const token = await getValidAccessToken();

    const rdResponse = await axios.get("https://api.rd.services/crm/v2/deals", {
      params: {
        "page[number]": 1,
        "page[size]": 25
      },
      headers: {
        "accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    response.status(200).json(rdResponse.data);

  } catch (error: any) {
    console.error("Erro ao buscar negócios:", error.response?.data || error.message);
    response.status(500).send("Erro ao comunicar com a RD Station.");
  }
});