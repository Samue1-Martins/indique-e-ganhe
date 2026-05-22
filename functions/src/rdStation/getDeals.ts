import { onRequest } from "firebase-functions/https";
import { getValidAccessToken } from "../auth/rdAuth";
import axios from "axios";

export const getRDDeals = onRequest(
  { 
    region: "southamerica-east1",
    secrets: ["RD_ID_CLIENT", "RD_ID_SECRET"] 
  },
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
