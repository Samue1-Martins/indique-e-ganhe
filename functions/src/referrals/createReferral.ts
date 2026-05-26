import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../config/firebase";
import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { getValidAccessToken } from "../auth/rdAuth";

export const createReferral = onCall(
  {
    region: "southamerica-east1",
    secrets: ["RD_CLIENT_ID", "RD_CLIENT_SECRET", "STAGE_ID", "RD_OWNER_ID"]
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
        city
      } = request.data;

      if (!userId || !restaurantName || !ownerPhone) {
        throw new HttpsError("invalid-argument", "Missing required payload data.");
      }

      const accessToken = await getValidAccessToken();

      const stageId = process.env.STAGE_ID;
      const ownerId = process.env.RD_OWNER_ID;

      if(!stageId || !ownerId) {
        throw new HttpsError("internal", "Stage ID or Owner ID not found in environment variables.");
      }

      const rdPayload = {
        data: {
          name: `[Teste] Indicação: ${restaurantName}`,
          stage_id: stageId,
          owner_id: ownerId,
          status: "ongoing",
          custom_fields: {
            referrer_name: referrerName,
            owner_name: ownerName,
            owner_phone: ownerPhone,
            city: city
          }
        }
      };

      let rdDealId = "";

      try {
        const rdResponse = await axios.post(
          "https://api.rd.services/crm/v2/deals",
          rdPayload,
          {
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`
            }
          }
        );

        rdDealId = rdResponse.data.data.id;
      } catch (apiError: any) {
        const erroExatoDaRD = apiError.response?.data;
        console.error("⛔ ERRO DA RD STATION:", JSON.stringify(erroExatoDaRD, null, 2));
        
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
          city: city,
          rdDealId: rdDealId,
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
        rdDealId: rdDealId
      };
    } catch (globalError: any) {
      if (globalError instanceof HttpsError) {
        throw globalError;
      }
      throw new HttpsError("internal", `Unexpected Error: ${globalError.message}`);
    }
  }
);