// src/utils/checkDuplicateCustomer.js
// Shared duplicate detection — used by CustomerEditor AND CreateBid
//
// HARD BLOCK  → same email or same phone (must resolve, cannot proceed)
// SOFT WARNING → same name or same address (warned, can override)
//
// Usage:
//   const dupes = await checkDuplicateCustomer(db, { name, phone, email, address }, excludeId);
//   const action = await showDuplicateDialog(dupes, navigate);
//   if (action === 'block' || action === 'cancel') return;
//   // action === 'proceed' → continue saving

import { collection, query, where, getDocs } from "firebase/firestore";
import Swal from "sweetalert2";

/**
 * Query Firestore for potential duplicate customers.
 * @param {object} db        - Firestore db instance
 * @param {object} fields    - { name, phone, email, address }
 * @param {string} excludeId - Pass current customer ID when editing (skip self-match)
 * @returns {{ hardBlocks: [], softWarnings: [] }}
 */
export async function checkDuplicateCustomer(db, { name, phone, email, address }, excludeId = null) {
  const customersRef = collection(db, "customers");
  const hardBlocks   = [];
  const softWarnings = [];
  const seenIds      = new Set();

  const runQuery = async (field, value, bucket, matchLabel) => {
    if (!value?.trim()) return;
    try {
      const snap = await getDocs(query(customersRef, where(field, "==", value.trim())));
      snap.forEach((docSnap) => {
        if (docSnap.id === excludeId) return; // skip self when editing
        if (seenIds.has(docSnap.id)) {
          // Already found via another field — just add the extra label
          const existing = [...hardBlocks, ...softWarnings].find(d => d.id === docSnap.id);
          if (existing && !existing.matchLabels.includes(matchLabel)) {
            existing.matchLabels.push(matchLabel);
          }
          return;
        }
        seenIds.add(docSnap.id);
        bucket.push({ id: docSnap.id, ...docSnap.data(), matchLabels: [matchLabel] });
      });
    } catch (err) {
      console.error(`Duplicate check error (${field}):`, err);
    }
  };

  // Run all four checks in parallel
  await Promise.all([
    runQuery("email",   email,   hardBlocks,   "email address"),
    runQuery("phone",   phone,   hardBlocks,   "phone number"),
    runQuery("nameLower", name.toLowerCase(), softWarnings, "name"),
    runQuery("address", address, softWarnings, "address"),
  ]);

  // If a soft-warning record ALSO matched a hard-block field, promote it
  const finalSoft = [];
  softWarnings.forEach((sw) => {
    const alreadyHard = hardBlocks.find(hb => hb.id === sw.id);
    if (alreadyHard) {
      sw.matchLabels.forEach(l => {
        if (!alreadyHard.matchLabels.includes(l)) alreadyHard.matchLabels.push(l);
      });
    } else {
      finalSoft.push(sw);
    }
  });

  return { hardBlocks, softWarnings: finalSoft };
}

/**
 * Show the appropriate SweetAlert dialog based on duplicate results.
 * @param {{ hardBlocks, softWarnings }} duplicates
 * @param {function} navigate - react-router navigate
 * @returns {string} 'block' | 'cancel' | 'proceed'
 */
export async function showDuplicateDialog({ hardBlocks, softWarnings }, navigate) {

  // ── HARD BLOCK ─────────────────────────────────────────────────────────────
  if (hardBlocks.length > 0) {
    const dup = hardBlocks[0];
    const matchText = dup.matchLabels.join(" and ");

    const result = await Swal.fire({
      icon: "error",
      title: "Duplicate Customer Detected",
      html: `
        <div style="text-align:left">
          <p>A customer with the same <strong>${matchText}</strong> already exists.</p>
          <p style="font-size:12px;color:#c62828;margin-bottom:12px;">
            ⚠️ Email and phone must be unique — they route signing links and Pushover notifications.
          </p>
          <div style="background:#fff3f3;border:1px solid #ffcdd2;padding:14px;border-radius:8px;margin-bottom:12px">
            <p style="margin:4px 0"><strong>${dup.name || "—"}</strong></p>
            ${dup.phone   ? `<p style="margin:4px 0;font-size:13px">📞 ${dup.phone}</p>` : ""}
            ${dup.email   ? `<p style="margin:4px 0;font-size:13px">✉️ ${dup.email}</p>` : ""}
            ${dup.address ? `<p style="margin:4px 0;font-size:13px">📍 ${dup.address}</p>` : ""}
          </div>
          <p>Use the existing customer record or update it instead of creating a duplicate.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "View Existing Customer",
      cancelButtonText: "Go Back",
      confirmButtonColor: "#1565c0",
      cancelButtonColor: "#757575",
    });

    if (result.isConfirmed) navigate(`/customer/${dup.id}`);
    return "block"; // always block regardless — user must resolve the conflict
  }

  // ── SOFT WARNING ───────────────────────────────────────────────────────────
  if (softWarnings.length > 0) {
    const dup = softWarnings[0];
    const matchText = dup.matchLabels.join(" and ");

    const result = await Swal.fire({
      icon: "warning",
      title: "Possible Duplicate",
      html: `
        <div style="text-align:left">
          <p>A customer with the same <strong>${matchText}</strong> already exists:</p>
          <div style="background:#fff8e1;border:1px solid #ffe082;padding:14px;border-radius:8px;margin:12px 0">
            <p style="margin:4px 0"><strong>${dup.name || "—"}</strong></p>
            ${dup.phone   ? `<p style="margin:4px 0;font-size:13px">📞 ${dup.phone}</p>` : ""}
            ${dup.email   ? `<p style="margin:4px 0;font-size:13px">✉️ ${dup.email}</p>` : ""}
            ${dup.address ? `<p style="margin:4px 0;font-size:13px">📍 ${dup.address}</p>` : ""}
          </div>
          <p style="font-size:13px;color:#555">
            Same name or address can be legitimate (family members, multiple units at one address).
            You can proceed if this is a different person.
          </p>
        </div>
      `,
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: "View Existing Customer",
      denyButtonText:    "Create Anyway",
      cancelButtonText:  "Go Back",
      confirmButtonColor: "#1565c0",
      denyButtonColor:    "#e65100",
      cancelButtonColor:  "#757575",
    });

    if (result.isConfirmed) {
      navigate(`/customer/${dup.id}`);
      return "block";
    }
    if (result.isDenied) return "proceed";
    return "cancel";
  }

  // No duplicates at all
  return "proceed";
}