import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import Swal from "sweetalert2";
import { generateSecureToken } from './tokenUtils';

/**
 * Creates linked Contract, Invoice, and Job Folder from a Bid
 * WITH DUPLICATE PREVENTION - checks if customer already has active contract
 * Phase 2C: Added skipDuplicateCheck for auto-creation from signing page
 * Phase 2D: Removed hard customerId block — warns and continues without it
 * @param {object} bid - The bid object from Firestore
 * @param {boolean} skipDuplicateCheck - Skip duplicate check when called from signing page
 * @returns {Promise<object>} - { contractId, invoiceId, jobId } or null if cancelled
 */
export async function createFullJobPackage(bid, skipDuplicateCheck = false) {
  const customerName = bid.customerName || "Unnamed Client";
  
  // 🛡️ CHECK FOR EXISTING CONTRACTS (skip when called from signing page)
  if (!skipDuplicateCheck) {
    try {
      const contractsQuery = query(
        collection(db, "contracts"),
        where("clientName", "==", customerName)
      );
      const existingContracts = await getDocs(contractsQuery);
      
      if (!existingContracts.empty) {
        const existingContract = existingContracts.docs[0];
        const contractData = existingContract.data();
        
        const result = await Swal.fire({
          title: `${customerName} Already Has a Contract!`,
          html: `
            <div style="text-align: left; margin: 20px 0;">
              <p><strong>Existing Contract:</strong></p>
              <ul>
                <li>Status: ${contractData.status || "Pending"}</li>
                <li>Amount: $${contractData.amount || 0}</li>
                <li>Description: ${contractData.description || "N/A"}</li>
              </ul>
              <p style="margin-top: 20px;"><strong>What would you like to do?</strong></p>
            </div>
          `,
          icon: "question",
          showDenyButton: true,
          showCancelButton: true,
          confirmButtonText: "Open Existing Contract",
          denyButtonText: "Create New Package Anyway",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#2196f3",
          denyButtonColor: "#ff9800",
        });
        
        if (result.isConfirmed) {
          window.location.assign(`/contract/${existingContract.id}`);
          return null;
        } else if (result.isDenied) {
          // Continue with creation below
        } else {
          return null;
        }
      }
    } catch (error) {
      console.error("Error checking for existing contracts:", error);
      // Continue with creation if check fails
    }
  }
  
  // 📦 CREATE NEW JOB PACKAGE
  const jobId = crypto.randomUUID();
  const customerId = bid.customerId || null;

  // ⚠️ Phase 2D: Soft warning only — missing customerId means no address auto-fill
  // but we still create the full package so nothing is lost.
  if (!customerId) {
    console.warn("WARNING: Bid has no customerId — job package will be created without customer link.", bid);
  }

  const base = {
    jobId,
    customerId,
    bidId: bid.id || null,
    clientName: customerName,
    customerEmail: bid.customerEmail || "",
    customerPhone: bid.customerPhone || "",
    customerAddress: bid.customerAddress || "",
    amount: bid.amount || 0,
    description: bid.description || "",
    materials: bid.materials || "",
    notes: bid.notes || "",
    createdAt: serverTimestamp(),
    status: "Pending",
  };

  // 1️⃣ Contract
  const contractRef = await addDoc(collection(db, "contracts"), {
    ...base,
    type: "contract",
    signingToken: generateSecureToken(),
  });

  // 2️⃣ Invoice
  const invoiceRef = await addDoc(collection(db, "invoices"), {
    ...base,
    type: "invoice",
    subtotal: bid.amount || 0,
    tax: 0,
    total: bid.amount || 0,
    paymentToken: generateSecureToken(),
  });

  // 3️⃣ Job folder placeholder
  const jobRef = await addDoc(collection(db, "jobs"), {
    ...base,
    type: "job",
    photos: [],
  });

  return {
    contractId: contractRef.id,
    invoiceId: invoiceRef.id,
    jobId: jobRef.id,
  };
}