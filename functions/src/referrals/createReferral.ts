import { onCall, HttpsError } from "firebase-functions/v2/https";
import {db} from "../config/firebase";
import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { getValidAccessToken } from "../auth/rdAuth";

export const createReferral = onCall(
  {
    region: "southamerica-east1",
    secrets: ["RD_CLIENT_ID", "RD_CLIENT_SECRET"]
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

      const rdPayload = {
        name: `Indication: ${restaurantName}`,
        custom_fields: {
          referrer_name: referrerName,
          owner_name: ownerName,
          owner_phone: ownerPhone,
          city: city
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
        throw new HttpsError(
          "internal",
          `CRM API Error: ${apiError.response?.data?.error_description || apiError.message}`
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
          status: "open",
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