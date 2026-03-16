import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Build a confirmation message for cascade cancel operations
 * @param {string} entityName - Name of the customer/client
 * @param {string} startType - Type of entity being cancelled (bid, contract, schedule)
 * @returns {string} - HTML formatted message
 */
export function buildCancelConfirmationMessage(entityName, startType = "job") {
  const entityLabel = startType === "bid" ? "Bid" : 
                      startType === "contract" ? "Contract" : 
                      startType === "schedule" ? "Schedule/Job" : "Job";
  
  return `Cancel all records for <strong>${entityName}</strong>?<br><br>This will cancel:<br>• ${entityLabel}<br>• Contract<br>• Invoice<br>• Bid<br>• Job folder<br>• Any schedules<br><br><em>(Only existing records will be cancelled)</em><br>Records will be preserved for audit purposes.`;
}

/**
 * Cascade cancel a job and all linked records across collections
 * Preserves records for audit/tax purposes by setting status to "cancelled"
 * 
 * @param {string} startCollection - Starting collection: "schedules", "contracts", "invoices", or "bids"
 * @param {string} startDocId - Document ID to start from
 * @returns {Promise<object>} - Result object with success status, cancelled counts, and errors
 */
export async function cascadeCancelJob(startCollection, startDocId) {
  const result = {
    success: true,
    cancelled: {
      bids: [],
      contracts: [],
      invoices: [],
      jobs: [],
      schedules: [],
      equipmentFreed: [],
    },
    errors: [],
  };

  try {
    // Step 1: Get the starting document
    const startDocRef = doc(db, startCollection, startDocId);
    const startDoc = await getDoc(startDocRef);

    if (!startDoc.exists()) {
      result.success = false;
      result.errors.push(`Starting document not found in ${startCollection}`);
      return result;
    }

    const startData = startDoc.data();

    // Skip if already cancelled
    if (startData.status === "cancelled") {
      result.errors.push(`${startCollection} is already cancelled`);
      return result;
    }

    // Step 2: Extract all linked IDs from the starting document
    const linkedIds = {
      bidId: startData.bidId || null,
      contractId: startData.contractId || null,
      invoiceId: startData.invoiceId || null,
      jobId: startData.jobId || null,
      customerId: startData.customerId || null,
    };

    // Step 3: Find all related documents based on starting point
    const collectionsToCancel = {
      bids: [],
      contracts: [],
      invoices: [],
      jobs: [],
      schedules: [],
    };

    // Always cancel the starting document
    collectionsToCancel[startCollection].push(startDocId);

    // Find related documents based on the starting collection
    if (startCollection === "schedules") {
      // Starting from schedule: has contractId, invoiceId, jobId, bidId
      if (linkedIds.contractId) collectionsToCancel.contracts.push(linkedIds.contractId);
      if (linkedIds.invoiceId) collectionsToCancel.invoices.push(linkedIds.invoiceId);
      if (linkedIds.bidId) collectionsToCancel.bids.push(linkedIds.bidId);
      
      // Find job documents by jobId (field, not doc ID)
      if (linkedIds.jobId) {
        const jobsQuery = query(collection(db, "jobs"), where("jobId", "==", linkedIds.jobId));
        const jobsSnapshot = await getDocs(jobsQuery);
        jobsSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.jobs.push(doc.id);
          }
        });
      }
    } else if (startCollection === "contracts") {
      // Starting from contract: has bidId, find invoices and schedules
      if (linkedIds.bidId) {
        collectionsToCancel.bids.push(linkedIds.bidId);
        
        // Find invoices by bidId
        const invoicesQuery = query(collection(db, "invoices"), where("bidId", "==", linkedIds.bidId));
        const invoicesSnapshot = await getDocs(invoicesQuery);
        invoicesSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.invoices.push(doc.id);
          }
        });
      }
      
      // Find schedules by contractId
      const schedulesQuery = query(collection(db, "schedules"), where("contractId", "==", startDocId));
      const schedulesSnapshot = await getDocs(schedulesQuery);
      schedulesSnapshot.docs.forEach(doc => {
        if (doc.data().status !== "cancelled") {
          collectionsToCancel.schedules.push(doc.id);
        }
      });
      
      // Find jobs by jobId
      if (linkedIds.jobId) {
        const jobsQuery = query(collection(db, "jobs"), where("jobId", "==", linkedIds.jobId));
        const jobsSnapshot = await getDocs(jobsQuery);
        jobsSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.jobs.push(doc.id);
          }
        });
      }
    } else if (startCollection === "bids") {
      // Starting from bid: find contracts, invoices, and schedules by bidId
      const contractsQuery = query(collection(db, "contracts"), where("bidId", "==", startDocId));
      const contractsSnapshot = await getDocs(contractsQuery);
      
      for (const contractDoc of contractsSnapshot.docs) {
        if (contractDoc.data().status !== "cancelled") {
          collectionsToCancel.contracts.push(contractDoc.id);
          
          // Find schedules for this contract
          const schedulesQuery = query(collection(db, "schedules"), where("contractId", "==", contractDoc.id));
          const schedulesSnapshot = await getDocs(schedulesQuery);
          schedulesSnapshot.docs.forEach(scheduleDoc => {
            if (scheduleDoc.data().status !== "cancelled") {
              collectionsToCancel.schedules.push(scheduleDoc.id);
            }
          });
        }
      }
      
      // Find invoices by bidId
      const invoicesQuery = query(collection(db, "invoices"), where("bidId", "==", startDocId));
      const invoicesSnapshot = await getDocs(invoicesQuery);
      invoicesSnapshot.docs.forEach(doc => {
        if (doc.data().status !== "cancelled") {
          collectionsToCancel.invoices.push(doc.id);
        }
      });
      
      // Find jobs by jobId (if available from the bid or linked records)
      if (linkedIds.jobId) {
        const jobsQuery = query(collection(db, "jobs"), where("jobId", "==", linkedIds.jobId));
        const jobsSnapshot = await getDocs(jobsQuery);
        jobsSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.jobs.push(doc.id);
          }
        });
      }
    } else if (startCollection === "invoices") {
      // Starting from invoice: has bidId, contractId, find schedules by contractId
      if (linkedIds.bidId) collectionsToCancel.bids.push(linkedIds.bidId);
      if (linkedIds.contractId) collectionsToCancel.contracts.push(linkedIds.contractId);
      
      // Find schedules by contractId
      if (linkedIds.contractId) {
        const schedulesQuery = query(collection(db, "schedules"), where("contractId", "==", linkedIds.contractId));
        const schedulesSnapshot = await getDocs(schedulesQuery);
        schedulesSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.schedules.push(doc.id);
          }
        });
      }
      
      // Find jobs by jobId
      if (linkedIds.jobId) {
        const jobsQuery = query(collection(db, "jobs"), where("jobId", "==", linkedIds.jobId));
        const jobsSnapshot = await getDocs(jobsQuery);
        jobsSnapshot.docs.forEach(doc => {
          if (doc.data().status !== "cancelled") {
            collectionsToCancel.jobs.push(doc.id);
          }
        });
      }
    }

    // Step 4: Cancel all found documents
    const cancelledAtISOString = new Date().toISOString();

    for (const [collectionName, docIds] of Object.entries(collectionsToCancel)) {
      for (const docId of docIds) {
        try {
          // Get the document to check for equipment (for schedules)
          const docRef = doc(db, collectionName, docId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists() && docSnap.data().status !== "cancelled") {
            // Free equipment if this is a schedule
            if (collectionName === "schedules") {
              const scheduleData = docSnap.data();
              if (scheduleData.selectedEquipment && Array.isArray(scheduleData.selectedEquipment)) {
                for (const equipId of scheduleData.selectedEquipment) {
                  try {
                    await updateDoc(doc(db, "equipment", equipId), { status: "available" });
                    result.cancelled.equipmentFreed.push(equipId);
                  } catch (error) {
                    result.errors.push(`Failed to free equipment ${equipId}: ${error.message}`);
                  }
                }
              }
            }
            
            // Cancel the document
            await updateDoc(docRef, {
              status: "cancelled",
              cancelledAt: cancelledAtISOString,
            });
            
            result.cancelled[collectionName].push(docId);
          }
        } catch (error) {
          result.errors.push(`Failed to cancel ${collectionName}/${docId}: ${error.message}`);
        }
      }
    }

    // Check if any documents were actually cancelled (excluding equipmentFreed)
    const totalCancelled = ["bids", "contracts", "invoices", "jobs", "schedules"]
      .reduce((sum, key) => sum + result.cancelled[key].length, 0);

    if (totalCancelled === 0) {
      result.success = false;
      result.errors.push("No documents were cancelled");
    }

  } catch (error) {
    result.success = false;
    result.errors.push(`Cascade cancel failed: ${error.message}`);
  }

  return result;
}

/**
 * Build a summary HTML string for displaying cascade cancel results in SweetAlert2
 * 
 * @param {object} result - Result object from cascadeCancelJob
 * @returns {string} - HTML string for display
 */
export function buildCancelSummary(result) {
  let html = '<div style="text-align: left; margin: 20px 0;">';

  if (!result.success && result.errors.length > 0) {
    html += '<p style="color: #d33; font-weight: bold;">⚠️ Cancellation encountered issues:</p>';
    html += '<ul>';
    result.errors.forEach(error => {
      html += `<li style="color: #666;">${error}</li>`;
    });
    html += '</ul>';
    html += '</div>';
    return html;
  }

  html += '<p style="font-weight: bold; margin-bottom: 15px;">✅ Successfully cancelled:</p>';
  html += '<ul style="margin-bottom: 15px;">';

  if (result.cancelled.bids.length > 0) {
    html += `<li><strong>Bids:</strong> ${result.cancelled.bids.length}</li>`;
  }
  if (result.cancelled.contracts.length > 0) {
    html += `<li><strong>Contracts:</strong> ${result.cancelled.contracts.length}</li>`;
  }
  if (result.cancelled.invoices.length > 0) {
    html += `<li><strong>Invoices:</strong> ${result.cancelled.invoices.length}</li>`;
  }
  if (result.cancelled.jobs.length > 0) {
    html += `<li><strong>Jobs:</strong> ${result.cancelled.jobs.length}</li>`;
  }
  if (result.cancelled.schedules.length > 0) {
    html += `<li><strong>Schedules:</strong> ${result.cancelled.schedules.length}</li>`;
  }
  if (result.cancelled.equipmentFreed.length > 0) {
    html += `<li><strong>Equipment Freed:</strong> ${result.cancelled.equipmentFreed.length}</li>`;
  }

  html += '</ul>';

  if (result.errors.length > 0) {
    html += '<p style="color: #ff9800; font-weight: bold; margin-top: 15px;">⚠️ Warnings:</p>';
    html += '<ul>';
    result.errors.forEach(error => {
      html += `<li style="color: #666;">${error}</li>`;
    });
    html += '</ul>';
  }

  html += '<p style="margin-top: 15px; color: #666; font-size: 0.9em;">All records preserved for audit purposes.</p>';
  html += '</div>';

  return html;
}
