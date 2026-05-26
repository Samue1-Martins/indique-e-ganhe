import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "../config/firebase";

export const webHookRd = onRequest(
    {
        region: "southamerica-east1",
        secrets: ["RD_WEBHOOK_TOKEN"]
    },
    async (request, response) => {
        if (request.method !== "POST") {
            response.status(405).send("Method Not Allowed");
            return;
        }

        const providedToken = request.headers["gula-menu-token"];
        const expectedToken = process.env.RD_WEBHOOK_TOKEN?.trim();

        if (providedToken !== expectedToken) {
            response.status(401).send("Unauthorized");
            return;
        }

        const payload = request.body;

        if (payload.event_name !== "crm_deal_updated" || !payload.document) {
            response.status(200).send("Ignorado: Evento não monitorado.");
            return;
        }

        const rdDealId = payload.document.id;
        const dealStatus = payload.document.status;
        const dealStageName = payload.document?.deal_stage?.name;

        try {

            const referralsRef = db.collection("referrals");
            const querySnapshot = await referralsRef.where("rdDealId", "==", rdDealId).get();

            if (querySnapshot.empty) {
                response.status(200).send("Card não pertence ao App Gula.");
                return;
            }

            const docRef = querySnapshot.docs[0].ref;

            const updateData: Record<string, any> = {
                updatedAt: FieldValue.serverTimestamp()
            };

            if (dealStageName) {
                updateData.currentStage = dealStageName;
            }

            if (dealStatus === "won") {
                updateData.status = "won";
                updateData.paymentStatus = "pending_payment";
            } else if (dealStatus === "lost") {
                updateData.status = "lost";
                updateData.paymentStatus = "ineligible";
            } else if (dealStatus === "ongoing") {
                updateData.status = "open";
                updateData.paymentStatus = "ineligible"; 
            }

            await docRef.update(updateData);
            response.status(200).send("Comissão liberada com sucesso no Firebase!");

        } catch (error: any) {
            console.error("Erro interno ao atualizar o Firestore:", error);
            response.status(500).send("Erro interno ao processar a comissão.");
        }
    }
);