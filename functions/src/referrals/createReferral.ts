import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../config/firebase";
import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { getValidAccessToken } from "../auth/rdAuth";

export const createReferral = onCall(
  {
    region: "southamerica-east1",
    secrets: [
      "RD_CLIENT_ID", "RD_CLIENT_SECRET", "STAGE_ID", "RD_OWNER_ID",
    ]
  },
  async (request) => {
    try {
      const {
        userId,
        referrerName,
        pixKey,
        restaurantName,
        ownerName,
        ownerPhone,
        city,
        state
      } = request.data;

      if (!userId || !restaurantName || !ownerPhone || !state) {
        throw new HttpsError("invalid-argument", "Missing required payload data.");
      }

      const accessToken = await getValidAccessToken();
      const stageId = process.env.STAGE_ID;
      const ownerId = process.env.RD_OWNER_ID;

      if(!stageId || !ownerId) {
        throw new HttpsError("internal", "Stage ID or Owner ID not found in environment variables.");
      }

      const axiosConfig = {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        }
      };

      let rdContactId = "";

      const contactPayload = {
        data: {
          name: ownerName || "Contato sem nome", 
          phones: [
            {
              phone: ownerPhone,
              type: "work"
            }
          ]
        }
      };
      

      try {
        const contactResponse = await axios.post(
          "https://api.rd.services/crm/v2/contacts",
          contactPayload,
          axiosConfig
        );
        rdContactId = contactResponse.data.data.id;
      } catch (apiError: any) {
        throw new HttpsError("internal", "Falha ao criar o contato no CRM da RD.");
      }

      let rdDealId = "";

      const testCustomFields = {
        estado: state 
      };

      console.log("📦 ENVIANDO PARA RD:", JSON.stringify(testCustomFields));

      const rdDealPayload = {
        data: {
          name: `[Teste] Indicação: ${restaurantName}`,
          stage_id: stageId,
          owner_id: ownerId,
          status: "ongoing",
          contact_ids: [rdContactId],
          custom_fields: testCustomFields
        }
      };

      try {
        const dealResponse = await axios.post(
          "https://api.rd.services/crm/v2/deals",
          rdDealPayload,
          axiosConfig
        );

        rdDealId = dealResponse.data.data.id;
        console.log(`✅ Negociação criada e vinculada com sucesso! ID: ${rdDealId}`);
      } catch (apiError: any) {
        const errorRD = apiError.response?.data;
        console.error("⛔ ERRO DA RD STATION:", JSON.stringify(errorRD, null, 2));
        
        throw new HttpsError(
          "internal",
          `Falha ao criar o negócio no CRM. Detalhes no log do Firebase.`
        );
      }

      const newReferralRef = db.collection("referrals").doc();

      try {
        await newReferralRef.set({
          id: newReferralRef.id,
          userId: userId,
          referrerName: referrerName,
          pixKey: pixKey,
          restaurantName: restaurantName,
          ownerName: ownerName,
          ownerPhone: ownerPhone,
          city: city || "",
          state: state,
          rdDealId: rdDealId,           
          rdContactId: rdContactId,     
          status: "ongoing",
          paymentStatus: "ineligible",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (dbError: any) {
        throw new HttpsError("internal", `Database Error: ${dbError.message}`);
      }

      return {
        success: true,
        referralId: newReferralRef.id,
        rdDealId: rdDealId,
        rdContactId: rdContactId
      };
    } catch (globalError: any) {
      if (globalError instanceof HttpsError) {
        throw globalError;
      }
      throw new HttpsError("internal", `Unexpected Error: ${globalError.message}`);
    }
  }
);